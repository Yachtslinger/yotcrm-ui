/**
 * GET /api/comms/review-summary
 * Unified counts for the "needs review" badge + Comms page stats.
 * Authed (CRM-internal) route — not on the public ingest allowlist.
 */
import { NextResponse } from "next/server";
import { getReviewSummary } from "@/lib/comms/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = getReviewSummary();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
