import { NextResponse } from "next/server";
import { listProfiles, scoreBandLabel } from "@/lib/intel/storage";

export const runtime = "nodejs";

/**
 * GET /api/intel/profiles?band=high_confidence&min_score=60
 * List enrichment profiles with optional filters.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const band = url.searchParams.get("band") || undefined;
    const minScore = url.searchParams.get("min_score") ? Number(url.searchParams.get("min_score")) : undefined;

    const profiles = listProfiles({ band, minScore });
    return NextResponse.json({
      ok: true,
      profiles: profiles.map(p => ({
        ...p,
        band_label: scoreBandLabel(p.score_band),
        score_breakdown: JSON.parse(p.score_breakdown || "[]"),
      })),
    });
  } catch (err) {
    console.error("[Intel] List profiles error:", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
