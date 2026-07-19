import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";
import { scoreMatch as score, temperature, dedupeListings, makeWeights, TEMP_WEIGHT,
  type Buyer, type Listing, type Temp } from "@/lib/match-scoring";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";


export async function GET() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    const buyers = db.prepare(`SELECT id, first_name, last_name, profile_status,
        budget_min, budget_max, loa_min, loa_max, year_min, year_max, make_preference, vessel_type_pref,
        pinned_temperature, last_contacted_at
      FROM leads WHERE category='active_buyer' AND profile_status IN ('approved','draft')`).all() as Buyer[];
    const listingsRaw = db.prepare(`SELECT id, make, model, year, loa, asking_price, location,
        listing_url, vessel_type, created_at
      FROM parsed_listings WHERE created_at >= datetime('now','-45 days')
      ORDER BY created_at DESC`).all() as Listing[];
    const listings = dedupeListings(listingsRaw);
    const acted = new Set((db.prepare(`SELECT parsed_listing_id||'-'||lead_id k FROM match_board_actions`)
      .all() as {k:string}[]).map(r => r.k));
    const weights = makeWeights(db);

    const rows: object[] = [];
    for (const b of buyers) for (const l of listings) {
      if (acted.has(`${l.id}-${b.id}`)) continue;
      const { pts, reasons } = score(b, l);
      const mult = l.make ? (weights.get(`${b.id}-${l.make.toLowerCase()}`) ?? 1) : 1;
      const temp = temperature(b);
      const final = pts * mult;               // match quality gate stays pure
      if (final < 45) continue;
      const rank = final * TEMP_WEIGHT[temp]; // temperature shapes ordering, not existence
      rows.push({ buyerId: b.id, buyer: `${b.first_name} ${b.last_name}`.trim(),
        pending: b.profile_status === "draft", temp, rank,
        listingId: l.id, boat: [l.year, l.make, l.model].filter(Boolean).join(" "),
        loa: l.loa, price: l.asking_price, location: l.location, url: l.listing_url,
        score: Math.round(final), reasons });
    }
    rows.sort((a: any, b: any) => b.rank - a.rank);
    // Cap: top 5 per buyer, 60 overall — a board, not a firehose
    const perBuyer = new Map<number, number>(); const out: object[] = [];
    for (const r of rows as any[]) {
      const n = perBuyer.get(r.buyerId) ?? 0;
      if (n >= 5 || out.length >= 60) continue;
      perBuyer.set(r.buyerId, n + 1); out.push(r);
    }
    return NextResponse.json({ matches: out, buyerCount: buyers.length, listingCount: listings.length });
  } finally { db.close(); }
}

export async function POST(req: Request) {
  const { listingId, leadId, action } = await req.json();
  if (!listingId || !leadId || !["dismissed","sent"].includes(action))
    return NextResponse.json({ error: "listingId, leadId, action required" }, { status: 400 });
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    db.prepare(`INSERT OR REPLACE INTO match_board_actions (parsed_listing_id, lead_id, action)
      VALUES (?,?,?)`).run(listingId, leadId, action);
    if (action === "dismissed") {
      const mk = (db.prepare(`SELECT make FROM parsed_listings WHERE id=?`).get(listingId) as {make:string}|undefined)?.make;
      if (mk) db.prepare(`INSERT INTO match_weight_adjustments (lead_id, dimension, value, dismiss_count, weight_multiplier)
        VALUES (?,'make',?,1,0.85)
        ON CONFLICT(lead_id, dimension, value) DO UPDATE SET dismiss_count=dismiss_count+1,
          weight_multiplier=MAX(0.2, weight_multiplier*0.85), updated_at=datetime('now')`).run(leadId, mk);
    }
    return NextResponse.json({ ok: true });
  } finally { db.close(); }
}
