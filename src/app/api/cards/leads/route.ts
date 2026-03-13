import { NextResponse } from "next/server";
import { insertCardLead } from "@/lib/cards/storage";
import Database from "better-sqlite3";
import { execFile } from "child_process";
import path from "path";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const ALERT_SCRIPT = path.join(
  process.env.HOME || "/Users/willnoftsinger",
  "YotCRM/Scripts/send_lead_alert.scpt"
);

// ── Insert into main leads table so card leads appear in YotCRM UI ──────────
function insertIntoLeads(db: ReturnType<typeof Database>, data: {
  first_name: string; last_name: string;
  email: string; phone: string; notes: string;
}): number {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO leads (first_name, last_name, email, phone, status, tags, notes, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'new', '[]', ?, 'digital_business_card', ?, ?)
  `).run(data.first_name, data.last_name, data.email, data.phone, data.notes, now, now);
  return result.lastInsertRowid as number;
}

// ── Fire iMessage alert (Mac-local only, silently skipped on Railway) ────────
function fireNotification(leadId: number, name: string, email: string, phone: string) {
  if (process.platform !== "darwin") return;
  try {
    const fs = require("fs");
    if (!fs.existsSync(ALERT_SCRIPT)) return;
    execFile("osascript", [
      ALERT_SCRIPT, name, email, phone,
      "(digital card)", String(leadId), "", "", ""
    ], { timeout: 30000 }, (err) => {
      if (err) console.error("[cards] iMessage alert error:", err.message);
      else console.log("[cards] iMessage alert sent for", name);
    });
  } catch (err) {
    console.error("[cards] Failed to fire notification:", err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone, message, card_profile_id, broker_id } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const referrer = req.headers.get("referer") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // 1. Insert into card_leads
    insertCardLead({
      card_profile_id: card_profile_id ?? null,
      broker_id: broker_id ?? "will",
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      message: message?.trim() || null,
      source: "digital_business_card",
      referrer,
      user_agent: userAgent,
    });

    // 2. Also insert into main leads table for YotCRM UI visibility
    const db = new Database(DB_PATH);
    const nameParts = name.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const notes = [
      message ? `Message: ${message.trim()}` : "",
      `Source: Digital Business Card`,
      card_profile_id ? `Card Profile: ${card_profile_id}` : "",
    ].filter(Boolean).join("\n");

    const leadId = insertIntoLeads(db, {
      first_name: firstName,
      last_name: lastName,
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || "",
      notes,
    });
    db.close();

    // 3. Fire iMessage notification (fire-and-forget)
    fireNotification(leadId, name.trim(), email.trim(), phone?.trim() || "");

    return NextResponse.json({ success: true, lead_id: leadId }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cards] POST /api/cards/leads:", message);
    return NextResponse.json({ error: "Failed to submit lead", detail: message }, { status: 500 });
  }
}
