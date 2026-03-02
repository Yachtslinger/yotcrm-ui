import { NextResponse } from "next/server";
import {
  getProfileByLeadId,
  upsertProfile,
  getSourcesByLead,
  getAuditLog,
  logAuditEvent,
  scoreBandLabel,
} from "@/lib/intel/storage";
import { scoreAndSave } from "@/lib/intel/scoring";
import { enrichLead } from "@/lib/intel/orchestrator";

export const runtime = "nodejs";

/**
 * GET /api/intel/profile?lead_id=123
 * Returns enrichment profile, sources, and audit log for a lead.
 */
export async function GET(req: Request) {
  try {
    const leadId = Number(new URL(req.url).searchParams.get("lead_id"));
    if (!leadId) return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });

    const profile = getProfileByLeadId(leadId);
    if (!profile) {
      return NextResponse.json({ ok: true, profile: null, message: "No enrichment profile yet" });
    }

    const sources = getSourcesByLead(leadId);
    const auditLog = getAuditLog(leadId);

    return NextResponse.json({
      ok: true,
      profile: {
        ...profile,
        score_breakdown: JSON.parse(profile.score_breakdown || "[]"),
        identity_data: JSON.parse(profile.identity_data || "{}"),
        capital_data: JSON.parse(profile.capital_data || "{}"),
        risk_data: JSON.parse(profile.risk_data || "{}"),
        engagement_data: JSON.parse(profile.engagement_data || "{}"),
        band_label: scoreBandLabel(profile.score_band),
      },
      sources,
      audit_log: auditLog.slice(0, 50),
      disclaimer: "Profile generated from public sources. Not financial verification.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Intel] Profile fetch error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/intel/profile
 * Body: { lead_id: number, action?: "enrich" | "rescore" }
 * Creates or updates enrichment profile. "rescore" recomputes from existing sources.
 */
export async function POST(req: Request) {
  try {
    const { lead_id, action = "enrich" } = await req.json();
    if (!lead_id) return NextResponse.json({ ok: false, error: "lead_id required" }, { status: 400 });

    // Ensure profile exists
    const profileId = upsertProfile(lead_id, { enrichment_status: "pending" });
    logAuditEvent(lead_id, "enrich_triggered", "system", { action });

    if (action === "rescore") {
      // Just recompute score from existing sources
      const result = scoreAndSave(profileId, lead_id);
      return NextResponse.json({ ok: true, action: "rescored", score: result.score, band: result.band });
    }

    // For "enrich" — run all providers and score
    const enrichResult = await enrichLead(lead_id);

    // If orchestrator returned an error (e.g. lead not found), surface it
    if (enrichResult.error && !enrichResult.profileId) {
      return NextResponse.json({ ok: false, error: enrichResult.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      action: "enriched",
      profile_id: enrichResult.profileId,
      lead_id,
      score: enrichResult.score.score,
      band: enrichResult.score.band,
      identity_score: enrichResult.score.identity_score,
      capital_score: enrichResult.score.capital_score,
      risk_score: enrichResult.score.risk_score,
      digital_score: enrichResult.score.digital_score,
      engagement_score: enrichResult.score.engagement_score,
      flags: enrichResult.score.flags,
      providers: enrichResult.providers,
      duration_ms: enrichResult.duration_ms,
      error: enrichResult.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : "";
    console.error("[Intel] Profile create error:", msg, stack);
    return NextResponse.json({ ok: false, error: msg, detail: stack }, { status: 500 });
  }
}
