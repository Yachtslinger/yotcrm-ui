/**
 * PATCH /api/comms/review/[extractionId] — edit fields
 * POST  /api/comms/review/[extractionId]/approve — approve & apply
 * POST  /api/comms/review/[extractionId]/reject  — dismiss
 */
import { NextRequest, NextResponse } from "next/server";
import { getExtraction, updateExtraction, appendCorrection, logContactMatch } from "@/lib/comms/storage";
import { applyExtractionToLead } from "@/lib/comms/contact-matcher";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// PATCH — edit one or more extracted fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ extractionId: string }> }) {
  const { extractionId } = await params;
  const id = parseInt(extractionId);
  const extraction = getExtraction(id);
  if (!extraction) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const { field, value, corrected_by } = body;
  if (!field) return NextResponse.json({ ok: false, error: "field required" }, { status: 400 });
  appendCorrection(id, { field, old_value: (extraction as Record<string, unknown>)[field], new_value: value, corrected_by: corrected_by ?? "broker" });
  updateExtraction(id, { [field]: typeof value === "object" ? JSON.stringify(value) : value });
  return NextResponse.json({ ok: true });
}

// POST — bulk update fields (for review form submission)
export async function POST(req: NextRequest, { params }: { params: Promise<{ extractionId: string }> }) {
  const { extractionId } = await params;
  const id = parseInt(extractionId);
  const extraction = getExtraction(id);
  if (!extraction) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = req.nextUrl.searchParams.get("action") ?? body.action;

  if (action === "reject") {
    updateExtraction(id, { status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: body.reviewed_by ?? "broker" });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "approve") {
    // Get the latest extraction state (may have been edited via PATCH)
    const fresh = getExtraction(id)!;
    let writtenFields: string[] = [];
    let conflicts: { field: string; existing: string; incoming: string }[] = [];
    // Apply non-empty contact + yacht fields to lead if we have one
    const db = new Database(DB_PATH);
    try {
      const match = db.prepare("SELECT lead_id FROM comms_contact_matches WHERE message_id = ? ORDER BY confidence DESC LIMIT 1").get(fresh.message_id) as { lead_id: number } | undefined;
      const leadId = match?.lead_id;
      if (leadId) {
        const result = applyExtractionToLead(leadId, {
          email: fresh.contact_email ?? undefined,
          phone: fresh.contact_phone ?? undefined,
          first_name: fresh.contact_name?.split(" ")[0] ?? undefined,
          last_name: fresh.contact_name?.split(" ").slice(1).join(" ") ?? undefined,
          company: fresh.contact_company ?? undefined,
          // Yacht intelligence — Phase 2 sync
          intent: fresh.intent ?? undefined,
          budget_range: fresh.budget_range ?? undefined,
          timeline: fresh.timeline ?? undefined,
          yacht_makes: fresh.yacht_makes,
          yacht_models: fresh.yacht_models,
          yacht_length_range: fresh.yacht_length_range ?? undefined,
          year_range: fresh.year_range ?? undefined,
          location_pref: fresh.location_pref ?? undefined,
          features_mentioned: fresh.features_mentioned,
          lead_category: fresh.lead_category ?? undefined,
          summary: fresh.summary ?? undefined,
        });
        writtenFields = result.written;
        conflicts = result.conflicts;
      }
      // Create approved tasks as todos
      if (fresh.suggested_tasks?.length) {
        for (const task of fresh.suggested_tasks) {
          const due = new Date();
          due.setDate(due.getDate() + (task.due_days ?? 1));
          db.prepare(`INSERT INTO todos (text, priority, lead_id, due_date, assignee, todo_type, queue, email_draft, created_at)
            VALUES (?, ?, ?, ?, 'will', 'comms_capture', 'human', '', datetime('now'))`
          ).run(task.text, task.priority ?? "medium", leadId ?? null, due.toISOString().substring(0, 10));
        }
      }
      // Save draft reply to botqueue if present
      if (fresh.draft_reply) {
        db.prepare(`INSERT INTO todos (text, priority, lead_id, due_date, assignee, todo_type, queue, email_draft, created_at)
          VALUES (?, 'high', ?, datetime('now', '+1 day'), 'will', 'comms_draft', 'human', ?, datetime('now'))`
        ).run(`Draft reply: ${fresh.draft_subject ?? "Follow up"}`, leadId ?? null, fresh.draft_reply);
      }
    } finally { db.close(); }

    updateExtraction(id, { status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: body.reviewed_by ?? "broker" });
    return NextResponse.json({ ok: true, status: "approved", written: writtenFields, conflicts });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
