import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

/**
 * POST /api/sync/backfill-touches — one-shot retro-stamp of leads.last_contacted_at
 * from the full comms history (matched messages). Forward-only, idempotent.
 * Gated by the sync secret; lives under /api/sync so middleware allows it.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-sync-secret") !== (process.env.SYNC_SECRET || "yotcrm-sync-2026"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = new Database(DB_PATH);
  try {
    const r = db.prepare(`
      UPDATE leads SET last_contacted_at = (
        SELECT MAX(COALESCE(m.sent_at, m.received_at))
        FROM comms_contact_matches cm JOIN comms_messages m ON m.id = cm.message_id
        WHERE cm.lead_id = leads.id)
      WHERE id IN (SELECT DISTINCT lead_id FROM comms_contact_matches WHERE lead_id IS NOT NULL)
        AND COALESCE(last_contacted_at,'') < COALESCE((
          SELECT MAX(COALESCE(m.sent_at, m.received_at))
          FROM comms_contact_matches cm JOIN comms_messages m ON m.id = cm.message_id
          WHERE cm.lead_id = leads.id), '')`).run();
    return NextResponse.json({ ok: true, stamped: r.changes });
  } finally { db.close(); }
}
