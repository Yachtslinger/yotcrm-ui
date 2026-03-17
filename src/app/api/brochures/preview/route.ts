// src/app/api/brochures/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { scrapeVessel } from "@/lib/vessel-scraper";
import type { VesselData } from "@/lib/brochure-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, url2 } = body as { url?: string; url2?: string };

  if (!url?.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    // Scrape primary URL always
    const vessel1 = await scrapeVessel(url.trim()) as VesselData;

    // Scrape second URL if provided, then merge
    if (url2?.trim()) {
      try {
        const vessel2 = await scrapeVessel(url2.trim()) as VesselData;

        // Merge: primary wins for all text fields, but backfill empties from url2
        const merged = { ...vessel1 };
        const textFields = ["builder","location","classification","grossTonnage","loa","lwl",
          "beam","draft","displacement","hullForm","hullMaterial","superstructure","exteriorDesign",
          "interiorDesign","navalArchitect","engines","power","gearbox","propulsion","propellers",
          "gensets","airCon","maxSpeed","cruiseSpeed","range","fuelTank","freshWater","holdingTank",
          "guests","staterooms","crew","crewCabins","tender","livingSpace","navigation","description",
          "bowThruster","sternThruster","stabilisers","waterMaker","lubeOil","flagState"] as const;

        for (const k of textFields) {
          if (!merged[k] && vessel2[k]) {
            (merged as Record<string,unknown>)[k] = vessel2[k];
          }
        }

        // Append unique images from url2 (dedupe by src)
        const existingSrcs = new Set(merged.images.map((i: {src:string}) => i.src));
        const extraImgs = (vessel2.images || []).filter((i: {src:string}) => !existingSrcs.has(i.src));
        merged.images = [...merged.images, ...extraImgs];

      } catch (e) {
        // Second URL failed — return primary only, with a warning
        console.warn("[brochures/preview] url2 scrape failed:", e instanceof Error ? e.message : e);
        return NextResponse.json({ ok: true, vessel: vessel1, url2Warning: "Second URL scrape failed — using primary only" });
      }

      const vessel1merged = { ...vessel1 } as VesselData;
      // re-fetch merged after block above (need to restructure)
      return NextResponse.json({ ok: true, vessel: await mergeVessels(url.trim(), url2.trim()) });
    }

    return NextResponse.json({ ok: true, vessel: vessel1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scrape failed";
    console.error("[brochures/preview]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function mergeVessels(url: string, url2: string): Promise<VesselData> {
  const [v1, v2] = await Promise.all([
    scrapeVessel(url) as Promise<VesselData>,
    scrapeVessel(url2).catch(() => null) as Promise<VesselData | null>,
  ]);

  if (!v2) return v1;

  const merged = { ...v1 };
  const textFields = ["builder","location","classification","grossTonnage","loa","lwl",
    "beam","draft","displacement","hullForm","hullMaterial","superstructure","exteriorDesign",
    "interiorDesign","navalArchitect","engines","power","gearbox","propulsion","propellers",
    "gensets","airCon","maxSpeed","cruiseSpeed","range","fuelTank","freshWater","holdingTank",
    "guests","staterooms","crew","crewCabins","tender","livingSpace","navigation","description",
    "bowThruster","sternThruster","stabilisers","waterMaker","lubeOil","flagState"];

  for (const k of textFields) {
    const mk = k as keyof VesselData;
    if (!merged[mk] && v2[mk]) {
      (merged as Record<string,unknown>)[k] = v2[mk];
    }
  }

  // Append unique images from v2
  const existingSrcs = new Set(merged.images.map(i => i.src));
  const extraImgs = (v2.images || []).filter(i => !existingSrcs.has(i.src));
  merged.images = [...merged.images, ...extraImgs];

  return merged;
}
