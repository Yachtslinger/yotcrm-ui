import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function parseLoa(s?: string): number {
  if (!s) return 0;
  // Parse "28.5 m", "93'6"", "34 m / 111'6"", "34", etc.
  const m = s.match(/([\d.]+)\s*m/i);
  if (m) return parseFloat(m[1]);
  const ft = s.match(/([\d.]+)\s*(?:ft|')/i);
  if (ft) return parseFloat(ft[1]) * 0.3048;
  const bare = s.match(/^([\d.]+)/);
  if (bare) return parseFloat(bare[1]);
  return 0;
}

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
    // Sort longest to shortest by LOA
    listings.sort((a, b) => parseLoa(b.length) - parseLoa(a.length));
    return NextResponse.json({ ok: true, listings });
  } catch {
    return NextResponse.json({ ok: true, listings: [] });
  }
}
