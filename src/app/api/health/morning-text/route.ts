import { NextResponse } from "next/server";
import { getLastMorningSend, getRecentSends } from "@/lib/health";
import { buildDigest } from "@/lib/notes/digest";

export const runtime = "nodejs";

// GET /api/health/morning-text
// Returns operational status: last send, Twilio config, today's pending digest
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assignee = searchParams.get("assignee") || "will";

    // Twilio config status — present/absent, never expose actual values
    const twilioConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );
    const recipientConfigured = !!(
      process.env.MORNING_TEXT_WILL || process.env.MORNING_TEXT_TO
    );

    // Last send record
    const lastSend = getLastMorningSend(assignee);

    // Recent send history (last 5)
    const recentSends = getRecentSends(5);

    // Today's pending digest — what would go out right now
    const pendingItems = buildDigest(assignee);

    // Time since last send
    let hoursSinceLastSend: number | null = null;
    if (lastSend) {
      const diffMs = Date.now() - new Date(lastSend.sent_at).getTime();
      hoursSinceLastSend = Math.round(diffMs / 3600000 * 10) / 10;
    }

    // Health assessment
    const issues: string[] = [];
    if (!twilioConfigured)    issues.push("Twilio not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER");
    if (!recipientConfigured) issues.push("No recipient number — add MORNING_TEXT_WILL env var");
    if (!process.env.CRON_SECRET) issues.push("CRON_SECRET not set — cron endpoint is unprotected");
    if (lastSend?.status === "error") issues.push(`Last send failed: ${lastSend.error}`);

    const healthy = issues.length === 0;

    return NextResponse.json({
      ok: true,
      healthy,
      issues,
      twilio: {
        configured: twilioConfigured,
        recipientConfigured,
        fromNumber: process.env.TWILIO_FROM_NUMBER
          ? `...${process.env.TWILIO_FROM_NUMBER.slice(-4)}`
          : null,
      },
      lastSend: lastSend ? {
        sentAt: lastSend.sent_at,
        hoursSince: hoursSinceLastSend,
        itemCount: lastSend.item_count,
        status: lastSend.status,
        error: lastSend.error,
        sentTo: lastSend.sent_to
          ? `...${lastSend.sent_to.slice(-4)}`
          : null,
      } : null,
      today: {
        pendingCount: pendingItems.length,
        items: pendingItems.map(i => ({
          leadName: i.leadName,
          bucket: i.bucket,
          priority: i.priority,
          dueDate: i.dueDate,
          daysOverdue: i.daysOverdue,
        })),
      },
      recentHistory: recentSends.map(s => ({
        sentAt: s.sent_at,
        assignee: s.assignee,
        itemCount: s.item_count,
        status: s.status,
        error: s.error,
      })),
    });
  } catch (err) {
    console.error("[GET /api/health/morning-text]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
