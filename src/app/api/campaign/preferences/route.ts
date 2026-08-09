// src/app/api/campaign/preferences/route.ts
// Topic-level email preferences. Lets a recipient stop ONE kind of email
// (e.g. event invites) without unsubscribing from everything.
// GET /api/campaign/preferences?e=<email>&topic=events            -> choice page
// GET /api/campaign/preferences?e=<email>&topic=events&action=optout -> records opt-out
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

const TOPICS: Record<string, string> = {
  events: "event & boat show invitations",
  listings: "new listing & price-drop emails",
  news: "market & industry news",
};

function optOut(email: string, topic: string) {
  const db = new Database(DB);
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_topic_optouts (
    email TEXT NOT NULL, topic TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (email, topic))`);
  db.prepare(`INSERT OR IGNORE INTO campaign_topic_optouts (email, topic, created_at)
    VALUES (?, ?, datetime('now'))`).run(email.trim().toLowerCase(), topic);
  db.close();
}

function shell(inner: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email preferences</title></head>
  <body style="font-family:Georgia,serif;background:#f1f5f9;margin:0;padding:60px 20px;text-align:center;color:#0b2a55">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:10px;padding:40px 28px">
      <div style="font-size:20px;font-weight:800;margin-bottom:14px">Denison Yachting</div>
      ${inner}
    </div></body></html>`;
}

export async function GET(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get("e") || "").trim();
  const topic = (req.nextUrl.searchParams.get("topic") || "events").trim().toLowerCase();
  const action = (req.nextUrl.searchParams.get("action") || "").trim().toLowerCase();
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const topicLabel = TOPICS[topic] || "these emails";

  if (!validEmail) {
    return new NextResponse(shell(`<p style="font-size:16px;line-height:1.6;color:#334155">We couldn't read your email address. Please contact WN@DenisonYachting.com and we'll update your preferences.</p>`), { headers: { "Content-Type": "text/html" } });
  }

  if (action === "optout") {
    try { optOut(e, topic); } catch { /* non-fatal */ }
    return new NextResponse(shell(`<p style="font-size:16px;line-height:1.6;color:#334155">Done. You'll no longer receive <strong>${topicLabel}</strong> at ${e.replace(/</g, "")}. You'll still get our other updates. Changed your mind? Just reply to any email.</p>`), { headers: { "Content-Type": "text/html" } });
  }

  const optoutUrl = `/api/campaign/preferences?e=${encodeURIComponent(e)}&topic=${encodeURIComponent(topic)}&action=optout`;
  const unsubUrl = `/api/campaign/unsubscribe?e=${encodeURIComponent(e)}`;
  const inner = `
    <p style="font-size:16px;line-height:1.6;color:#334155">Manage what you hear from us at <strong>${e.replace(/</g, "")}</strong>.</p>
    <a href="${optoutUrl}" style="display:block;margin:14px 0;background:#0b2a55;color:#fff;text-decoration:none;padding:14px 18px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:14px">Stop only ${topicLabel}</a>
    <a href="${unsubUrl}" style="display:block;margin:8px 0;color:#64748b;text-decoration:underline;font-family:Arial,Helvetica,sans-serif;font-size:13px">Unsubscribe from all Denison emails</a>`;
  return new NextResponse(shell(inner), { headers: { "Content-Type": "text/html" } });
}
