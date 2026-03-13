import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(`
      SELECT id, name, make, model, year, length, price, location,
             hero_image, description, highlights, listing_urls, broker
      FROM my_listings WHERE status = 'active'
      ORDER BY updated_at DESC
    `).all() as any[];
    db.close();
    const listings = rows.map(r => ({
      id: r.id, name: r.name, make: r.make, model: r.model,
      year: r.year, length: r.length, price: r.price, location: r.location,
      heroImage: r.hero_image, description: r.description,
      highlights: r.highlights, broker: r.broker,
      listingUrls: (() => { try { return JSON.parse(r.listing_urls || "[]"); } catch { return []; } })(),
    }));
    return NextResponse.json({ ok: true, listings });
  } catch {
    return NextResponse.json({ ok: true, listings: [] });
  }
}
