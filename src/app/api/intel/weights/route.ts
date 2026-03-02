import { NextResponse } from "next/server";
import { getWeights, updateWeight } from "@/lib/intel/storage";

export const runtime = "nodejs";

/**
 * GET /api/intel/weights
 * Returns all scoring weights (for admin panel).
 */
export async function GET() {
  try {
    const weights = getWeights();
    return NextResponse.json({ ok: true, weights });
  } catch (err) {
    console.error("[Intel] Weights fetch error:", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}

/**
 * PUT /api/intel/weights
 * Body: { id: number, points?: number, active?: number, label?: string }
 * Update a single weight factor.
 */
export async function PUT(req: Request) {
  try {
    const { id, points, active, label } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const ok = updateWeight(id, { points, active, label });
    return NextResponse.json({ ok, message: ok ? "Weight updated" : "Weight not found" });
  } catch (err) {
    console.error("[Intel] Weight update error:", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
