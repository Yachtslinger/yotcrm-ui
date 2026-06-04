/**
 * POST /api/comms/capture-action  { threadId: number, action: "keep" | "toss" }
 * Triage a borderline (role-address) capture from the review queue.
 *   keep — promote to a confirmed contact (clears the created_new_review flag, thread -> reviewed)
 *   toss — delete the comms_capture lead (FK-safe) and dismiss the thread
 * Authed CRM-internal route (not on the public ingest allowlist).
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function getDb() { const db = new Database(DB_PATH); db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = OFF"); return db; }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const threadId = Number((body as { threadId?: unknown }).threadId);
  const action = String((body as { action?: unknown }).action ?? "");
  if (!Number.isInteger(threadId) || !["keep", "toss"].includes(action)) {
    return NextResponse.json({ ok: false, error: "threadId (int) + action ('keep'|'toss') required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT cm.lead_id as lead_id
      FROM comms_contact_matches cm JOIN comms_messages m ON cm.message_id = m.id
      WHERE m.thread_id = ? ORDER BY cm.id DESC LIMIT 1
    `).get(threadId) as { lead_id: number | null } | undefined;
    const leadId = row?.lead_id ?? null;

    if (action === "keep") {
      db.prepare(`
        UPDATE comms_contact_matches SET match_method = 'created_new'
        WHERE id IN (
          SELECT cm.id FROM comms_contact_matches cm JOIN comms_messages m ON cm.message_id = m.id
          WHERE m.thread_id = ? AND cm.match_method = 'created_new_review'
        )`).run(threadId);
      db.prepare("UPDATE comms_threads SET status = 'reviewed' WHERE id = ?").run(threadId);
      return NextResponse.json({ ok: true, action: "keep", threadId, leadId });
    }

    // toss
    let deletedLead = false;
    if (leadId) {
      const lead = db.prepare("SELECT source FROM leads WHERE id = ?").get(leadId) as { source: string } | undefined;
      if (lead && lead.source === "comms_capture") {
        for (const stmt of [
          "DELETE FROM boats WHERE lead_id = ?",
          "DELETE FROM comms_contact_matches WHERE lead_id = ?",
          "DELETE FROM sent_emails WHERE lead_id = ?",
          "UPDATE comms_threads SET lead_id = NULL WHERE lead_id = ?",
          "UPDATE email_ingest_failures SET resolved_lead_id = NULL WHERE resolved_lead_id = ?",
        ]) { try { db.prepare(stmt).run(leadId); } catch { /* table may not exist */ } }
        const res = db.prepare("DELETE FROM leads WHERE id = ? AND source = 'comms_capture'").run(leadId);
        deletedLead = res.changes > 0;
      }
    }
    db.prepare("UPDATE comms_threads SET status = 'dismissed' WHERE id = ?").run(threadId);
    return NextResponse.json({ ok: true, action: "toss", threadId, leadId, deletedLead });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally { db.close(); }
}
