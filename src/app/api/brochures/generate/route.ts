// src/app/api/brochures/generate/route.ts
// One-shot: scrape a vessel URL → save to DB → return the brochure slug.
// No edit form required. POST { url, brokers? }
// The brochure itself renders on-demand from the stored vessel_data.

import { NextRequest, NextResponse } from "next/server";
import { scrapeVessel } from "@/lib/vessel-scraper";
import { saveBrochure } from "@/lib/brochure-storage";
import type { BrokerInfo } from "@/lib/brochure-storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_BROKERS: BrokerInfo[] = [
  {
    name: "Will Noftsinger",
    title: "Build Consultant — The Americas",
    email: "wn@yachtslinger.yachts",
    mobile: "+1 (786) 505-1515",
    office: "Denison Yachting · Miami, FL",
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, brokers } = body as { url?: string; brokers?: BrokerInfo[] };

    if (!url?.trim()) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }

    // 1. Scrape the vessel page
    const vessel = await scrapeVessel(url.trim());

    if (!vessel.name && !vessel.loa) {
      return NextResponse.json(
        { ok: false, error: "Scrape returned no usable data. Check the URL and try again." },
        { status: 422 }
      );
    }

    // 2. Save to SQLite — brochures render on-demand from vessel_data,
    //    so no pre-generated HTML is stored.
    const useBrokers: BrokerInfo[] = brokers?.length ? brokers : DEFAULT_BROKERS;
    const saved = saveBrochure(vessel, useBrokers);

    return NextResponse.json({
      ok: true,
      slug: saved.slug,
      vessel: {
        name: vessel.name,
        builder: vessel.builder,
        loa: vessel.loa,
        beam: vessel.beam,
        draft: vessel.draft,
        engines: vessel.engines,
        maxSpeed: vessel.maxSpeed,
        range: vessel.range,
        guests: vessel.guests,
        crew: vessel.crew,
        imageCount: vessel.images.length,
      },
      brochureUrl: `/brochures/${saved.slug}`,
    });
  } catch (err) {
    console.error("[brochures/generate]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
