// src/app/api/campaign/rsvp/route.ts
// Captures a boat-show RSVP and shows a confirmation page.
// GET /api/campaign/rsvp?e=<email>&show=<slug>&r=<yes|no|maybe>
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

function record(email: string, show: string, response: string) {
  const db = new Database(DB);
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_rsvps (
    email TEXT NOT NULL,
    show TEXT NOT NULL DEFAULT '',
    response TEXT NOT NULL DEFAULT 'yes',
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, show))`);
  db.prepare(`INSERT INTO campaign_rsvps (email, show, response, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(email, show) DO UPDATE SET response=excluded.response, created_at=excluded.created_at`)
    .run(email.trim().toLowerCase(), show, response);
  db.close();
}

function page(title: string, msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="font-family:Georgia,serif;background:#f1f5f9;margin:0;padding:60px 20px;text-align:center;color:#0b2a55">
    <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:10px;padding:40px 28px">
      <div style="font-size:20px;font-weight:800;margin-bottom:10px">Denison Yachting</div>
      <p style="font-size:16px;line-height:1.6;color:#334155">${msg}</p>
    </div></body></html>`;
}

export async function GET(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get("e") || "").trim();
  const show = (req.nextUrl.searchParams.get("show") || "").trim().slice(0, 120);
  const rRaw = (req.nextUrl.searchParams.get("r") || "yes").trim().toLowerCase();
  const response = ["yes", "no", "maybe"].includes(rRaw) ? rRaw : "yes";
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  if (ok) { try { record(e, show, response); } catch { /* non-fatal */ } }
  const msg = ok
    ? `Thank you — your RSVP is in. Will Noftsinger will reach out to set aside time to see a few boats together. Prefer to pick a moment now? Just reply to the invitation email.`
    : `We couldn't read your details. Please reply to the invitation email or contact WN@DenisonYachting.com and we'll take care of it.`;
  return new NextResponse(page("RSVP received", msg), { headers: { "Content-Type": "text/html" } });
}
