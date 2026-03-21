/**
 * GET /api/command-search?q=...
 * Lightweight cross-table search for the ⌘K command palette.
 * Returns up to 5 leads, 4 todos, 3 listings — all in one fast query.
 * Designed for <200ms response on the Railway SQLite instance.
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ leads: [], todos: [], listings: [] });

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const t = `%${q.toLowerCase()}%`;

    // ── Leads ─────────────────────────────────────────────────────────────
    const leads = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
             l.status, l.source,
             b.make AS boat_make, b.model AS boat_model,
             b.year AS boat_year, b.length AS boat_length, b.price AS boat_price
      FROM leads l
      LEFT JOIN boats b ON b.lead_id = l.id AND b.id = (
        SELECT id FROM boats WHERE lead_id = l.id ORDER BY added_at DESC LIMIT 1
      )
      WHERE LOWER(l.first_name || ' ' || l.last_name) LIKE ?
         OR LOWER(l.email) LIKE ?
         OR LOWER(l.phone) LIKE ?
         OR LOWER(COALESCE(b.make,'')) LIKE ?
         OR LOWER(COALESCE(b.model,'')) LIKE ?
      ORDER BY l.updated_at DESC
      LIMIT 6
    `).all(t, t, t, t, t) as any[];

    // ── Todos ──────────────────────────────────────────────────────────────
    const todos = db.prepare(`
      SELECT t.id, t.text, t.priority, t.completed, t.due_date, t.todo_type, t.queue,
             l.first_name || ' ' || l.last_name AS lead_name
      FROM todos t
      LEFT JOIN leads l ON t.lead_id = l.id
      WHERE t.completed = 0
        AND (LOWER(t.text) LIKE ? OR LOWER(COALESCE(l.first_name || ' ' || l.last_name,'')) LIKE ?)
      ORDER BY t.priority = 'high' DESC, t.created_at DESC
      LIMIT 4
    `).all(t, t) as any[];

    // ── Listings (parsed_listings) ─────────────────────────────────────────
    let listings: any[] = [];
    try {
      listings = db.prepare(`
        SELECT pl.id, pl.make, pl.model, pl.year, pl.loa, pl.asking_price,
               pl.location, pl.listing_url, pl.batch_id
        FROM parsed_listings pl
        WHERE LOWER(pl.make || ' ' || COALESCE(pl.model,'')) LIKE ?
           OR LOWER(COALESCE(pl.location,'')) LIKE ?
        ORDER BY pl.created_at DESC
        LIMIT 4
      `).all(t, t) as any[];
    } catch { /* table may not exist */ }

    return NextResponse.json({ leads, todos, listings });
  } finally {
    db.close();
  }
}
