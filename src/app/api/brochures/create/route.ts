// src/app/api/brochures/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { saveBrochure } from "@/lib/brochure-storage";
import { syncPocketListingFromBrochure } from "@/lib/pocket-brochure-sync";
import type { VesselData, BrokerInfo } from "@/lib/brochure-storage";

export const runtime = "nodejs";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://yotcrm-production.up.railway.app";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { vessel, brokers, isPocket } = body as {
    vessel?: VesselData; brokers?: BrokerInfo[]; isPocket?: boolean;
  };

  if (!vessel || !vessel.name) {
    return NextResponse.json({ error: "vessel data is required" }, { status: 400 });
  }

  try {
    const { id, slug } = saveBrochure(vessel, brokers, isPocket === true);

    // If marked as pocket listing, upsert a pocket_listings row
    if (isPocket) {
      const brochureUrl = `${BASE}/brochures/${slug}`;
      const pdfUrl      = `${BASE}/api/brochures/pdf?slug=${slug}`;
      syncPocketListingFromBrochure({ vessel, slug, brochureUrl, pdfUrl });
    }

    return NextResponse.json({ id, slug, vesselName: vessel.name }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    console.error("[brochures/create]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
