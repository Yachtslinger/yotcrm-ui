// src/app/api/campaign/unsubscribe/route.ts
// Records a marketing opt-out and shows a confirmation page.
// GET /api/campaign/unsubscribe?e=<email>
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

function suppress(email: string) {
  const db = new Database(DB);
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_suppressions (
    email TEXT PRIMARY KEY, source TEXT DEFAULT 'unsubscribe', created_at TEXT NOT NULL)`);
  db.prepare(`INSERT OR IGNORE INTO campaign_suppressions (email, created_at) VALUES (?, datetime('now'))`)
    .run(email.trim().toLowerCase());
  db.close();
}

function page(msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribe</title></head>
  <body style="font-family:Georgia,serif;background:#f1f5f9;margin:0;padding:60px 20px;text-align:center;color:#0b2a55">
    <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:10px;padding:40px 28px">
      <div style="font-size:20px;font-weight:800;margin-bottom:10px">Denison Yachting</div>
      <p style="font-size:16px;line-height:1.6;color:#334155">${msg}</p>
    </div></body></html>`;
}

export async function GET(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get("e") || "").trim();
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  if (ok) { try { suppress(e); } catch { /* non-fatal */ } }
  const msg = ok
    ? `You've been unsubscribed. You will no longer receive marketing emails at <strong>${e.replace(/</g,"")}</strong>.`
    : `We couldn't read that email address. Please contact WN@DenisonYachting.com to opt out.`;
  return new NextResponse(page(msg), { headers: { "Content-Type": "text/html" } });
}
