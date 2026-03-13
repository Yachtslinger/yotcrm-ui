import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, message, interest } = await req.json();
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email required" }, { status: 400 });

    const db = new Database(DB_PATH);
    const now = new Date().toISOString();
    const parts = name.trim().split(" ");
    const first = parts[0] || "";
    const last = parts.slice(1).join(" ") || "";

    db.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, source, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'TheYachtCache', 'new', ?, ?, ?)
    `).run(first, last, email, phone || "", `Website inquiry: ${interest || ""}\n\n${message || ""}`, now, now);
    db.close();

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
