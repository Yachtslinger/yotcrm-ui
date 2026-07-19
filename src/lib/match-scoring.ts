import type { Database } from "better-sqlite3";

export type Buyer = { id: number; first_name: string; last_name: string; email?: string|null;
  profile_status: string; budget_min: number|null; budget_max: number|null;
  loa_min: number|null; loa_max: number|null; year_min: number|null; year_max: number|null;
  make_preference: string|null; vessel_type_pref: string|null;
  pinned_temperature: string|null; last_contacted_at: string|null; };
export type Listing = { id: number; make: string|null; model: string|null; year: number|null;
  loa: number|null; asking_price: number|null; location: string|null; listing_url: string|null;
  vessel_type: string|null; created_at: string; };

export type Temp = "hot"|"warm"|"cool"|"cold"|"unknown";
export const TEMP_WEIGHT: Record<Temp, number> = { hot: 1.0, warm: 0.85, cool: 0.6, cold: 0.35, unknown: 0.5 };

export function temperature(b: Buyer): Temp {
  if (b.pinned_temperature) return b.pinned_temperature as Temp;
  if (!b.last_contacted_at) return "unknown";
  const days = (Date.now() - new Date(b.last_contacted_at).getTime()) / 86_400_000;
  return days <= 7 ? "hot" : days <= 30 ? "warm" : days <= 90 ? "cool" : "cold";
}

export function scoreMatch(b: Buyer, l: Listing): { pts: number; reasons: string[] } {
  let pts = 0; const reasons: string[] = [];
  const price = l.asking_price, loa = l.loa, yr = l.year;
  if (b.budget_min != null && b.budget_max != null && price) {
    if (price >= b.budget_min && price <= b.budget_max) { pts += 30; reasons.push(`$${(price/1e6).toFixed(2)}M in budget`); }
    else if (price >= b.budget_min * 0.85 && price <= b.budget_max * 1.15) { pts += 15; reasons.push("near budget"); }
  } else pts += 10;
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

export function dedupeListings(rows: Listing[]): Listing[] {
  const seen = new Set<string>();
  return rows.filter(l => {
    const key = `${l.make}|${l.model}|${l.year}|${l.loa ? Math.round(l.loa) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function makeWeights(db: Database): Map<string, number> {
  return new Map((db.prepare(`SELECT lead_id||'-'||lower(value) k, weight_multiplier m
    FROM match_weight_adjustments WHERE dimension='make'`).all() as {k:string;m:number}[])
    .map(r => [r.k, r.m]));
}
