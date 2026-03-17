// src/app/api/scrape/route.ts
// Unified scrape endpoint used by both campaign builder and brochure generator.
// Returns VesselData plus a CampaignDraft-compatible shape so the campaign
// builder gets richer data without any changes to its existing handler.
import { NextResponse } from "next/server";
import { scrapeVessel, vesselToCampaignDraft } from "@/lib/vessel-scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  const target = new URL(req.url).searchParams.get("url");
  return handleScrape(target);
}

export async function POST(req: Request): Promise<NextResponse> {
  let target = new URL(req.url).searchParams.get("url");
  if (!target) {
    try {
      const body = (await req.json()) as { url?: string };
      target = body?.url || null;
    } catch { target = null; }
  }
  return handleScrape(target);
}

async function handleScrape(target: string | null): Promise<NextResponse> {
  if (!target) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }
  try {
    const vessel = await scrapeVessel(target.trim());
    // vesselToCampaignDraft gives campaigns backwards-compatible shape
    // plus extra fields (maxSpeed, cruiseSpeed, range, guests, etc.)
    const data = vesselToCampaignDraft(vessel);
    return NextResponse.json({ ok: true, data, vessel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to scrape";
    const status = /unsupported domain|invalid url/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
