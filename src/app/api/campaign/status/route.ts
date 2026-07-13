// src/app/api/campaign/status/route.ts
// Send status for a listing: who was sent, how many, and how many verified buyers remain.
// GET ?slug=X            -> JSON { sentCount, remaining, sent:[{email,sent_at}] }
// GET ?slug=X&format=csv -> CSV download of who was sent
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

export async function GET(req: NextRequest) {
  try {
    const slug = (req.nextUrl.searchParams.get("slug") || "").replace(/[^a-zA-Z0-9._-]/g, "");
    const fmt = req.nextUrl.searchParams.get("format");
    if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });

    const d = new Database(DB);
    d.exec(`CREATE TABLE IF NOT EXISTS campaign_sends (slug TEXT, email TEXT, sent_at TEXT, PRIMARY KEY(slug,email))`);
    d.exec(`CREATE TABLE IF NOT EXISTS campaign_suppressions (email TEXT PRIMARY KEY, source TEXT, created_at TEXT)`);

    const sent = d.prepare("SELECT email, sent_at FROM campaign_sends WHERE slug=? ORDER BY sent_at").all(slug) as { email: string; sent_at: string }[];
    const remaining = d.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT DISTINCT LOWER(TRIM(email)) e FROM leads
        WHERE segment='buyer' AND email_status='verified'
          AND LOWER(TRIM(email)) NOT IN (SELECT email FROM campaign_suppressions)
          AND LOWER(TRIM(email)) NOT IN (SELECT email FROM campaign_sends WHERE slug=@slug))`).get({ slug }).c as number;
    d.close();

    if (fmt === "csv") {
      const rows = ["email,sent_at", ...sent.map(s => `${s.email},${s.sent_at}`)].join("\n");
      return new NextResponse(rows, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="sent-${slug}.csv"` },
      });
    }
    return NextResponse.json({ ok: true, slug, sentCount: sent.length, remaining, sent });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
