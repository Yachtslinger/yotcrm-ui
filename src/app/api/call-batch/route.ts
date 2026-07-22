import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const PAOLO_EMAIL = "pa@denisonyachting.com";

const DDL = `
CREATE TABLE IF NOT EXISTS call_batches (
  id INTEGER PRIMARY KEY, assignee TEXT DEFAULT 'paolo', note TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS call_batch_items (
  id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL, lead_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', outcome TEXT,
  UNIQUE(batch_id, lead_id));`;

function getDb() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  db.exec(DDL);
  db.pragma("journal_mode = WAL");
  return db;
}

const fmtB = (v: unknown) => {
  const n = Number(v); if (!n) return null;
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
};

// GET /api/call-batch — recent batches with progress
export async function GET() {
  const db = getDb();
  try {
    const batches = db.prepare(`
      SELECT b.id, b.note, b.created_at,
        COUNT(i.id) total, SUM(i.status='called') called
      FROM call_batches b LEFT JOIN call_batch_items i ON i.batch_id=b.id
      GROUP BY b.id ORDER BY b.id DESC LIMIT 12`).all();
    return NextResponse.json({ batches });
  } finally { db.close(); }
}

// POST /api/call-batch — { count?, budgetMin?, budgetMax?, category? }
// Picks N random eligible prospects, records the batch, emails the list to Paolo.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const count = Math.min(Number(body.count) || 30, 60);
  const budgetMin = body.budgetMin != null ? Number(body.budgetMin) : null;
  const budgetMax = body.budgetMax != null ? Number(body.budgetMax) : null;
  const category = typeof body.category === "string" && body.category !== "all" ? body.category : null;

  const db = getDb();
  try {
    const conds = [
      `COALESCE(l.phone,'') != ''`,
      `COALESCE(l.category,'') NOT IN ('dead_dnc','vendor','co_broker')`,
      // not already assigned in the last 30 days
      `l.id NOT IN (SELECT i.lead_id FROM call_batch_items i JOIN call_batches b ON b.id=i.batch_id
                    WHERE b.created_at >= datetime('now','-30 days'))`,
    ];
    const params: unknown[] = [];
    if (budgetMin != null || budgetMax != null) {
      conds.push(`((COALESCE(l.budget_min,'') != '' OR COALESCE(l.budget_max,'') != '')
        AND COALESCE(CAST(l.budget_min AS INTEGER), 0) <= ?
        AND COALESCE(CAST(l.budget_max AS INTEGER), 2000000000) >= ?)`);
      params.push(budgetMax ?? 2000000000, budgetMin ?? 0);
    }
    if (category === "uncategorized") conds.push(`l.category IS NULL`);
    else if (category) { conds.push(`l.category = ?`); params.push(category); }

    const picks = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.phone, l.email,
             l.budget_min, l.budget_max, l.loa_min, l.loa_max,
             l.pinned_temperature, l.last_contacted_at, l.dossier, l.make_preference, l.vessel_type_pref
      FROM leads l WHERE ${conds.join(" AND ")}
      ORDER BY RANDOM() LIMIT ?`).all(...params, count) as Record<string, unknown>[];

    if (picks.length === 0) return NextResponse.json({ ok: false, error: "No eligible prospects match — loosen the filter or wait out the 30-day no-repeat window." }, { status: 400 });

    const note = [
      budgetMin != null || budgetMax != null ? `budget ${fmtB(budgetMin) || "$0"}–${fmtB(budgetMax) || "open"}` : null,
      category, `${picks.length} contacts`,
    ].filter(Boolean).join(" · ");
    const b = db.prepare(`INSERT INTO call_batches (assignee, note) VALUES ('paolo', ?)`).run(note);
    const batchId = Number(b.lastInsertRowid);
    const ins = db.prepare(`INSERT OR IGNORE INTO call_batch_items (batch_id, lead_id) VALUES (?,?)`);
    for (const p of picks) ins.run(batchId, p.id);

    // Build the email
    const rows = picks.map((p, i) => {
      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "(no name)";
      const budget = (p.budget_min || p.budget_max) ? ` · ${fmtB(p.budget_min) || "?"}–${fmtB(p.budget_max) || "?"}` : "";
      const size = (p.loa_min || p.loa_max) ? ` · ${p.loa_min || "?"}–${p.loa_max || "?"}ft` : "";
      const pref = [p.make_preference, p.vessel_type_pref].filter(Boolean).join(" ");
      const temp = p.pinned_temperature ? ` [${String(p.pinned_temperature).toUpperCase()}]` : "";
      const brief = String(p.dossier || "").split(/(?<=\.)\s/)[0].slice(0, 160);
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top"><b>${i + 1}. ${name}</b>${temp}<br>
        📱 <a href="tel:${p.phone}">${p.phone}</a>${budget}${size}${pref ? ` · ${pref}` : ""}<br>
        <span style="color:#555;font-size:13px">${brief}</span></td></tr>`;
    }).join("");
    const html = `<div style="font-family:Georgia,serif;max-width:640px">
      <p>Paolo — call list #${batchId}: <b>${picks.length} prospects</b>${note ? ` (${note})` : ""}. Random order, all have phones. Notes under each name tell you who they are.</p>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
      <p style="color:#777;font-size:12px">Generated by YotBot · ${new Date().toISOString().slice(0, 10)}</p></div>`;

    let emailed = false;
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Will Noftsinger <will@mail.theyachtcache.com>",
          to: [PAOLO_EMAIL],
          subject: `Call list #${batchId} — ${picks.length} prospects${note ? ` · ${note}` : ""}`,
          html,
        }),
      });
      emailed = res.ok;
    }
    return NextResponse.json({ ok: true, batchId, count: picks.length, emailed });
  } finally { db.close(); }
}
