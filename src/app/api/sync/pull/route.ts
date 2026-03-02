import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const SYNC_SECRET = process.env.SYNC_SECRET || "yotcrm-sync-2026";

/**
 * GET /api/sync/pull — Export all leads + boats for local DB merge.
 * Railway is source-of-truth for email-ingested leads.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret") || "";
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const leads = db.prepare("SELECT * FROM leads ORDER BY id").all();
    const boats = db.prepare("SELECT * FROM boats ORDER BY id").all();
    return NextResponse.json({ ok: true, leads, boats });
  } finally {
    db.close();
  }
}
