import { NextResponse } from "next/server";
import { getAllPendingFollowUps, updateFollowUpStatus } from "@/lib/notes/storage";

export const runtime = "nodejs";

// GET /api/followups?assignee=will
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assignee = searchParams.get("assignee") || "will";
    const followups = getAllPendingFollowUps(assignee);
    return NextResponse.json({ ok: true, followups });
  } catch (err) {
    console.error("[GET /api/followups]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/followups  — update status
// body: { id: number, action: "complete" | "dismiss" | "snooze", snooze_until?: string }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, action, snooze_until } = body;
    if (!id || !action) {
      return NextResponse.json({ ok: false, error: "id and action required" }, { status: 400 });
    }
    const statusMap: Record<string, "pending" | "completed" | "dismissed" | "snoozed"> = {
      complete: "completed",
      dismiss:  "dismissed",
      snooze:   "snoozed",
    };
    const status = statusMap[action];
    if (!status) return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    updateFollowUpStatus(Number(id), status, snooze_until);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/followups]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
