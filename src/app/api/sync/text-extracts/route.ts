import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const SYNC_SECRET = process.env.SYNC_SECRET || "yotcrm-sync-2026";

const DDL = `CREATE TABLE IF NOT EXISTS lead_text_extracts (
  id INTEGER PRIMARY KEY,
  handle_id TEXT UNIQUE, handle_rid INTEGER,
  display_name TEXT, matched_lead_id INTEGER,
  dossier TEXT,
  budget_min INTEGER, budget_max INTEGER, loa_min INTEGER, loa_max INTEGER,
  year_min INTEGER, year_max INTEGER, make_preference TEXT, vessel_type_pref TEXT,
  profile_confidence_json TEXT, temperature TEXT,
  is_prospect INTEGER, category_suggestion TEXT,
  msg_count INTEGER, last_msg_at TEXT,
  review_status TEXT DEFAULT 'pending',
  extracted_at TEXT DEFAULT (datetime('now'))
)`;

// POST /api/sync/text-extracts — upsert extract rows from local machine.
// Never regresses review_status: an approved/skipped row on prod stays decided.
export async function POST(req: Request) {
  if (req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { extracts } = await req.json();
  if (!Array.isArray(extracts)) return NextResponse.json({ error: "bad payload" }, { status: 400 });
  const db = new Database(DB_PATH);
  try {
    db.exec(DDL);
    db.pragma("journal_mode = WAL");
    const up = db.prepare(`INSERT INTO lead_text_extracts
      (handle_id, handle_rid, display_name, matched_lead_id, dossier,
       budget_min, budget_max, loa_min, loa_max, year_min, year_max,
       make_preference, vessel_type_pref, profile_confidence_json, temperature,
       is_prospect, category_suggestion, msg_count, last_msg_at, review_status)
      VALUES (@handle_id,@handle_rid,@display_name,@matched_lead_id,@dossier,
       @budget_min,@budget_max,@loa_min,@loa_max,@year_min,@year_max,
       @make_preference,@vessel_type_pref,@profile_confidence_json,@temperature,
       @is_prospect,@category_suggestion,@msg_count,@last_msg_at,'pending')
      ON CONFLICT(handle_id) DO UPDATE SET
        dossier=excluded.dossier, display_name=excluded.display_name,
        msg_count=excluded.msg_count, last_msg_at=excluded.last_msg_at`);
    let n = 0;
    const tx = db.transaction((rows: Record<string, unknown>[]) => {
      for (const r of rows) { up.run(r); n++; }
    });
    tx(extracts);
    return NextResponse.json({ ok: true, upserted: n });
  } finally { db.close(); }
}
