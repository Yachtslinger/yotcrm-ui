/**
 * GET  /api/comms/cleanup — list comms_capture leads whose address classifies as
 *                           automated (no-reply / bulk) and should not be leads.
 * POST /api/comms/cleanup — body { ids: number[] } deletes the confirmed leads.
 *
 * Secret-protected (same secret as ingest). One-time maintenance for junk leads
 * created before the sender classifier was wired into ingest. POST will only ever
 * delete leads whose source = 'comms_capture', so it cannot touch real/manual clients.
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { classifySender } from "@/lib/comms/sender-classifier";
import { deleteContact } from "@/lib/clients/storage";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function getDb() { const db = new Database(DB_PATH); db.pragma("journal_mode = WAL"); return db; }

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  const commsSecret = process.env.COMMS_INGEST_SECRET || "yotcrm-comms-ingest-2026";
  const provided = req.headers.get("x-ingest-secret") ?? req.headers.get("x-api-key") ?? "";
  if (!provided) return false;
  return provided === commsSecret || (!!secret && provided === secret);
}

type LeadRow = { id: number; first_name: string; last_name: string; email: string; created_at: string };

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT id, first_name, last_name, email, created_at FROM leads WHERE source = 'comms_capture' ORDER BY created_at DESC"
    ).all() as LeadRow[];
    const candidates = rows
      .map((r) => {
        const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
        const c = classifySender("", r.email ?? "", name);
        return { id: r.id, name, email: r.email, created_at: r.created_at, kind: c.kind, reasons: c.reasons };
      })
      .filter((r) => r.kind === "automated");
    return NextResponse.json({
      ok: true,
      total_comms_capture: rows.length,
      automated_candidates: candidates.length,
      candidates,
    });
  } finally { db.close(); }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw = (body as { ids?: unknown }).ids;
  const ids: number[] = Array.isArray(raw)
    ? raw.map((n) => Number(n)).filter((n) => Number.isInteger(n))
    : [];
  if (!ids.length) return NextResponse.json({ ok: false, error: "Provide ids: number[]" }, { status: 400 });

  const db = getDb();
  let allowed: number[] = [];
  try {
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT id FROM leads WHERE source = 'comms_capture' AND id IN (${placeholders})`
    ).all(...ids) as { id: number }[];
    allowed = rows.map((r) => r.id);
  } finally { db.close(); }

  const rejected = ids.filter((id) => !allowed.includes(id));
  const deleted: number[] = [];
  for (const id of allowed) {
    const ok = await deleteContact(String(id));
    if (ok) deleted.push(id);
  }
  return NextResponse.json({ ok: true, deleted, rejected_not_comms_capture: rejected });
}
