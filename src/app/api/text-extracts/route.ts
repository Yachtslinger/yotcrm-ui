import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

const EXTRACTS_DDL = `CREATE TABLE IF NOT EXISTS lead_text_extracts (
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

function getDb() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  db.exec(EXTRACTS_DDL);
  db.pragma("journal_mode = WAL");
  return db;
}

// Map extractor's category vocabulary onto the leads CHECK constraint
const CAT_MAP: Record<string, string> = {
  active_buyer: "active_buyer", seller: "owner_seller", owner_seller: "owner_seller",
  past_client: "past_client", co_broker: "co_broker", industry: "co_broker",
  vendor: "vendor", dead_dnc: "dead_dnc",
};

// GET /api/text-extracts — pending text-derived profiles for review
export async function GET() {
  const db = getDb();
  try {
    const pending = db.prepare(`
      SELECT id, handle_id, display_name, matched_lead_id, dossier,
             budget_min, budget_max, loa_min, loa_max, year_min, year_max,
             make_preference, vessel_type_pref, profile_confidence_json,
             temperature, is_prospect, category_suggestion, msg_count, last_msg_at
      FROM lead_text_extracts
      WHERE review_status='pending'
      ORDER BY is_prospect DESC, last_msg_at DESC`).all();
    const done = db.prepare(`SELECT COUNT(*) n FROM lead_text_extracts WHERE review_status='approved'`).get() as { n: number };
    return NextResponse.json({ pending, approvedCount: done.n });
  } finally { db.close(); }
}

// POST /api/text-extracts — { id, action: 'approve'|'skip', category?, temperature? }
export async function POST(req: Request) {
  const body = await req.json();
  const { id, action } = body;
  if (!id || !["approve", "skip"].includes(action)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const db = getDb();
  try {
    const ex = db.prepare(`SELECT * FROM lead_text_extracts WHERE id=?`).get(id) as Record<string, unknown> | undefined;
    if (!ex) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Will's edits override the extraction — applied to the record before approval
    const ov = (body.overrides || {}) as Record<string, unknown>;
    const numOv = (k: string) => {
      const v = ov[k];
      if (v === undefined || v === null || v === "") return null;
      const n = Number(String(v).replace(/[^0-9.]/g, ""));
      return isNaN(n) ? null : Math.round(n);
    };
    const strOv = (k: string) => {
      const v = ov[k];
      return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    };
    if (Object.keys(ov).length > 0) {
      db.prepare(`UPDATE lead_text_extracts SET
        display_name=COALESCE(?, display_name), dossier=COALESCE(?, dossier),
        budget_min=?, budget_max=?, loa_min=?, loa_max=?, year_min=?, year_max=?,
        make_preference=?, vessel_type_pref=?
        WHERE id=?`).run(
        strOv("display_name"), strOv("dossier"),
        numOv("budget_min") ?? ex.budget_min, numOv("budget_max") ?? ex.budget_max,
        numOv("loa_min") ?? ex.loa_min, numOv("loa_max") ?? ex.loa_max,
        numOv("year_min") ?? ex.year_min, numOv("year_max") ?? ex.year_max,
        strOv("make_preference") ?? ex.make_preference, strOv("vessel_type_pref") ?? ex.vessel_type_pref,
        id);
      Object.assign(ex, db.prepare(`SELECT * FROM lead_text_extracts WHERE id=?`).get(id) as Record<string, unknown>);
    }
    const ovEmail = strOv("email"), ovPhone = strOv("phone");

    if (action === "skip") {
      db.prepare(`UPDATE lead_text_extracts SET review_status='skipped' WHERE id=?`).run(id);
      return NextResponse.json({ ok: true, skipped: true });
    }

    const cat = CAT_MAP[String(body.category || ex.category_suggestion || "")] || null;
    const temp = ["hot", "warm", "cool", "cold"].includes(String(body.temperature || ex.temperature)) ? String(body.temperature || ex.temperature) : null;
    const handle = String(ex.handle_id || "");
    const isEmail = handle.includes("@");
    const phone10 = handle.replace(/[^0-9]/g, "").slice(-10);

    // Locate existing lead: recorded match, else live phone/email match
    let leadId = (ex.matched_lead_id as number | null) || null;
    if (!leadId && phone10.length === 10) {
      const row = db.prepare(`SELECT id FROM leads WHERE replace(replace(replace(replace(phone,'-',''),' ',''),'(',''),')','') LIKE '%' || ? LIMIT 1`).get(phone10) as { id: number } | undefined;
      if (row) leadId = row.id;
    }
    if (!leadId && isEmail) {
      const row = db.prepare(`SELECT id FROM leads WHERE lower(email)=? LIMIT 1`).get(handle.toLowerCase()) as { id: number } | undefined;
      if (row) leadId = row.id;
    }

    const hasCriteria = [ex.budget_min, ex.budget_max, ex.loa_min, ex.loa_max, ex.year_min, ex.year_max, ex.make_preference, ex.vessel_type_pref]
      .some(v => v !== null && v !== undefined && v !== "");

    if (leadId) {
      if (ovEmail || ovPhone) {
        db.prepare(`UPDATE leads SET
          email = CASE WHEN COALESCE(email,'')='' THEN COALESCE(?, email) ELSE email END,
          phone = CASE WHEN COALESCE(phone,'')='' THEN COALESCE(?, phone) ELSE phone END
          WHERE id=?`).run(ovEmail, ovPhone, leadId);
      }
      db.prepare(`UPDATE leads SET
        category = COALESCE(?, category),
        pinned_temperature = COALESCE(?, pinned_temperature),
        dossier = CASE WHEN dossier IS NULL OR dossier='' THEN ? ELSE dossier END,
        budget_min = CASE WHEN budget_min IS NULL OR budget_min='' THEN COALESCE(?, budget_min) ELSE budget_min END,
        budget_max = CASE WHEN budget_max IS NULL OR budget_max='' THEN COALESCE(?, budget_max) ELSE budget_max END,
        loa_min = CASE WHEN loa_min IS NULL OR loa_min='' THEN COALESCE(?, loa_min) ELSE loa_min END,
        loa_max = CASE WHEN loa_max IS NULL OR loa_max='' THEN COALESCE(?, loa_max) ELSE loa_max END,
        year_min = CASE WHEN year_min IS NULL OR year_min='' THEN COALESCE(?, year_min) ELSE year_min END,
        year_max = CASE WHEN year_max IS NULL OR year_max='' THEN COALESCE(?, year_max) ELSE year_max END,
        make_preference = CASE WHEN make_preference IS NULL OR make_preference='' THEN COALESCE(?, make_preference) ELSE make_preference END,
        vessel_type_pref = CASE WHEN vessel_type_pref IS NULL OR vessel_type_pref='' THEN COALESCE(?, vessel_type_pref) ELSE vessel_type_pref END,
        profile_status = CASE WHEN ? AND profile_status IN ('none','draft') THEN 'approved' ELSE profile_status END,
        profile_source_ref = COALESCE(profile_source_ref, 'texts:review'),
        last_contacted_at = CASE WHEN last_contacted_at IS NULL OR last_contacted_at='' OR last_contacted_at < ? THEN ? ELSE last_contacted_at END
        WHERE id=?`).run(
        cat, temp, ex.dossier || "",
        ex.budget_min, ex.budget_max, ex.loa_min, ex.loa_max, ex.year_min, ex.year_max,
        ex.make_preference, ex.vessel_type_pref,
        hasCriteria ? 1 : 0, ex.last_msg_at || "", ex.last_msg_at || "", leadId);
      // Explicit edits WIN over existing lead values — Will just reviewed this person
      if (Object.keys(ov).length > 0) {
        db.prepare(`UPDATE leads SET
          budget_min=COALESCE(?,budget_min), budget_max=COALESCE(?,budget_max),
          loa_min=COALESCE(?,loa_min), loa_max=COALESCE(?,loa_max),
          year_min=COALESCE(?,year_min), year_max=COALESCE(?,year_max),
          make_preference=COALESCE(?,make_preference), vessel_type_pref=COALESCE(?,vessel_type_pref),
          dossier=COALESCE(?,dossier)
          WHERE id=?`).run(
          numOv("budget_min"), numOv("budget_max"), numOv("loa_min"), numOv("loa_max"),
          numOv("year_min"), numOv("year_max"), strOv("make_preference"), strOv("vessel_type_pref"),
          strOv("dossier"), leadId);
      }
    } else {
      const nm = String(ex.display_name || "").trim();
      const parts = nm.includes("@") || /^\+?\d+$/.test(nm) ? ["", ""] : nm.split(/\s+/);
      const first = parts[0] || nm, last = parts.slice(1).join(" ");
      const info = db.prepare(`INSERT INTO leads
        (first_name, last_name, email, phone, source, category, pinned_temperature, dossier,
         budget_min, budget_max, loa_min, loa_max, year_min, year_max,
         make_preference, vessel_type_pref, profile_confidence_json,
         profile_status, profile_source_ref, last_contacted_at, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).run(
        first, last, ovEmail || (isEmail ? handle : null), ovPhone || (isEmail ? "" : handle), "imessage",
        cat, temp, ex.dossier || "",
        ex.budget_min ?? "", ex.budget_max ?? "", ex.loa_min ?? "", ex.loa_max ?? "",
        ex.year_min ?? "", ex.year_max ?? "", ex.make_preference ?? "", ex.vessel_type_pref ?? "",
        String(ex.profile_confidence_json || "{}"),
        hasCriteria ? "approved" : "none", "texts:review", ex.last_msg_at || "");
      leadId = Number(info.lastInsertRowid);
    }

    db.prepare(`UPDATE lead_text_extracts SET review_status='approved', matched_lead_id=? WHERE id=?`).run(leadId, id);
    return NextResponse.json({ ok: true, leadId });
  } finally { db.close(); }
}
