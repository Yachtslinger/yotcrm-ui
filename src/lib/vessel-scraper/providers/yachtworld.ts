/**
 * YachtWorld scraper — v2
 * Strategy (in order):
 *   1. Plain fetch with realistic headers (fast, works if YW serves SSR)
 *   2. Stealthy Puppeteer fetch (slower, bypasses Cloudflare JS challenges)
 *   3. URL-slug fallback — always populates name/year/builder from the URL
 *
 * Image upscaling: boatsgroup CDN thumbnails arrive at ?w=200 — we replace to ?w=1200.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";
import { stealthFetch } from "../../campaign/providers/stealthFetch";

// ── URL slug parser ───────────────────────────────────────────────────────────
// URL format: /yacht/YYYY-make-words-model-words-LISTINGID/
// e.g. /yacht/2017-northern-marine-expedition-9034848/
function parseSlug(url: string): Partial<VesselData> {
  const slug = url.split("/").filter(Boolean).pop() || "";
  const result: Partial<VesselData> = {};

  // Extract listing ID (trailing 7-digit number)
  const idMatch = slug.match(/[- ](\d{6,8})$/);
  const listingId = idMatch ? idMatch[1] : null;

  // Extract year (4-digit at start)
  const yearMatch = slug.match(/^(\d{4})-/);
  if (yearMatch) result.year = parseInt(yearMatch[1]);

  // Extract make + model from middle portion
  if (yearMatch && listingId) {
    const middle = slug
      .replace(/^\d{4}-/, "")         // remove year
      .replace(/-?\d{6,8}$/, "")      // remove listing ID
      .trim();

    // Title-case and space-join
    const words = middle.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1));
    // First word is typically the builder — rest is model
    if (words.length >= 2) {
      result.builder = words[0];
      result.name = words.join(" ");   // e.g. "Northern Marine Expedition"
    } else if (words.length === 1) {
      result.name = words[0];
    }
  }

  // Full display name with year
  if (result.year && result.name) {
    result.name = `${result.year} ${result.name}`;
  }

  return result;
}

// ── Image URL upscaler ────────────────────────────────────────────────────────
// boatsgroup CDN: replace small w= param with 1200px for full-res
function upscaleBoatsgroup(src: string): string {
  if (!src.includes("boatsgroup.com") && !src.includes("images.boatsgroup")) return src;
  // Remove all resize/quality params and request full width
  return src
    .replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/, "")
    .replace(/[?&]exact/, "")
    .replace(/[?&]ratio=[^&]+/, "")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/, "");
}

// ── Boatsgroup image fetcher ──────────────────────────────────────────────────
// When Cloudflare blocks the page, we can still fetch the image manifest
// from the boatsgroup search API which doesn't require browser rendering.
async function fetchBoatsgroupImages(listingId: string): Promise<{ src: string; alt: string }[]> {
  try {
    // Boatsgroup serves a plain JSON search result for listing IDs
    const res = await fetch(
      `https://www.yachtworld.com/api/search-bff/v2/listings/${listingId}?locale=en-US&currency=USD`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
          "Referer": "https://www.yachtworld.com/",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    const media = (data.media || data.images || []) as { url?: string; caption?: string }[];
    return media
      .filter(m => m.url && /^https?:\/\//i.test(m.url))
      .map(m => ({ src: upscaleBoatsgroup(m.url!), alt: m.caption || "" }));
  } catch { return []; }
}

// ── Markdown page parser — extracts data from plain-text page fetch ───────────
// YachtWorld's page renders price/location in markdown even when JS is blocked
function parseFromMarkdown(text: string): Partial<VesselData> {
  const result: Partial<VesselData> = { images: [] };

  // Price: "US$3,750,000" or "$3,750,000"
  const priceMatch = text.match(/\b(US\$[\d,]+(?:\.\d+)?|\$[\d,]+(?:\.\d+)?|€[\d,]+(?:\.\d+)?)\b/);
  if (priceMatch) result.price = priceMatch[1];

  // Location: city + state pattern after price
  const locMatch = text.match(/\n([A-Z][a-zA-Z\s]+,\s+[A-Z][a-zA-Z\s]+)\n/);
  if (locMatch) result.location = locMatch[1].trim();

  // Images: extract boatsgroup thumbnail URLs and upscale
  const imgRegex = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s")]+\.(?:jpg|jpeg|png|webp)[^\s")"]*/gi;
  const imgs = text.match(imgRegex) || [];
  const seen = new Set<string>();
  for (const src of imgs) {
    const clean = src.replace(/[?&]format=webp/, "").replace(/[?&]exact/, "").replace(/&&+/g, "&");
    const upscaled = upscaleBoatsgroup(clean);
    if (!seen.has(upscaled) && !isJunk(upscaled)) {
      seen.add(upscaled);
      (result.images as { src: string; alt: string }[]).push({ src: upscaled, alt: "" });
    }
  }

  return result;
}
async function plainFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function scrapeYachtWorld(url: string): Promise<VesselData> {
  // 1. Always seed with slug data
  const slugData = parseSlug(url);
  const listingId = url.match(/[-/](\d{6,8})[/?]?$/)?.[1] || null;

  let html = "";
  let markdownText = "";

  // 2. Try plain fetch — even if Cloudflare blocks JS rendering,
  //    the plain HTML often has price/location/images in it
  try {
    const rawHtml = await plainFetch(url);
    if (rawHtml.length > 5000 && !/checking your browser|just a moment/i.test(rawHtml)) {
      html = rawHtml;
    }
    // Always try markdown-style extraction on raw text too
    markdownText = rawHtml;
  } catch { /* fall through */ }

  // 3. Puppeteer stealth fallback
  if (!html) {
    try {
      html = await stealthFetch(url);
      markdownText = html;
    } catch { /* fall through */ }
  }

  // 4. Parse HTML if available
  const vessel = html ? parseYachtWorld(url, html) : emptyVessel(url);

  // 5. Back-fill from markdown text extraction (price/location/images)
  if (markdownText) {
    const mdData = parseFromMarkdown(markdownText);
    if (!vessel.price    && mdData.price)    vessel.price    = mdData.price;
    if (!vessel.location && mdData.location) vessel.location = mdData.location;
    if (vessel.images.length === 0 && mdData.images?.length) {
      vessel.images = mdData.images as { src: string; alt: string }[];
    }
  }

  // 6. Back-fill from slug
  if (!vessel.name    && slugData.name)    vessel.name    = slugData.name;
  if (!vessel.year    && slugData.year)    vessel.year    = slugData.year;
  if (!vessel.builder && slugData.builder) vessel.builder = slugData.builder;

  // 7. If still no images, try boatsgroup API directly
  if (vessel.images.length === 0 && listingId) {
    vessel.images = await fetchBoatsgroupImages(listingId);
  }

  // 8. Upscale any remaining thumbnail images
  vessel.images = vessel.images.map(img => ({
    ...img,
    src: upscaleBoatsgroup(img.src),
  }));

  return vessel;
}

