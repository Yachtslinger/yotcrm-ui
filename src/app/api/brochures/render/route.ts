// POST /api/brochures/render
// Takes vessel data + returns full brochure HTML — used for live preview.
import { NextRequest, NextResponse } from "next/server";
import { generateBrochureHTML } from "@/lib/brochure-template";
import { getBrochure } from "@/lib/brochure-storage";
import type { VesselData, BrokerInfo } from "@/lib/brochure-storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vessel = body.vessel as VesselData;
    const brokers = body.brokers as BrokerInfo[] | undefined;
    if (!vessel) return NextResponse.json({ error: "vessel required" }, { status: 400 });
    const html = generateBrochureHTML(vessel, brokers || []);
    return NextResponse.json({ ok: true, html });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/brochures/render?id=N — fetch existing brochure vessel data for editing
export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    // Try slug-based lookup first (getBrochure takes slug, so list and find by id)
    const { listBrochures } = await import("@/lib/brochure-storage");
    const rows = listBrochures();
    const row = rows.find(r => r.id === id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = getBrochure(row.slug);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, vessel: data.vessel, brokers: data.brokers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
