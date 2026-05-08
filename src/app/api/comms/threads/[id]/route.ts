import { NextRequest, NextResponse } from "next/server";
import { getThread, getThreadMessages, getLatestExtraction } from "@/lib/comms/storage";
export const runtime = "nodejs";
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const thread = getThread(parseInt(params.id));
  if (!thread) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const messages = getThreadMessages(thread.id);
  const extractions = messages.map(m => ({ message_id: m.id, extraction: getLatestExtraction(m.id) }));
  return NextResponse.json({ ok: true, thread, messages, extractions });
}
