import { NextResponse } from "next/server";
import { getNotesByLead, createNote, createFollowUp, parseNote } from "@/lib/notes/storage";

export const runtime = "nodejs";

// GET /api/notes?lead_id=123
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = Number(searchParams.get("lead_id"));
    if (!leadId || isNaN(leadId)) {
      return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });
    }
    const notes = getNotesByLead(leadId);
    return NextResponse.json({ ok: true, notes });
  } catch (err) {
    console.error("[GET /api/notes]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/notes  — body: { lead_id: number, text: string, created_by?: string }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, text, created_by } = body;

    if (!lead_id || typeof lead_id !== "number") {
      return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });
    }
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
    }

    const author = (created_by as string) || "will";
    const note = createNote(lead_id, text, author);

    // Auto-create a follow-up task if the parser detected action intent
    let followUp = null;
    if (note.intent === "action_required") {
      const parsed = parseNote(text);
      if (parsed.followUp) {
        followUp = createFollowUp(lead_id, parsed.followUp.title, {
          noteId: note.id,
          dueDate: parsed.followUp.dueDate ?? undefined,
          dueConfidence: parsed.followUp.dueConfidence,
          priority: parsed.followUp.priority,
          assignee: author,
        });
      }
    }

    return NextResponse.json({ ok: true, note, followUp });
  } catch (err) {
    console.error("[POST /api/notes]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
