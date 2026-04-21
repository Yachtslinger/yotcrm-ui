import { NextResponse } from "next/server";
import {
  deleteNote,
  updateFollowUpStatus,
  updateNoteCategories,
  updateFollowUpDueDate,
  type NoteCategory,
} from "@/lib/notes/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/notes/[id]
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const noteId = Number(id);
    if (!noteId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const deleted = deleteNote(noteId);
    if (!deleted) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/notes/[id]]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// PATCH /api/notes/[id]
// Handles multiple actions:
//   { action: "followup_status", followup_id, status, snooze_until? }
//   { action: "update_categories", categories: NoteCategory[] }
//   { action: "update_due_date",   followup_id, due_date: string | null }
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const noteId = Number(id);
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    }

    // ── Follow-up status change ────────────────────────────────────────────
    if (action === "followup_status" || action === "complete" || action === "dismiss" || action === "snooze") {
      const { followup_id, snooze_until } = body;
      const statusMap: Record<string, "pending" | "completed" | "dismissed" | "snoozed"> = {
        followup_status: body.status,
        complete:  "completed",
        dismiss:   "dismissed",
        snooze:    "snoozed",
      };
      const status = action === "followup_status" ? body.status : statusMap[action];
      if (!status) return NextResponse.json({ ok: false, error: "Unknown status" }, { status: 400 });
      updateFollowUpStatus(Number(followup_id), status, snooze_until);
      return NextResponse.json({ ok: true });
    }

    // ── Category override ──────────────────────────────────────────────────
    if (action === "update_categories") {
      const { categories } = body;
      if (!Array.isArray(categories)) {
        return NextResponse.json({ ok: false, error: "categories must be an array" }, { status: 400 });
      }
      updateNoteCategories(noteId, categories as NoteCategory[]);
      return NextResponse.json({ ok: true });
    }

    // ── Due date override ──────────────────────────────────────────────────
    if (action === "update_due_date") {
      const { followup_id, due_date } = body;
      if (!followup_id) return NextResponse.json({ ok: false, error: "followup_id required" }, { status: 400 });
      updateFollowUpDueDate(Number(followup_id), due_date ?? null);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[PATCH /api/notes/[id]]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