// ── HTML parser (shared between plain-fetch and Puppeteer paths) ──────────────
function parseYachtWorld(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // JSON-LD — YachtWorld has very good structured data when rendered
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes: Record<string, unknown>[] = Array.isArray(json)
        ? json : json["@graph"] ? json["@graph"] : [json];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();
        if (!/product|boat|vehicle/i.test(type) && !node.offers) continue;

        if (node.name && !vessel.name) {
          const brand = (node.brand as Record<string,string>)?.name || "";
          const raw = String(node.name).trim();
          vessel.name = cleanHeadline(brand && !raw.toLowerCase().includes(brand.toLowerCase())
            ? `${brand} ${raw}` : raw);
        }
        if (node.description && !vessel.description)
          vessel.description = clean(String(node.description));

        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string,string>)?.url || "";
            if (src && /^https?:\/\//i.test(src)) vessel.images.push({ src, alt: "" });
          }
        }

        const offers = (node.offers as Record<string,unknown>) || {};
        if (offers.price && !vessel.price) {
          const p = offers.price;
          const c = String(offers.priceCurrency || "USD");
          vessel.price = typeof p === "number"
            ? `${c === "EUR" ? "€" : "$"}${(p as number).toLocaleString("en-US")}`
            : String(p);
        }

        const avail = (offers.availableAtOrFrom as Record<string,unknown>) || {};
        const addr  = (avail.address as Record<string,string>) || {};
        if (!vessel.location)
          vessel.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter(Boolean).join(", ");

        const brand = (node.brand as Record<string,string>) || (node.manufacturer as Record<string,string>);
        if (brand?.name && !vessel.builder) vessel.builder = clean(brand.name);

        if (!vessel.year) {
          const yr = String(node.productionDate || node.vehicleModelDate || "");
          const y = parseInt(yr);
          if (y > 1900) vessel.year = y;
        }

        const props = Array.isArray(node.additionalProperty)
          ? (node.additionalProperty as { name?: string; value?: string }[]) : [];
        for (const prop of props) {
          if (prop.name && prop.value) assignSpec(vessel, prop.name, String(prop.value));
        }
      }
    } catch { /* skip */ }
  });

  // OG meta fallbacks
  if (!vessel.name)  vessel.name  = cleanHeadline($('meta[property="og:title"]').attr("content")) || "";
  if (!vessel.description) vessel.description = clean($('meta[property="og:description"]').attr("content"));
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg) vessel.images.push({ src: ogImg, alt: vessel.name });

  // H1 fallback
  if (!vessel.name) vessel.name = cleanHeadline($("h1").first().text()) || "";

  // Price from URL metadata
  if (!vessel.price) {
    const priceEl = $('[class*="price" i]').first().text();
    if (priceEl) vessel.price = clean(priceEl);
  }

  // Location
  if (!vessel.location) vessel.location = clean($('[class*="location" i]').first().text());

  // DOM spec tables
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });
  $("[data-testid]").each((_, el) => {
    const testId = $(el).attr("data-testid") || "";
    if (/spec|detail/i.test(testId)) {
      const label = clean($(el).find("[class*='label' i], [class*='name' i]").first().text());
      const value = clean($(el).find("[class*='value' i], [class*='data' i]").last().text());
      if (label && value) assignSpec(vessel, label, value);
    }
  });

  // Images — boatsgroup CDN thumbnails (upscale later in main export)
  $("img").each((_, img) => {
    const src =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      bestFromSrcset($(img).attr("srcset") || "") ||
      $(img).attr("src") || "";
    if (src && /boatsgroup\.com/i.test(src) && !isJunk(src))
      vessel.images.push({ src, alt: clean($(img).attr("alt")) });
  });

  // Also grab any non-boatsgroup gallery images
  $(".swiper-slide img, [class*='gallery'] img, figure img").each((_, img) => {
    const src = $(img).attr("data-src") || $(img).attr("src") || "";
    if (src && /\.(jpe?g|png|webp)/i.test(src) && !isJunk(src))
      vessel.images.push({ src, alt: clean($(img).attr("alt")) });
  });

  vessel.images = dedupeImages(vessel.images);
  return vessel;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function bestFromSrcset(srcset: string): string {
  const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
  let best = ""; let bestW = 0;
  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/);
    const w = descriptor ? parseFloat(descriptor) : 1;
    if (w > bestW && url) { best = url; bestW = w; }
  }
  return best;
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder/i.test(src);
}
