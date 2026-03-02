import { NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");

    const rows = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
             l.source, l.created_at,
             b.make AS boat_make, b.model AS boat_model,
             b.year AS boat_year, b.length AS boat_length,
             b.price AS boat_price, b.listing_url
      FROM leads l
      LEFT JOIN boats b ON b.lead_id = l.id
      WHERE l.created_at > datetime('now', '-10 minutes')
      ORDER BY l.id DESC
    `).all();

    db.close();
    return NextResponse.json({ leads: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
