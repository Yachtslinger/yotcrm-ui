/**
 * GET    /api/comms/untracked            → list all untracked emails (JSON, requires session)
 * GET    /api/comms/untracked?format=txt → plaintext list (requires INGEST_SECRET header for local poller)
 * POST   /api/comms/untracked            → { email, reason? }  add to untracked list (requires session)
 * DELETE /api/comms/untracked?email=...  → remove from untracked list (requires session)
 *
 * Route is in PUBLIC_PATHS so the route handler can authenticate plaintext requests
 * via INGEST_SECRET. Session-based requests (UI) check the session cookie below.
 */
import { NextRequest, NextResponse } from "next/server";
import { listUntracked, markUntracked, unmarkUntracked } from "@/lib/comms/storage";

export const runtime = "nodejs";

function hasIngestSecret(req: NextRequest): boolean {
  const provided = req.headers.get("x-ingest-secret") ?? "";
  const commsSecret = process.env.COMMS_INGEST_SECRET || "yotcrm-comms-ingest-2026";
  const ingestSecret = process.env.INGEST_SECRET;
  if (!provided) return false;
  return provided === commsSecret || (!!ingestSecret && provided === ingestSecret);
}

function hasSession(req: NextRequest): boolean {
  const token = req.cookies.get("yotcrm_session")?.value;
  return !!(token && token.length > 10);
}

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");

  if (format === "txt") {
    // Plaintext format used by local poller — requires INGEST_SECRET
    if (!hasIngestSecret(req)) {
      return new NextResponse("unauthorized", { status: 401 });
    }
    const body = listUntracked().map(r => r.email).join("\n");
    return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // JSON request — requires session
  if (!hasSession(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const all = listUntracked();
  return NextResponse.json({ ok: true, untracked: all, total: all.length });
}

export async function POST(req: NextRequest) {
  if (!hasSession(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { email?: string; reason?: string };
  if (!body.email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  markUntracked(body.email, body.reason || "", "user");
  return NextResponse.json({ ok: true, email: body.email.toLowerCase() });
}

export async function DELETE(req: NextRequest) {
  if (!hasSession(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  unmarkUntracked(email);
  return NextResponse.json({ ok: true, email: email.toLowerCase() });
}
