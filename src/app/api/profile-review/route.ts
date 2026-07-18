import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb(readonly = true) {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  db.pragma("journal_mode = WAL");
  return db;
}

// GET /api/profile-review — draft profiles awaiting approval + progress counts
export async function GET() {
  const db = getDb();
  try {
    const drafts = db.prepare(`
      SELECT id, first_name, last_name, email, source, notes,
             budget_min, budget_max, loa_min, loa_max, year_min, year_max,
             make_preference, vessel_type_pref, profile_confidence_json
      FROM leads
      WHERE category='active_buyer' AND profile_status='draft'
      ORDER BY id`).all();
    const gaps = db.prepare(`SELECT COUNT(*) n FROM leads
      WHERE category='active_buyer' AND profile_status='none'`).get() as { n: number };
    const approved = db.prepare(`SELECT COUNT(*) n FROM leads
      WHERE category='active_buyer' AND profile_status='approved'`).get() as { n: number };
    return NextResponse.json({ drafts, gapCount: gaps.n, approvedCount: approved.n });
  } finally { db.close(); }
}

// POST /api/profile-review — { id, action: 'approve'|'skip', fields?: {...edits} }
export async function POST(req: Request) {
  const { id, action, fields } = await req.json();
  if (!id || !["approve", "skip"].includes(action))
    return NextResponse.json({ error: "id and action ('approve'|'skip') required" }, { status: 400 });

  const db = getDb(false);
  try {
    if (action === "skip") {
      db.prepare(`UPDATE leads SET profile_status='none' WHERE id=? AND profile_status='draft'`).run(id);
      return NextResponse.json({ ok: true, status: "none" });
    }
    const allowed = ["budget_min","budget_max","loa_min","loa_max","year_min","year_max",
                     "make_preference","vessel_type_pref","pinned_temperature"];
    const edits = Object.fromEntries(
      Object.entries(fields || {}).filter(([k]) => allowed.includes(k)));
    const sets = Object.keys(edits).map(k => `${k}=@${k}`).join(", ");
    db.prepare(`UPDATE leads SET ${sets ? sets + "," : ""}
        profile_status='approved', profile_source_ref=COALESCE(profile_source_ref,'manual')
      WHERE id=@id AND profile_status='draft'`).run({ ...edits, id });
    return NextResponse.json({ ok: true, status: "approved" });
  } finally { db.close(); }
}
