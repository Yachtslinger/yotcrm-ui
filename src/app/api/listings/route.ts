import { NextRequest, NextResponse } from "next/server";
import {
  readListings, createListing, updateListing, deleteListing,
} from "@/lib/listings/storage";
import { resolveScrapeProvider } from "@/lib/campaign/providers";

/**
 * Auto-scrape: if listing has URLs but no hero image, scrape the first
 * URL and backfill hero_image + any missing specs.
 */
async function autoScrape(data: Record<string, any>): Promise<Record<string, any>> {
  const urls: { label: string; url: string }[] = data.listing_urls || [];
  if (data.hero_image || urls.length === 0) return data;

  // Find first scrapeable URL
  const target = urls.find(u => u.url?.startsWith("http"))?.url;
  if (!target) return data;

  try {
    const hostname = new URL(target).hostname.toLowerCase();
    const provider = resolveScrapeProvider(hostname);
    if (!provider) return data;

    const scraped = await provider(target);
    const patched = { ...data };

    if (scraped.heroUrl) patched.hero_image = scraped.heroUrl;
    if (scraped.price && !data.price) patched.price = scraped.price;
    if (scraped.location && !data.location) patched.location = scraped.location;
    if (scraped.description && !data.description) patched.description = scraped.description;
    if (scraped.specs?.loa && !data.length) patched.length = scraped.specs.loa;
    if (scraped.specs?.year && !data.year) patched.year = scraped.specs.year;
    if (scraped.specs?.builder && !data.make) patched.make = scraped.specs.builder;
    if (scraped.specs?.model && !data.model) patched.model = scraped.specs.model;
    if (scraped.headline && !data.name) patched.name = scraped.headline;

    console.log(`[listings] Auto-scraped ${target} → hero: ${!!scraped.heroUrl}`);
    return patched;
  } catch (err) {
    console.error(`[listings] Auto-scrape failed for ${target}:`, err);
    return data;
  }
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const listings = readListings(status);
  return NextResponse.json({ ok: true, listings });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, id, ...data } = body;

  if (action === "delete" && id) {
    deleteListing(id);
    return NextResponse.json({ ok: true });
  }
  if (action === "update" && id) {
    const patched = await autoScrape(data);
    const updated = updateListing(id, patched);
    return NextResponse.json({ ok: true, listing: updated });
  }
  // Default: create
  const patched = await autoScrape(data);
  const listing = createListing(patched);
  return NextResponse.json({ ok: true, listing });
}
