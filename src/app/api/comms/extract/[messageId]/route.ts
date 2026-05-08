import { NextRequest, NextResponse } from "next/server";
import { getMessage, createExtraction, getLatestExtraction } from "@/lib/comms/storage";
import { runExtraction } from "@/lib/comms/extractor";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(_req: NextRequest, { params }: { params: { messageId: string } }) {
  const msgId = parseInt(params.messageId);
  const msg = getMessage(msgId);
  if (!msg) return NextResponse.json({ ok: false, error: "Message not found" }, { status: 404 });
  // Create fresh extraction record
  createExtraction(msgId);
  try {
    await runExtraction(msgId);
    const extraction = getLatestExtraction(msgId);
    return NextResponse.json({ ok: true, extraction });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
