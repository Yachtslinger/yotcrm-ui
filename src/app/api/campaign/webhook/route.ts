// src/app/api/campaign/webhook/route.ts
// Resend event webhook. On a bounce or spam-complaint, permanently suppress the
// address so it's never emailed again (self-cleaning list). On delivery/open,
// mark the address engaged so we build a "known-good" pool over time.
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

function db() { return new Database(DB); }

function ensure(d: Database.Database) {
  d.exec(`CREATE TABLE IF NOT EXISTS campaign_suppressions (
    email TEXT PRIMARY KEY, source TEXT DEFAULT 'unsubscribe', created_at TEXT NOT NULL)`);
}

export async function POST(req: NextRequest) {
  try {
    const evt = await req.json();
    const type: string = evt?.type || "";
    const to: string[] = Array.isArray(evt?.data?.to) ? evt.data.to
      : (evt?.data?.to ? [evt.data.to] : []);
    const emails = to.map(e => String(e).toLowerCase().replace(/.*<|>.*/g, "").trim()).filter(Boolean);
    if (!emails.length) return NextResponse.json({ ok: true, note: "no recipient" });

    const d = db();
    ensure(d);

    if (/bounced|complained|failed/i.test(type)) {
      const src = /complained/i.test(type) ? "complaint" : "bounce";
      const supp = d.prepare("INSERT OR IGNORE INTO campaign_suppressions (email, source, created_at) VALUES (?,?,datetime('now'))");
      const mark = d.prepare("UPDATE leads SET email_status='bounced', segment='suppressed' WHERE LOWER(TRIM(email))=?");
      for (const e of emails) { supp.run(e, src); try { mark.run(e); } catch {} }
      d.close();
      return NextResponse.json({ ok: true, suppressed: emails, source: src });
    }

    if (/delivered|opened|clicked/i.test(type)) {
      const eng = /clicked|opened/i.test(type) ? "engaged" : "delivered";
      const mark = d.prepare("UPDATE leads SET email_status=? WHERE LOWER(TRIM(email))=? AND email_status='mailable'");
      for (const e of emails) { try { mark.run(eng, e); } catch {} }
      d.close();
      return NextResponse.json({ ok: true, marked: eng, emails });
    }

    d.close();
    return NextResponse.json({ ok: true, ignored: type });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}
