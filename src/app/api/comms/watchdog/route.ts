/**
 * /api/comms/watchdog  — off-Mac dead-man's switch.
 *   POST (Bearer CRON_SECRET): called by Railway Cron every ~10 min. If the poller
 *         heartbeat has gone silent past the staleness threshold, emails an alert
 *         via the HTTPS email provider (works on Railway; SMTP there is blocked).
 *   GET  (Bearer CRON_SECRET): read-only status, never sends.
 * On the public middleware allowlist; auth enforced here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMonitorState, setAlerted } from "@/lib/comms/monitor";
import { resolveProvider } from "@/lib/campaign/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MINUTES = Number(process.env.COMMS_WATCHDOG_STALE_MIN || "20");
const ALERT_TO = process.env.COMMS_ALERT_EMAIL || "will@denisonyachting.com";

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // mirrors /api/connect/cron when unset
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const st = getMonitorState();
  const ageMin = st.ageSeconds === null ? null : Math.round(st.ageSeconds / 60);
  return NextResponse.json({ ok: true, staleThresholdMin: STALE_MINUTES, ageMin, ...st });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const st = getMonitorState();
    if (st.ageSeconds === null) return NextResponse.json({ ok: true, status: "no_heartbeat_yet" });
    const ageMin = Math.round(st.ageSeconds / 60);
    const stale = ageMin >= STALE_MINUTES;

    if (stale && !st.alerted) {
      const text = `YotBot capture pipeline appears DOWN.\n\nNo poller heartbeat for ${ageMin} minutes (last seen ${st.lastHeartbeat} UTC). The capture Mac may be offline, asleep, or off the network. Inbound client emails are not being captured until it recovers.`;
      let sent = "mock";
      try {
        sent = await resolveProvider().send({
          to: ALERT_TO,
          subject: "⚠️ YotBot capture pipeline appears DOWN",
          text,
          html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
        });
      } catch (e) {
        sent = `send_failed: ${String(e)}`;
      }
      setAlerted(true);
      return NextResponse.json({ ok: true, status: "alerted", ageMin, to: ALERT_TO, sent });
    }
    if (!stale && st.alerted) {
      setAlerted(false);
      return NextResponse.json({ ok: true, status: "recovered", ageMin });
    }
    return NextResponse.json({ ok: true, status: stale ? "still_down_already_alerted" : "ok", ageMin });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
