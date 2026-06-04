/**
 * POST /api/comms/heartbeat  { detail?: string }
 * The Mac poller pings this every cycle to say "I'm alive and reaching Gmail."
 * Secret-gated (same secret as ingest); on the public middleware allowlist.
 */
import { NextRequest, NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/comms/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authed(req: NextRequest): boolean {
  const secret = process.env.COMMS_INGEST_SECRET || "yotcrm-comms-ingest-2026";
  const provided = req.headers.get("x-ingest-secret") ?? "";
  return !!provided && provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const detail = String((body as { detail?: unknown }).detail ?? "");
  try {
    recordHeartbeat(detail);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
