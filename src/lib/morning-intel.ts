import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";
import { scoreMatch, temperature, dedupeListings, makeWeights, TEMP_WEIGHT,
  type Buyer, type Listing } from "@/lib/match-scoring";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

/**
 * Morning intel — the broker's 3-line brief. HARD-CAPPED by design:
 * top 3 matches, price-cut count, pending-draft count. Never a firehose.
 */
export function buildIntelBrief(): string {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    const lines: string[] = [];

    const buyers = db.prepare(`SELECT id, first_name, last_name, profile_status,
        budget_min, budget_max, loa_min, loa_max, year_min, year_max, make_preference,
        vessel_type_pref, pinned_temperature, last_contacted_at
      FROM leads WHERE category='active_buyer' AND profile_status IN ('approved','draft')`).all() as Buyer[];
    const listings = dedupeListings(db.prepare(`SELECT id, make, model, year, loa, asking_price,
        location, listing_url, vessel_type, created_at
      FROM parsed_listings WHERE created_at >= datetime('now','-7 days')`).all() as Listing[]);
    const weights = makeWeights(db);
    const acted = new Set((db.prepare(`SELECT parsed_listing_id||'-'||lead_id k
      FROM match_board_actions`).all() as {k:string}[]).map(r => r.k));

    const top: { s: number; line: string }[] = [];
    for (const b of buyers) for (const l of listings) {
      if (acted.has(`${l.id}-${b.id}`)) continue;
      const { pts } = scoreMatch(b, l);
      const mult = l.make ? (weights.get(`${b.id}-${l.make.toLowerCase()}`) ?? 1) : 1;
      const s = pts * mult;
      if (s < 60) continue;
      const rank = s * TEMP_WEIGHT[temperature(b)];
      top.push({ s: rank, line: `${b.first_name} ← ${[l.make, l.model].filter(Boolean).join(" ")} (${Math.round(s)})` });
    }
    top.sort((a, z) => z.s - a.s);
    if (top.length) lines.push(`🎯 ${top.slice(0, 3).map(t => t.line).join(" · ")}`);

    try {
      const cuts = (db.prepare(`SELECT COUNT(DISTINCT parsed_listing_id) n FROM listing_price_events
        WHERE delta < 0 AND observed_at >= datetime('now','-2 days')`).get() as {n:number}).n;
      if (cuts) lines.push(`💰 ${cuts} price cut${cuts > 1 ? "s" : ""} — check Match Board`);
    } catch {}

    const drafts = (db.prepare(`SELECT COUNT(*) n FROM todos
      WHERE queue='bot' AND todo_type='outreach' AND bot_status='pending' AND completed=0`).get() as {n:number}).n;
    if (drafts) lines.push(`✉️ ${drafts} outreach draft${drafts > 1 ? "s" : ""} ready to send in Bot Queue`);

    const gaps = (db.prepare(`SELECT COUNT(*) n FROM leads
      WHERE category='active_buyer' AND profile_status='draft'`).get() as {n:number}).n;
    if (gaps) lines.push(`📋 ${gaps} buyer profiles await your approval`);

    return lines.join("\n");
  } finally { db.close(); }
}
