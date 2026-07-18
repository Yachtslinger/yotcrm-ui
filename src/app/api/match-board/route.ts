import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

type Buyer = { id: number; first_name: string; last_name: string; profile_status: string;
  budget_min: number|null; budget_max: number|null; loa_min: number|null; loa_max: number|null;
  year_min: number|null; year_max: number|null; make_preference: string|null; vessel_type_pref: string|null;
  pinned_temperature: string|null; last_contacted_at: string|null; };

type Temp = "hot"|"warm"|"cool"|"cold"|"unknown";
const TEMP_WEIGHT: Record<Temp, number> = { hot: 1.0, warm: 0.85, cool: 0.6, cold: 0.35, unknown: 0.5 };
function temperature(b: Buyer): Temp {
  if (b.pinned_temperature) return b.pinned_temperature as Temp;
  if (!b.last_contacted_at) return "unknown";
  const days = (Date.now() - new Date(b.last_contacted_at).getTime()) / 86_400_000;
  return days <= 7 ? "hot" : days <= 30 ? "warm" : days <= 90 ? "cool" : "cold";
}
type Listing = { id: number; make: string|null; model: string|null; year: number|null;
  loa: number|null; asking_price: number|null; location: string|null; listing_url: string|null;
  vessel_type: string|null; created_at: string; };

function score(b: Buyer, l: Listing): { pts: number; reasons: string[] } {
  let pts = 0; const reasons: string[] = [];
  const price = l.asking_price, loa = l.loa, yr = l.year;
  if (b.budget_min != null && b.budget_max != null && price) {
    if (price >= b.budget_min && price <= b.budget_max) { pts += 30; reasons.push(`$${(price/1e6).toFixed(2)}M in budget`); }
    else if (price >= b.budget_min * 0.85 && price <= b.budget_max * 1.15) { pts += 15; reasons.push("near budget"); }
  } else pts += 10; // no budget known — neutral
  if (b.loa_min != null && b.loa_max != null && loa) {
    if (loa >= b.loa_min && loa <= b.loa_max) { pts += 30; reasons.push(`${Math.round(loa)}ft in ${Math.round(b.loa_min)}-${Math.round(b.loa_max)} range`); }
    else if (loa >= b.loa_min * 0.9 && loa <= b.loa_max * 1.1) { pts += 15; reasons.push("near size range"); }
  }
  if (b.year_min != null && b.year_max != null && yr) {
    if (yr >= b.year_min && yr <= b.year_max) { pts += 15; reasons.push(`${yr} in year range`); }
    else if (yr >= b.year_min - 3 && yr <= b.year_max + 3) pts += 8;
  }
  if (b.make_preference && l.make && l.make.toLowerCase().includes(b.make_preference.toLowerCase().split(" ")[0]))
    { pts += 15; reasons.push(`preferred make: ${l.make}`); }
  if (b.vessel_type_pref && l.vessel_type &&
      l.vessel_type.toLowerCase().includes(b.vessel_type_pref.toLowerCase().split(" ")[0]))
    { pts += 10; reasons.push("vessel type match"); }
  return { pts, reasons };
}

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
    // Dedupe: same boat arrives in multiple digests — keep newest sighting only
    const seen = new Set<string>();
    const listings = listingsRaw.filter(l => {
      const key = `${l.make}|${l.model}|${l.year}|${l.loa ? Math.round(l.loa) : ""}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const acted = new Set((db.prepare(`SELECT parsed_listing_id||'-'||lead_id k FROM match_board_actions`)
      .all() as {k:string}[]).map(r => r.k));
    const weights = new Map((db.prepare(`SELECT lead_id||'-'||lower(value) k, weight_multiplier m
      FROM match_weight_adjustments WHERE dimension='make'`).all() as {k:string;m:number}[])
      .map(r => [r.k, r.m]));

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
