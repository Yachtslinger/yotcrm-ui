import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// GET /api/sort-queue — next unsorted contacts, richest signal first.
// Order: text-thread relationships (by recency), then last-contacted, then newest.
export async function GET() {
  const db = new Database(DB_PATH);
  try {
    ensureLeadsSchema(db);
    db.exec(`CREATE TABLE IF NOT EXISTS lead_text_stats (
      lead_id INTEGER PRIMARY KEY, handle_rid INTEGER, msg_count INTEGER,
      last_msg_at TEXT, first_msg_at TEXT, updated_at TEXT)`);
    const rows = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.source,
             l.created_at, l.last_contacted_at, l.dossier,
             l.suggested_category, l.prospect_score, l.suggest_reason,
             l.notes, s.msg_count, s.last_msg_at
      FROM leads l
      LEFT JOIN lead_text_stats s ON s.lead_id = l.id
      WHERE l.category IS NULL AND l.sorted_at IS NULL
        AND COALESCE(l.first_name,'') NOT LIKE 'Received:%'
      ORDER BY (s.msg_count IS NOT NULL) DESC,
               COALESCE(s.last_msg_at, l.last_contacted_at, '') DESC,
               l.created_at DESC
      LIMIT 30`).all();
    const remaining = db.prepare(
      `SELECT COUNT(*) n FROM leads WHERE category IS NULL AND sorted_at IS NULL`).get() as { n: number };
    const sortedToday = db.prepare(
      `SELECT COUNT(*) n FROM leads WHERE sorted_at >= date('now')`).get() as { n: number };
    return NextResponse.json({ queue: rows, remaining: remaining.n, sortedToday: sortedToday.n });
  } finally { db.close(); }
}
