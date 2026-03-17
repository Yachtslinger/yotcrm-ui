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

// ── Provider: Resend — single email ────────────────────────────────────
async function sendViaResend(opts: {
  from: string; to: Recipient; subject: string; html: string; apiKey: string; cc?: string[]; replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
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
      cc: opts.cc?.length ? opts.cc : undefined,
      reply_to: opts.replyTo || undefined,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.length ? opts.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        type: a.type,
      })) : undefined,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    // Surface rate limit errors explicitly so they're never swallowed silently
    if (res.status === 429) {
      throw new Error(`RATE_LIMIT: Resend daily or per-second limit hit. ${errText}`);
    }
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }
  const json = await res.json() as { id: string };
  return json.id;
}

// ── Resend batch API — up to 100 emails per call ────────────────────────
async function sendBatchViaResend(opts: {
  from: string; recipients: Recipient[]; subject: string; html: string;
  apiKey: string; cc?: string[]; replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
}): Promise<{ email: string; ok: boolean; messageId?: string; error?: string }[]> {
  const messages = opts.recipients.map(to => ({
    from: opts.from,
    to: [to.name ? `${to.name} <${to.email}>` : to.email],
    cc: opts.cc?.length ? opts.cc : undefined,
    reply_to: opts.replyTo || undefined,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments?.length ? opts.attachments.map(a => ({
      filename: a.filename, content: a.content, type: a.type,
    })) : undefined,
  }));

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error(`RATE_LIMIT: ${errText}`);
    throw new Error(`Resend batch error ${res.status}: ${errText}`);
  }

  const json = await res.json() as { data: { id: string }[] };
  return opts.recipients.map((to, i) => ({
    email: to.email,
    ok: true,
    messageId: json.data?.[i]?.id,
  }));
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
  from: string; to: Recipient; subject: string; html: string; cc?: string[]; replyTo?: string;
  attachments?: { filename: string; content: string; type: string }[];
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
const PAOLO_EMAIL = "PGA@DenisonYachting.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      subject: string;
      html: string;
      recipients: Recipient[];
      from?: string;
      testMode?: boolean;
      templateMode?: string; // "boat-show" triggers Paolo CC
    };

    const { subject, html, recipients, testMode = false, templateMode } = body;

    if (!subject?.trim()) return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
    if (!html?.trim())    return NextResponse.json({ ok: false, error: "html is required" }, { status: 400 });
    if (!recipients?.length) return NextResponse.json({ ok: false, error: "recipients is required" }, { status: 400 });

    const fromName  = body.from || process.env.CAMPAIGN_FROM_NAME || "Will Noftsinger | Denison Yachting";
    const fromEmail = process.env.CAMPAIGN_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com";
    const from      = `${fromName} <${fromEmail}>`;
    // Reply-To always routes back to Will's Denison inbox — recipients who reply
    // get Will directly even though the technical sending domain is theyachtcache.com
    const replyTo   = "WN@DenisonYachting.com";

    // Merge client cc (co-brokers toggled on) with auto-cc (Paolo on boat-show)
    const clientCc: string[] = Array.isArray((body as any).cc) ? (body as any).cc : [];
    const autoCc: string[]   = templateMode === "boat-show" ? [PAOLO_EMAIL] : [];
    const cc = [...new Set([...clientCc, ...autoCc])].length > 0 ? [...new Set([...clientCc, ...autoCc])] : undefined;

    // Attachments from client (base64 encoded)
    const attachments: { filename: string; content: string; type: string }[] | undefined =
      Array.isArray((body as any).attachments) && (body as any).attachments.length > 0
        ? (body as any).attachments
        : undefined;

    // In test mode, only send to the first recipient
    const targets = testMode ? [recipients[0]] : recipients;

    const results: SendResult[] = [];
    let rateLimitHit = false;
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      // ── Resend batch path: 100 emails per API call, ~20 calls for 2000 recipients ──
      const BATCH = 100;
      for (let i = 0; i < targets.length; i += BATCH) {
        if (rateLimitHit) break;
        const batch = targets.slice(i, i + BATCH);
        try {
          const batchResults = await sendBatchViaResend({
            from, recipients: batch, subject, html, apiKey: resendKey, cc, replyTo, attachments,
          });
          results.push(...batchResults);
        } catch (err: any) {
          const msg = err?.message || "Batch failed";
          if (msg.startsWith("RATE_LIMIT")) rateLimitHit = true;
          // Mark all in batch as failed
          batch.forEach(to => results.push({ email: to.email, ok: false, error: msg }));
        }
        // Small delay between batches to stay within per-second limits
        if (i + BATCH < targets.length) await new Promise(r => setTimeout(r, 200));
      }
    } else {
      // ── Fallback: one-at-a-time for Postmark/SendGrid ──
      const BATCH_SIZE = 20;
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        if (rateLimitHit) break;
        const batch = targets.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(to => sendOne({ from, to, subject, html, cc, replyTo, attachments }))
        );
        for (let j = 0; j < batch.length; j++) {
          const r = batchResults[j];
          if (r.status === "fulfilled") {
            results.push({ email: batch[j].email, ok: true, messageId: r.value });
          } else {
            const msg = r.reason?.message || "Failed";
            results.push({ email: batch[j].email, ok: false, error: msg });
            if (msg.startsWith("RATE_LIMIT")) rateLimitHit = true;
          }
        }
        if (i + BATCH_SIZE < targets.length) await new Promise(r => setTimeout(r, 100));
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
      rateLimitHit,
      results: (failed > 0 || rateLimitHit) ? results : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/campaign/send]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
