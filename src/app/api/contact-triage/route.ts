import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// GET — next batch of uncategorized contacts, best prospects first
export async function GET() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    const batch = db.prepare(`SELECT id, first_name, last_name, email, phone, company, notes,
        suggested_category, prospect_score, suggest_reason, last_contacted_at
      FROM leads WHERE category IS NULL
        AND first_name NOT LIKE 'Received:%' AND first_name NOT LIKE 'Delivered-To%'
        AND first_name NOT LIKE 'X-%' AND first_name NOT LIKE 'DKIM%'
        AND first_name NOT LIKE 'Authentication%' AND first_name NOT LIKE 'Content-%'
      ORDER BY prospect_score DESC NULLS LAST, length(COALESCE(notes,'')) DESC
      LIMIT 25`).all();
    const remaining = (db.prepare(`SELECT COUNT(*) n FROM leads WHERE category IS NULL`).get() as {n:number}).n;
    const doneToday = (db.prepare(`SELECT COUNT(*) n FROM leads
      WHERE category IS NOT NULL AND suggested_category IS NOT NULL`).get() as {n:number}).n;
    return NextResponse.json({ batch, remaining, doneToday });
  } finally { db.close(); }
}

// POST — { id, category }  category: active_buyer|owner_seller|past_client|co_broker|vendor|dead_dnc
export async function POST(req: Request) {
  const { id, category } = await req.json();
  const valid = ["active_buyer","owner_seller","past_client","co_broker","vendor","dead_dnc"];
  if (!id || !valid.includes(category))
    return NextResponse.json({ error: "id and valid category required" }, { status: 400 });
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    db.prepare(`UPDATE leads SET category=?,
      profile_status = CASE WHEN ?='active_buyer' AND profile_status IS NULL THEN 'none' ELSE profile_status END
      WHERE id=? AND category IS NULL`).run(category, category, id);
    return NextResponse.json({ ok: true });
  } finally { db.close(); }
}
