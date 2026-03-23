import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { getBatchIds, runMatchesForBatch, generateMatchTodos } from "@/lib/matches/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function parseNum(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,\s'ft]/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leadId: number | null = body.leadId || null;

    const db = new Database(DB_PATH);
    let updated = 0, skipped = 0;

    try {
      const whereClause = leadId ? "l.id = ?" : "1=1";
      const params = leadId ? [leadId] : [];

      const leads = db.prepare(`
        SELECT l.id, l.budget_max, l.loa_max, l.year_max, l.make_preference,
               b.price AS boat_price, b.length AS boat_length,
               b.year AS boat_year, b.make AS boat_make
        FROM leads l
        JOIN boats b ON b.id = (
          SELECT id FROM boats WHERE lead_id = l.id ORDER BY added_at DESC LIMIT 1
        )
        WHERE ${whereClause}
          AND b.price != '' AND b.length != ''
      `).all(...params) as any[];

      const updateStmt = db.prepare(`
        UPDATE leads SET
          budget_min = CASE WHEN (budget_min IS NULL OR budget_min = '') THEN ? ELSE budget_min END,
          budget_max = CASE WHEN (budget_max IS NULL OR budget_max = '') THEN ? ELSE budget_max END,
          loa_min    = CASE WHEN (loa_min    IS NULL OR loa_min    = '') THEN ? ELSE loa_min    END,
          loa_max    = CASE WHEN (loa_max    IS NULL OR loa_max    = '') THEN ? ELSE loa_max    END,
          year_min   = CASE WHEN (year_min   IS NULL OR year_min   = '') THEN ? ELSE year_min   END,
          year_max   = CASE WHEN (year_max   IS NULL OR year_max   = '') THEN ? ELSE year_max   END,
          make_preference = CASE WHEN (make_preference IS NULL OR make_preference = '') THEN ? ELSE make_preference END,
          updated_at = datetime('now')
        WHERE id = ?
      `);

      db.transaction(() => {
        for (const lead of leads) {
          const price  = parseNum(lead.boat_price);
          const length = parseNum(lead.boat_length);
          const year   = parseNum(lead.boat_year);
          const make   = (lead.boat_make || "").trim();
          if (!price || !length) { skipped++; continue; }
          updateStmt.run(
            Math.round(price  * 0.75).toString(),
            Math.round(price  * 1.30).toString(),
            Math.round(length * 0.85).toString(),
            Math.round(length * 1.20).toString(),
            year ? (year - 5).toString() : "",
            year ? (year + 5).toString() : "",
            make,
            lead.id
          );
          updated++;
        }
      })();

      db.close();

      let rerunBatches = 0;
      try {
        const batchIds = getBatchIds();
        rerunBatches = batchIds.length;
        for (const batchId of batchIds) {
          runMatchesForBatch(batchId);
          generateMatchTodos(batchId);
        }
      } catch (e) { console.error("[infer-criteria] Rerun failed:", e); }

      return NextResponse.json({
        ok: true, leadsProcessed: leads.length, updated, skipped, rerunBatches,
        message: `Inferred criteria for ${updated} leads across ${leads.length} processed, recomputed ${rerunBatches} batches`,
      });
    } catch (e) { db.close(); throw e; }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
