// src/app/api/campaign/send-group/route.ts
// Group send with hard safety rails.
// POST { slug, type, group?, limit, dryRun? }  (X-Campaign-Key header)
//   group: "verified" (default) | "buyer"
//   limit: REQUIRED wave size (warm-up); capped at 2000
//   dryRun: true = preview recipient count + sample, send nothing
// Rails: verified-only by default, excludes anyone suppressed/unsubscribed,
// never re-sends to someone already sent THIS slug, batches of 100 via Resend.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure } from "@/lib/brochure-storage";
import { buildEmail, buildEmailFromDraft } from "@/lib/campaign/quickEmail";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("x-campaign-key") || "";
    const cookie = req.cookies.get("yotcrm_session")?.value || "";
    if (key !== (process.env.CAMPAIGN_KEY || "yotcrm-campaign-2026") && cookie.length < 10) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const slug = String(body.slug || "").replace(/[^a-zA-Z0-9._-]/g, "");
    const type = body.type || "newlisting";
    const group = body.group === "buyer" ? "buyer" : "verified";
    const draft = body.draft;
    const dryRun = body.dryRun === true;
    let limit = parseInt(body.limit, 10);
    if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
    if (!dryRun && (!Number.isFinite(limit) || limit < 1)) {
      return NextResponse.json({ ok: false, error: "limit required for a real send (warm-up wave size)" }, { status: 400 });
    }
    if (!Number.isFinite(limit)) limit = 5;
    limit = Math.min(limit, 2000);

    let row: any = null;
    try { row = getBrochure(slug); } catch {}
    if (!row && !draft) return NextResponse.json({ ok: false, error: "Load a listing first (no draft or brochure to send)." }, { status: 400 });

    const d = new Database(DB);
    d.exec(`CREATE TABLE IF NOT EXISTS campaign_suppressions (email TEXT PRIMARY KEY, source TEXT DEFAULT 'unsubscribe', created_at TEXT NOT NULL)`);
    d.exec(`CREATE TABLE IF NOT EXISTS campaign_sends (slug TEXT, email TEXT, sent_at TEXT, PRIMARY KEY(slug,email))`);

    const statusClause = group === "verified" ? "AND email_status='verified'" : "";
    const eligibleSql = `
      SELECT DISTINCT LOWER(TRIM(email)) e FROM leads
      WHERE segment='buyer' ${statusClause}
        AND LOWER(TRIM(email)) NOT IN (SELECT email FROM campaign_suppressions)
        AND LOWER(TRIM(email)) NOT IN (SELECT email FROM campaign_sends WHERE slug=@slug)`;
    const totalEligible = d.prepare(`SELECT COUNT(*) c FROM (${eligibleSql})`).get({ slug }).c as number;
    const recips = d.prepare(`${eligibleSql} LIMIT @lim`).all({ slug, lim: limit }).map((r: any) => r.e);

    if (dryRun) {
      d.close();
      return NextResponse.json({
        ok: true, dryRun: true, group,
        remainingInGroup: totalEligible,
        wouldSendThisWave: Math.min(recips.length, limit),
        sample: recips.slice(0, 5),
      });
    }

    if (!recips.length) {
      d.close();
      return NextResponse.json({ ok: true, sent: 0, note: "no eligible recipients left for this group/listing", remainingInGroup: 0 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { d.close(); return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 }); }
    const from = `Denison Yachting <${process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`;
    const logSend = d.prepare("INSERT OR IGNORE INTO campaign_sends (slug,email,sent_at) VALUES (?,?,datetime('now'))");

    let sent = 0, failed = 0;
    for (let i = 0; i < recips.length; i += 100) {
      const chunk = recips.slice(i, i + 100);
      const messages = chunk.map(email => {
        const { html, subject } = draft ? buildEmailFromDraft(draft, email) : buildEmail(slug, type, row!.vessel, email);
        return { from, to: [email], reply_to: "WN@DenisonYachting.com", subject, html };
      });
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
        if (res.status === 200) {
          for (const e of chunk) logSend.run(slug, e);
          sent += chunk.length;
        } else {
          failed += chunk.length;
          if (res.status === 429) break;
        }
      } catch { failed += chunk.length; }
      await new Promise(r => setTimeout(r, 600));
    }

    const remaining = d.prepare(`SELECT COUNT(*) c FROM (${eligibleSql})`).get({ slug }).c as number;
    d.close();
    return NextResponse.json({ ok: true, group, sent, failed, remainingInGroup: remaining });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
