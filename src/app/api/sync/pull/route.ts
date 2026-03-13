import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const SYNC_SECRET = process.env.SYNC_SECRET || "yotcrm-sync-2026";

/**
 * GET /api/sync/pull — Export ALL tables for local DB merge.
 * Railway is source-of-truth for web-uploaded data.
 * Returns every table that syncToRailway pushes.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret") || "";
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const safeAll = (sql: string) => {
      try { return db.prepare(sql).all(); } catch { return []; }
    };

    return NextResponse.json({
      ok: true,
      leads: safeAll("SELECT * FROM leads ORDER BY id"),
      boats: safeAll("SELECT * FROM boats ORDER BY id"),
      todos: safeAll("SELECT * FROM todos ORDER BY id"),
      pocket_listings: safeAll("SELECT * FROM pocket_listings ORDER BY id"),
      iso_requests: safeAll("SELECT * FROM iso_requests ORDER BY id"),
      marinas: safeAll("SELECT * FROM marinas ORDER BY id"),
      my_listings: safeAll("SELECT * FROM my_listings ORDER BY id"),
    });
  } finally {
    db.close();
  }
}
