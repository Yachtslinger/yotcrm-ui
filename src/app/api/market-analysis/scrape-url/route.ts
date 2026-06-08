/**
 * POST /api/market-analysis/scrape-url
 * Accepts a listing URL + source label.
 * Scrapes it using the existing vessel scraper and returns a CompRecord.
 */
import { NextRequest, NextResponse } from "next/server";
import { scrapeVessel } from "@/lib/vessel-scraper/index";
import type { CompRecord } from "@/lib/market-analysis/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

function parsePrice(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[€£A-Z\s]/gi, "").replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 10000 ? null : Math.round(n);
}

export async function POST(req: NextRequest) {
  try {
    const { url, source, listingType, soldPrice, daysOnMarket, listedDate, soldDate } = await req.json() as {
      url: string;
      source: string;
      listingType: "sold" | "active";
      soldPrice?: number | null;
      daysOnMarket?: number | null;
      listedDate?: string;
      soldDate?: string;
    };

    if (!url?.trim()) {
      return NextResponse.json({ ok: false, error: "No URL provided" }, { status: 400 });
    }

    const vessel = await scrapeVessel(url.trim());
    const listedPrice = parsePrice(vessel.price);

    const comp: CompRecord = {
      name: vessel.name || "",
      make: vessel.builder || "",
      model: vessel.name || "",
      year: vessel.year ? String(vessel.year) : "",
      length: vessel.loa || "",
      listedPrice,
      soldPrice: soldPrice ?? null,
      askPrice: listingType === "active" ? listedPrice : null,
      listedDate: listedDate || "",
      soldDate: soldDate || "",
      daysOnMarket: daysOnMarket ?? null,
      location: vessel.location || "",
      source,
    };

    return NextResponse.json({
      ok: true,
      comp,
      preview: {
        name: vessel.name,
        builder: vessel.builder,
        year: vessel.year,
        loa: vessel.loa,
        price: vessel.price,
        location: vessel.location,
        image: vessel.images?.[0]?.src || "",
        model: vessel.model || "",
        engineBrand: vessel.engineMake || "",
        engineCount: vessel.engineCount || "",
        refitYear: vessel.refitYear || "",
        refitScope: vessel.refitScope || "",
      }
    });
  } catch (err) {
    console.error("market-analysis/scrape-url error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
