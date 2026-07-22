import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const CALLS_DIR = path.join(path.dirname(DB_PATH), "calls");

const DDL = `CREATE TABLE IF NOT EXISTS call_recordings (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  filename TEXT, duration_sec INTEGER,
  transcript TEXT, summary TEXT,
  analyzed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`;

function getDb() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  db.exec(DDL);
  db.pragma("journal_mode = WAL");
  return db;
}

// GET /api/calls?leadId=123 — list recordings for a lead
export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
  const db = getDb();
  try {
    const calls = db.prepare(`SELECT id, duration_sec, summary, transcript IS NOT NULL AND transcript != '' AS has_transcript, created_at
      FROM call_recordings WHERE lead_id=? ORDER BY id DESC LIMIT 20`).all(Number(leadId));
    return NextResponse.json({ calls });
  } finally { db.close(); }
}

// POST /api/calls — multipart: leadId, duration, transcript, audio
// Saves the recording, then (if transcript) has Claude read the call and update the profile.
export async function POST(req: Request) {
  const form = await req.formData();
  const leadId = Number(form.get("leadId"));
  const duration = Number(form.get("duration") || 0);
  const transcript = String(form.get("transcript") || "").trim();
  const audio = form.get("audio") as File | null;
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  fs.mkdirSync(CALLS_DIR, { recursive: true });
  let filename: string | null = null;
  if (audio && audio.size > 0) {
    const ext = (audio.type || "").includes("mp4") ? "m4a" : "webm";
    filename = `call-${leadId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(CALLS_DIR, filename), Buffer.from(await audio.arrayBuffer()));
  }

  const db = getDb();
  try {
    const info = db.prepare(`INSERT INTO call_recordings (lead_id, filename, duration_sec, transcript)
      VALUES (?,?,?,?)`).run(leadId, filename, duration, transcript || null);
    const callId = Number(info.lastInsertRowid);

    // Touch stamp: a call is a contact
    const now = new Date().toISOString();
    db.prepare(`UPDATE leads SET last_contacted_at = CASE
      WHEN last_contacted_at IS NULL OR last_contacted_at='' OR last_contacted_at < ? THEN ? ELSE last_contacted_at END
      WHERE id=?`).run(now, now, leadId);

    let analysis: Record<string, unknown> | null = null;
    if (transcript.length > 40 && process.env.ANTHROPIC_API_KEY) {
      try {
        analysis = await analyzeCall(db, callId, leadId, transcript);
      } catch (e) {
        console.warn("call analysis failed:", (e as Error).message);
      }
    }
    return NextResponse.json({ ok: true, callId, analysis });
  } finally { db.close(); }
}

async function analyzeCall(db: Database.Database, callId: number, leadId: number, transcript: string) {
  const lead = db.prepare(`SELECT first_name, last_name, dossier FROM leads WHERE id=?`).get(leadId) as
    { first_name: string; last_name: string; dossier: string | null } | undefined;
  const name = lead ? `${lead.first_name} ${lead.last_name}`.trim() : "the client";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 800,
      messages: [{ role: "user", content:
`A yacht broker (Will) just finished a phone call with ${name}. Below is a rough one-sided or speakerphone transcript (may have transcription errors). Extract what matters. Return JSON only:
{"summary":"2-4 sentence call summary for the client file: what was discussed, decisions, next steps, personal details",
"budget_min":int|null,"budget_max":int|null,"loa_min":int|null,"loa_max":int|null,"year_min":int|null,"year_max":int|null,
"make_preference":str|null,"vessel_type_pref":str|null,
"temperature":"hot"|"warm"|"cool"|"cold"|null,
"follow_up":"one line: the single next action, or null"}
Sizes in FEET. Only state what is actually evidenced in the call.
TRANSCRIPT:
${transcript.slice(0, 12000)}` }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const t = (data.content as { type: string; text?: string }[]).filter(b => b.type === "text").map(b => b.text).join("");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  const p = JSON.parse(t.slice(a, b + 1));

  db.prepare(`UPDATE call_recordings SET summary=?, analyzed=1 WHERE id=?`).run(p.summary || "", callId);

  const stamp = new Date().toISOString().slice(0, 10);
  const entry = `📞 Call ${stamp}: ${p.summary || ""}${p.follow_up ? ` → Next: ${p.follow_up}` : ""}`;
  db.prepare(`UPDATE leads SET
    dossier = CASE WHEN dossier IS NULL OR dossier='' THEN ? ELSE dossier || char(10) || char(10) || ? END,
    pinned_temperature = COALESCE(?, pinned_temperature),
    budget_min = CASE WHEN budget_min IS NULL OR budget_min='' THEN COALESCE(?, budget_min) ELSE budget_min END,
    budget_max = CASE WHEN budget_max IS NULL OR budget_max='' THEN COALESCE(?, budget_max) ELSE budget_max END,
    loa_min = CASE WHEN loa_min IS NULL OR loa_min='' THEN COALESCE(?, loa_min) ELSE loa_min END,
    loa_max = CASE WHEN loa_max IS NULL OR loa_max='' THEN COALESCE(?, loa_max) ELSE loa_max END,
    year_min = CASE WHEN year_min IS NULL OR year_min='' THEN COALESCE(?, year_min) ELSE year_min END,
    year_max = CASE WHEN year_max IS NULL OR year_max='' THEN COALESCE(?, year_max) ELSE year_max END,
    make_preference = CASE WHEN make_preference IS NULL OR make_preference='' THEN COALESCE(?, make_preference) ELSE make_preference END,
    vessel_type_pref = CASE WHEN vessel_type_pref IS NULL OR vessel_type_pref='' THEN COALESCE(?, vessel_type_pref) ELSE vessel_type_pref END
    WHERE id=?`).run(entry, entry, p.temperature ?? null,
    p.budget_min ?? null, p.budget_max ?? null, p.loa_min ?? null, p.loa_max ?? null,
    p.year_min ?? null, p.year_max ?? null, p.make_preference ?? null, p.vessel_type_pref ?? null, leadId);

  return p;
}
