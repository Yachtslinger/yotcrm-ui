import { NextResponse } from "next/server";
import {
  getUnresolvedFailures,
  resolveIngestFailure,
  createSentEmail,
} from "@/lib/emails/storage";

export const runtime = "nodejs";

// GET /api/emails/failed — list unresolved ingest failures
export async function GET() {
  try {
    const failures = getUnresolvedFailures();
    return NextResponse.json({ ok: true, failures, count: failures.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// POST /api/emails/failed — resolve a failure by attaching to a lead
// body: { failure_id: number, lead_id: number }
export async function POST(req: Request) {
  try {
    const { failure_id, lead_id } = await req.json();
    if (!failure_id || !lead_id) {
      return NextResponse.json({ ok: false, error: "failure_id and lead_id required" }, { status: 400 });
    }

    // Fetch the raw payload to re-create the sent_email record
    const failures = getUnresolvedFailures();
    const failure = failures.find(f => f.id === Number(failure_id));
    if (!failure) {
      return NextResponse.json({ ok: false, error: "Failure not found or already resolved" }, { status: 404 });
    }

    // Parse the raw payload and create the sent_email attached to the chosen lead
    let raw: any = {};
    try { raw = JSON.parse(failure.raw_payload); } catch {}

    createSentEmail({
      messageId: failure.message_id || `manual-${failure.id}-${Date.now()}`,
      leadId: Number(lead_id),
      subject: failure.subject,
      bodyPlain: raw.body_plain || "",
      toAddresses: raw.to_addresses || [failure.to_address],
      ccAddresses: raw.cc_addresses || [],
      fromAddress: raw.from_address || "",
      sentAt: raw.sent_at || new Date().toISOString(),
      matchConfidence: "high",
    });

    resolveIngestFailure(Number(failure_id), Number(lead_id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/emails/failed]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
