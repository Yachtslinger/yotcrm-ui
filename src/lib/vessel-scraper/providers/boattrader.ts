/**
 * BoatTrader.com vessel scraper
 * Sites: boattrader.com/boat/[slug]
 *
 * Architecture: Next.js app — listing data lives in <script id="__NEXT_DATA__">
 * as props.pageProps.listing  (rich JSON with specs, images, price, description).
 * Falls back to DOM + JSON-LD if that key is absent.
 *
 * Image notes:
 *  - BoatTrader CDN images come from cdn.boattrader.com or boattrader.com/resize/
 *  - Watermarked variants usually contain "/watermark/" or "wm=" in the URL → filtered
 *  - We prefer the full-resolution version (no size parameter or largest param)
 */

import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

export async function scrapeBoatTrader(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  // 403/429 = blocked by Cloudflare — return slug-derived stub rather than crashing
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    const vessel = emptyVessel(url);
    vessel.name = slugToName(url);
    const ym = url.match(/\/(\d{4})-/);
    if (ym) vessel.year = parseInt(ym[1]);
    const makeM = url.match(/\/\d{4}-([a-z]+(?:-[a-z]+)?)-/i);
    if (makeM) vessel.builder = makeM[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return vessel;
  }
  if (!res.ok) throw new Error(`BoatTrader fetch failed: ${res.status}`);
  const html = await res.text();
  return parseBoatTrader(url, html);
}

