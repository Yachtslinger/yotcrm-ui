import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/campaign/send
 * Sends a campaign email to one or more recipients.
 *
 * Body: {
 *   subject: string
 *   html: string
 *   recipients: Array<{ email: string; name?: string }>
 *   from?: string   // override sender name (defaults to env var or "Will Noftsinger | Denison Yachting")
 *   testMode?: boolean  // if true, only sends to first recipient as a test
 * }
 */

type Recipient = { email: string; name?: string };

interface SendResult {
  email: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

// ── Provider: Resend ────────────────────────────────────────────────────
async function sendViaResend(opts: {
  from: string; to: Recipient; subject: string; html: string; apiKey: string;
}): Promise<string> {
  const toAddress = opts.to.name ? `${opts.to.name} <${opts.to.email}>` : opts.to.email;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [toAddress],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
  const json = await res.json() as { id: string };
  return json.id;
}

// ── Provider: Postmark ─────────────────────────────────────────────────
async function sendViaPostmark(opts: {
  from: string; to: Recipient; subject: string; html: string; token: string;
}): Promise<string> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": opts.token,
    },
    body: JSON.stringify({
      From: opts.from,
      To: opts.to.name ? `${opts.to.name} <${opts.to.email}>` : opts.to.email,
      Subject: opts.subject,
      HtmlBody: opts.html,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok) throw new Error(`Postmark error ${res.status}`);
  const json = await res.json() as { MessageID: string };
  return json.MessageID;
}

// ── Provider: SendGrid ─────────────────────────────────────────────────
async function sendViaSendGrid(opts: {
  from: string; to: Recipient; subject: string; html: string; apiKey: string;
}): Promise<string> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to.email, name: opts.to.name || "" }] }],
      from: { email: opts.from },
      subject: opts.subject,
      content: [{ type: "text/html", value: opts.html }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid error ${res.status}`);
  return res.headers.get("x-message-id") || `sg_${Date.now()}`;
}

// ── Resolve which provider to use ─────────────────────────────────────
async function sendOne(opts: {
  from: string; to: Recipient; subject: string; html: string;
}): Promise<string> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ ...opts, apiKey: process.env.RESEND_API_KEY });
  }
  if (process.env.POSTMARK_SERVER_TOKEN) {
    return sendViaPostmark({ ...opts, token: process.env.POSTMARK_SERVER_TOKEN });
  }
  if (process.env.SENDGRID_API_KEY) {
    return sendViaSendGrid({ ...opts, apiKey: process.env.SENDGRID_API_KEY });
  }
  throw new Error(
    "No email provider configured. Set RESEND_API_KEY, POSTMARK_SERVER_TOKEN, or SENDGRID_API_KEY in Railway environment variables."
  );
}

// ── Main handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      subject: string;
      html: string;
      recipients: Recipient[];
      from?: string;
      testMode?: boolean;
    };

    const { subject, html, recipients, testMode = false } = body;

    if (!subject?.trim()) return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
    if (!html?.trim())    return NextResponse.json({ ok: false, error: "html is required" }, { status: 400 });
    if (!recipients?.length) return NextResponse.json({ ok: false, error: "recipients is required" }, { status: 400 });

    const fromName = body.from || process.env.CAMPAIGN_FROM_NAME || "Will Noftsinger | Denison Yachting";
    const fromEmail = process.env.CAMPAIGN_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "will@denisonyachting.com";
    const from = `${fromName} <${fromEmail}>`;

    // In test mode, only send to the first recipient
    const targets = testMode ? [recipients[0]] : recipients;

    const results: SendResult[] = [];
    const BATCH_SIZE = 20; // Pro plan supports higher throughput
    const DELAY_MS = 100;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(to => sendOne({ from, to, subject, html }))
      );
      for (let j = 0; j < batch.length; j++) {
        const r = batchResults[j];
        if (r.status === "fulfilled") {
          results.push({ email: batch[j].email, ok: true, messageId: r.value });
        } else {
          results.push({ email: batch[j].email, ok: false, error: r.reason?.message || "Failed" });
        }
      }
      // Throttle between batches
      if (i + BATCH_SIZE < targets.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      total: targets.length,
      testMode,
      results: failed > 0 ? results : undefined, // only include detail if there were failures
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/campaign/send]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
