import { NextResponse } from "next/server";
import { buildDigest, formatDigestSMS } from "@/lib/notes/digest";
import { sendSMS } from "@/lib/sms";
import { logMorningSend } from "@/lib/health";
import { buildIntelBrief } from "@/lib/morning-intel";

export const runtime = "nodejs";

// POST /api/cron/morning
// Called by Railway cron at 07:30 America/New_York every weekday.
// Protected by CRON_SECRET env var — Railway sends it as Authorization: Bearer <secret>
export async function POST(req: Request) {
  // Auth check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: { assignee: string; ok: boolean; itemCount: number; error?: string }[] = [];

  // Brokers to message — driven by env vars
  // MORNING_TEXT_WILL=+18504613342  MORNING_TEXT_PAOLO=+17862512588
  const brokers: { assignee: string; envKey: string }[] = [
    { assignee: "will",  envKey: "MORNING_TEXT_WILL"  },
    { assignee: "paolo", envKey: "MORNING_TEXT_PAOLO" },
  ];

  for (const broker of brokers) {
    const to = process.env[broker.envKey] || (broker.assignee === "will" ? process.env.MORNING_TEXT_TO : "");
    if (!to) continue; // skip if number not configured

    const items   = buildDigest(broker.assignee);
    let message = formatDigestSMS(items, broker.assignee);
    // Intel section (matches, price cuts, drafts) — Will's brief only, hard-capped lines
    if (broker.assignee === "will") {
      try {
        const intel = buildIntelBrief();
        if (intel) message = `${message}\n—\n${intel}`;
      } catch (e) { console.warn("[cron/morning] intel brief failed:", e); }
    }
    const result  = await sendSMS(to, message);

    logMorningSend(
      broker.assignee, items.length, to,
      result.ok ? "ok" : "error",
      result.ok ? undefined : result.error
    );
    results.push({ assignee: broker.assignee, ok: result.ok, itemCount: items.length, ...(!result.ok && { error: result.error }) });
    console.log(`[cron/morning] ${broker.assignee} → ${to}: ${result.ok ? `sent (${items.length} items)` : `FAILED: ${result.error}`}`);
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}

// GET for quick health check from Railway cron dashboard
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "cron/morning", time: new Date().toISOString() });
}
