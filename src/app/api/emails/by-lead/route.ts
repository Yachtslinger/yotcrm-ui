import { NextResponse } from "next/server";
import { getSentEmailsByLead } from "@/lib/emails/storage";

export const runtime = "nodejs";

// GET /api/emails/by-lead?lead_id=123
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = Number(searchParams.get("lead_id"));
    if (!leadId || isNaN(leadId)) {
      return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });
    }
    const emails = getSentEmailsByLead(leadId);
    return NextResponse.json({ ok: true, emails });
  } catch (err) {
    console.error("[GET /api/emails/by-lead]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
