import { NextResponse } from "next/server";
import { buildDigest, formatDigestSMS } from "@/lib/notes/digest";
import { sendSMS } from "@/lib/sms";
import { logMorningSend } from "@/lib/health";

export const runtime = "nodejs";

// GET /api/morning-text?assignee=will
// Returns the text preview without sending — used by Settings "Preview" button
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assignee = searchParams.get("assignee") || "will";

    const items = buildDigest(assignee);
    const message = formatDigestSMS(items, assignee);

    return NextResponse.json({ ok: true, message, itemCount: items.length, items });
  } catch (err) {
    console.error("[GET /api/morning-text]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/morning-text  — body: { assignee?: string, to?: string }
// Builds digest and sends it. "to" overrides the MORNING_TEXT_TO env var (for test sends).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const assignee = (body.assignee as string) || "will";
    const to = (body.to as string) || process.env.MORNING_TEXT_TO || "";

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "No recipient phone number. Set MORNING_TEXT_TO env var or pass 'to' in request body." },
        { status: 400 }
      );
    }

    const items = buildDigest(assignee);
    const message = formatDigestSMS(items, assignee);
    const result = await sendSMS(to, message);

    if (!result.ok) {
      logMorningSend(assignee, items.length, to, "error", result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    logMorningSend(assignee, items.length, to, "ok");
    console.log(`[morning-text] Sent to ${to} — ${items.length} items — SID: ${result.sid}`);
    return NextResponse.json({ ok: true, sid: result.sid, itemCount: items.length, message });
  } catch (err) {
    console.error("[POST /api/morning-text]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
