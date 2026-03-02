import { NextResponse } from "next/server";
import { overrideScore, optOutLead } from "@/lib/intel/storage";

export const runtime = "nodejs";

/**
 * POST /api/intel/override
 * Body: { lead_id, score, reason, actor } for score override
 * Body: { lead_id, action: "opt_out", actor } for GDPR/CCPA opt-out
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, actor = "broker" } = body;
    if (!lead_id) return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });

    if (body.action === "opt_out") {
      const ok = optOutLead(lead_id, actor);
      return NextResponse.json({ ok, message: "Enrichment data removed" });
    }

    const { score, reason } = body;
    if (score === undefined || !reason) {
      return NextResponse.json({ ok: false, error: "score and reason required" }, { status: 400 });
    }
    if (score < 0 || score > 100) {
      return NextResponse.json({ ok: false, error: "score must be 0-100" }, { status: 400 });
    }

    const ok = overrideScore(lead_id, score, reason, actor);
    return NextResponse.json({ ok, score, message: ok ? "Score overridden" : "Profile not found" });
  } catch (err) {
    console.error("[Intel] Override error:", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