function slugToName(url: string): string {
  const slug = url.split("/").filter(Boolean).pop() || "";
  const withoutId = slug.replace(/-\d{6,8}$/, "");
  return withoutId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function parseBoatTrader(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Next.js hydration data (richest source) ───────────────────────────
  const nextDataEl = $("#__NEXT_DATA__").text();
  if (nextDataEl) {
    try {
      const nd = JSON.parse(nextDataEl);
      const listing =
        nd?.props?.pageProps?.listing ||
        nd?.props?.pageProps?.boatDetails ||
        nd?.props?.pageProps?.data?.listing;

      if (listing) {
        extractFromNextData(vessel, listing);
        // If we got images and a name from Next.js data we're done
        if (vessel.name && vessel.images.length > 0) return vessel;
      }
    } catch { /* fall through to DOM */ }
  }

  // ── 2. JSON-LD fallback ──────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        if (!node) continue;
        if (node.name && !vessel.name)
          vessel.name = cleanHeadline(String(node.name));
        if (node.description && !vessel.description)
          vessel.description = clean(String(node.description));
        const offers = node.offers as Record<string, unknown> | undefined;
        if (offers?.price && !vessel.price)
          vessel.price = `$${String(offers.price)}`;
        const imgs = Array.isArray(node.image) ? node.image : (node.image ? [node.image] : []);
        for (const img of imgs) {
          const src = typeof img === "string" ? img : (img as Record<string,string>)?.url || "";
          if (src && !isWatermarked(src)) vessel.images.push({ src, alt: vessel.name });
        }
      }
    } catch { /* skip */ }
  });

  // ── 3. DOM fallback ──────────────────────────────────────────────────────
  if (!vessel.name) {
    vessel.name =
      cleanHeadline($("h1.listing-title, h1.boat-title, h1[data-testid='listing-title']").first().text()) ||
      cleanHeadline($("h1").first().text()) || "";
  }

  // Price
  if (!vessel.price) {
    const priceText = clean(
      $("[data-testid='listing-price'], .listing-price, .price-display").first().text()
    );
    if (priceText) vessel.price = priceText;
  }

  // Description
  if (!vessel.description) {
    const descParts: string[] = [];
    $(".listing-description p, .boat-description p, [data-testid='description'] p").each((_, p) => {
      const t = clean($(p).text());
      if (t.length > 40) descParts.push(t);
    });
    if (descParts.length) vessel.description = descParts.join("\n\n");
  }

  // Specs from table/dl patterns
  $("tr, dl dt").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === "tr") {
      const cells = $(el).find("th, td");
      if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
    } else {
      assignSpec(vessel, $(el).text(), $(el).next("dd").text());
    }
  });
  // key-value pair divs
  $(".spec-item, .spec-detail, [data-testid='spec-item']").each((_, el) => {
    const label = clean($(el).find(".spec-label, .key, strong, dt").first().text());
    const value = clean($(el).find(".spec-value, .value, span, dd").last().text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Location
  if (!vessel.location) {
    const loc = clean($(".listing-location, [data-testid='location']").first().text());
    if (loc) vessel.location = loc;
  }

  // DOM images
  if (vessel.images.length === 0) {
    $("img[src], img[data-src], img[data-lazy]").each((_, img) => {
      const src =
        $(img).attr("data-src") ||
        $(img).attr("data-lazy") ||
        $(img).attr("src") || "";
      if (/\.(jpe?g|png|webp)/i.test(src) && /^https?:\/\//i.test(src) && !isWatermarked(src)) {
        vessel.images.push({ src, alt: clean($(img).attr("alt")) });
      }
    });
  }

  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|sprite|favicon|avatar|dealer|broker|agent/i.test(i.src)
  );

  return vessel;
}

// ── Extract from Next.js __NEXT_DATA__ listing object ────────────────────────

function extractFromNextData(vessel: VesselData, listing: Record<string, unknown>): void {
  // Name — BoatTrader format: "{year} {make} {model}" or headline field
  if (!vessel.name) {
    vessel.name =
      cleanHeadline(listing.headline as string) ||
      cleanHeadline(
        [listing.year, listing.make, listing.model]
          .filter(Boolean)
          .join(" ")
      ) || "";
  }

  // Year
  if (!vessel.year && listing.year) vessel.year = Number(listing.year);

  // Builder/make
  if (!vessel.builder && listing.make) vessel.builder = clean(String(listing.make));

  // Price
  if (!vessel.price) {
    const priceObj = listing.price as Record<string, unknown> | null;
    if (priceObj?.asking) {
      const amount = String(priceObj.asking);
      const currency = String(priceObj.currency || "USD");
      vessel.price = currency === "USD" ? `$${Number(amount).toLocaleString("en-US")}` : `${currency} ${amount}`;
    } else if (typeof listing.price === "string" || typeof listing.price === "number") {
      vessel.price = `$${Number(listing.price).toLocaleString("en-US")}`;
    }
  }

  // Description
  if (!vessel.description && listing.description) {
    vessel.description = clean(String(listing.description));
  }

  // Location
  if (!vessel.location) {
    const loc = listing.location as Record<string, unknown> | null;
    if (loc) {
      vessel.location = clean(
        [loc.city, loc.stateCode || loc.state, loc.country]
          .filter(Boolean)
          .join(", ")
      );
    }
  }

  // Specs object
  const specs = listing.specs as Record<string, unknown> | null;
  if (specs) {
    const s = (k: string) => specs[k] ? clean(String(specs[k])) : null;
    if (s("length"))       assignSpec(vessel, "loa",              s("length")!);
    if (s("beam"))         assignSpec(vessel, "beam",             s("beam")!);
    if (s("draft"))        assignSpec(vessel, "draft",            s("draft")!);
    if (s("fuelCapacity")) assignSpec(vessel, "fuel capacity",    s("fuelCapacity")!);
    if (s("waterCapacity")) assignSpec(vessel, "fresh water",     s("waterCapacity")!);
    if (s("engines"))      assignSpec(vessel, "engines",          s("engines")!);
    if (s("engineCount"))  assignSpec(vessel, "engine count",     s("engineCount")!);
    if (s("speed"))        assignSpec(vessel, "max speed",        s("speed")!);
    if (s("hullMaterial")) assignSpec(vessel, "hull material",    s("hullMaterial")!);
    if (s("hullColor"))    assignSpec(vessel, "hull",             s("hullColor")!);
    if (s("cabins"))       assignSpec(vessel, "cabins",           s("cabins")!);
    if (s("berths"))       assignSpec(vessel, "berths",           s("berths")!);
  }

  // Additional details array (BoatTrader v2 API format)
  const details = listing.details as Record<string, string>[] | null;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d.label && d.value) assignSpec(vessel, d.label, d.value);
    }
  }

  // Images
  const imgs = listing.images as Record<string, unknown>[] | string[] | null;
  if (Array.isArray(imgs)) {
    for (const img of imgs) {
      let src = "";
      if (typeof img === "string") {
        src = img;
      } else if (img && typeof img === "object") {
        // BoatTrader image object: { url, full, original, thumbnail, sizes: {...} }
        const o = img as Record<string, unknown>;
        src =
          (typeof o.original === "string" && o.original) ||
          (typeof o.full === "string" && o.full) ||
          (typeof o.url === "string" && o.url) ||
          (typeof o.large === "string" && o.large) || "";
        // Prefer the largest size from the sizes object
        const sizes = o.sizes as Record<string, { url?: string }> | undefined;
        if (sizes) {
          src = sizes.large?.url || sizes.medium?.url || sizes.small?.url || src;
        }
      }
      if (src && /^https?:\/\//i.test(src) && !isWatermarked(src)) {
        vessel.images.push({ src, alt: vessel.name });
      }
    }
  }

  // Hero image fallback
  if (vessel.images.length === 0) {
    const hero = listing.heroImage || listing.primaryImage || listing.thumbnail;
    if (typeof hero === "string" && hero && !isWatermarked(hero)) {
      vessel.images.push({ src: hero, alt: vessel.name });
    }
  }
}

/** Filter out known watermarked URL patterns */
function isWatermarked(src: string): boolean {
  return /\/watermark\/|[?&]wm=|\/wm\//i.test(src);
}
