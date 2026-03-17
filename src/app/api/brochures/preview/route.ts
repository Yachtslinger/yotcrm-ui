// src/app/api/brochures/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { scrapeVessel } from "@/lib/vessel-scraper";
import type { VesselData } from "@/lib/brochure-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url?.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const vessel = await scrapeVessel(url.trim()) as VesselData;
    return NextResponse.json({ ok: true, vessel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scrape failed";
    console.error("[brochures/preview]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
