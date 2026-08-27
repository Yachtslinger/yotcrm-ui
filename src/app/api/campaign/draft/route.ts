// src/app/api/campaign/draft/route.ts
// Save / list / load / delete campaign drafts (logged-in only, via middleware cookie gate).
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB = process.env.DB_PATH || "/data/yotcrm.db";

function db() {
  const d = new Database(DB);
  d.exec(`CREATE TABLE IF NOT EXISTS campaign_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT, blob TEXT, updated_at TEXT)`);
  try { d.exec("ALTER TABLE campaign_drafts ADD COLUMN kind TEXT DEFAULT 'listing'"); } catch { /* exists */ }
  return d;
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const d = db();
    if (id) {
      const row = d.prepare("SELECT id,name,blob FROM campaign_drafts WHERE id=?").get(id) as any;
      d.close();
      if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
      return NextResponse.json({ ok: true, id: row.id, name: row.name, ...JSON.parse(row.blob || "{}") });
    }
    const kind = req.nextUrl.searchParams.get("kind");
    const rows = kind
      ? d.prepare("SELECT id,name,slug,kind,updated_at FROM campaign_drafts WHERE kind=? ORDER BY updated_at DESC LIMIT 100").all(kind)
      : d.prepare("SELECT id,name,slug,kind,updated_at FROM campaign_drafts ORDER BY updated_at DESC LIMIT 100").all();
    d.close();
    return NextResponse.json({ ok: true, drafts: rows });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, draft, allImages } = body;
    if (!draft) return NextResponse.json({ ok: false, error: "draft required" }, { status: 400 });
    const blob = JSON.stringify({ draft, allImages: allImages || [] });
    const d = db();
    const kind = draft && draft.kind === "boatshow" ? "boatshow" : "listing";
    const dispName = name || draft.headline || (draft.show && draft.show.name) || "Untitled";
    let outId = id;
    if (id) {
      d.prepare("UPDATE campaign_drafts SET name=?, slug=?, blob=?, kind=?, updated_at=datetime('now') WHERE id=?")
        .run(dispName, draft.slug || "", blob, kind, id);
    } else {
      const r = d.prepare("INSERT INTO campaign_drafts (name,slug,blob,kind,updated_at) VALUES (?,?,?,?,datetime('now'))")
        .run(dispName, draft.slug || "", blob, kind);
      outId = r.lastInsertRowid;
    }
    d.close();
    return NextResponse.json({ ok: true, id: outId });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const d = db(); d.prepare("DELETE FROM campaign_drafts WHERE id=?").run(id); d.close();
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
