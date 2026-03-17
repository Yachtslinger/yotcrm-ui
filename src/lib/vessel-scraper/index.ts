/**
 * Unified vessel scraper
 * --
 * Both the brochure generator and campaign importer call scrapeVessel().
 * Returns a full VesselData object; callers convert to whatever shape they need.
 */
import type { VesselData } from "./types";
import { emptyVessel } from "./types";
import { scrapeOceanKing }   from "./providers/oceanking";
import { scrapeVanDerValk }  from "./providers/vandervalk";
import { scrapeDenison }     from "./providers/denison";
import { scrapeYachtWorld }  from "./providers/yachtworld";
import { scrapeYachtSlinger } from "./providers/yachtslinger";
import { scrapeYachtBuyer }  from "./providers/yachtbuyer";

// Provider registry — maps hostname patterns to scraper functions
type Provider = (url: string) => Promise<VesselData>;

const PROVIDERS: { pattern: RegExp; fn: Provider }[] = [
  { pattern: /oceanking\.it/i,           fn: scrapeOceanKing },
  { pattern: /vandervalkshipyard\.com/i, fn: scrapeVanDerValk },
  { pattern: /denisonyachtsales\.com/i,  fn: scrapeDenison },
  { pattern: /denisonyachting\.com/i,    fn: scrapeDenison },
  { pattern: /yachtworld\.com/i,         fn: scrapeYachtWorld },
  { pattern: /yachtslinger\.com/i,       fn: scrapeYachtSlinger },
  { pattern: /yachtbuyer\.com/i,         fn: scrapeYachtBuyer },
];

/** Scrape a vessel listing URL and return a full VesselData object */
export async function scrapeVessel(url: string): Promise<VesselData> {
  const normalised = normaliseUrl(url);
  const { hostname } = new URL(normalised);
  const provider = PROVIDERS.find(p => p.pattern.test(hostname));
  if (provider) {
    return provider.fn(normalised);
  }
  // Generic fallback — attempts cheerio + JSON-LD extraction
  return genericScrape(normalised);
}

/** Convert VesselData to the CampaignDraft shape used by the campaign builder */
export function vesselToCampaignDraft(v: VesselData) {
  return {
    subject:     v.name,
    headline:    v.name,
    preheader:   v.description ? v.description.slice(0, 100) : "",
    description: v.description,
    location:    v.location,
    price:       v.price,
    heroUrl:     v.images[0]?.src || "",
    gallery:     v.images.map(i => i.src),
    listingUrl:  v.sourceUrl,
    features:    v.features,
    specs: {
      loa:         v.loa,
      beam:        v.beam,
      draft:       v.draft,
      year:        v.year != null ? String(v.year) : "",
      builder:     v.builder,
      model:       v.name,
      staterooms:  v.staterooms,
      engines:     v.engines,
      power:       v.power,
      // Extended fields for richer emails
      maxSpeed:    v.maxSpeed,
      cruiseSpeed: v.cruiseSpeed,
      range:       v.range,
      guests:      v.guests,
      crew:        v.crew,
      displacement: v.displacement,
      grossTonnage: v.grossTonnage,
    },
  };
}

// ─── Generic fallback ────────────────────────────────────────────────────────

import * as cheerio from "cheerio";
import { assignSpec, cleanHeadline, clean, dedupeImages } from "./utils";

async function genericScrape(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "text/html,*/*",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // Name
  vessel.name =
    cleanHeadline($('meta[property="og:title"]').attr("content")) ||
    cleanHeadline($("h1").first().text()) ||
    "";

  // Description
  vessel.description = clean(
    $('meta[property="og:description"]').attr("content") ||
    $("article p").first().text() ||
    $("main p").first().text()
  );

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        if (!node) continue;
        if (node.name && !vessel.name) vessel.name = cleanHeadline(String(node.name)) || "";
        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string, string>)?.url || "";
            if (src && /^https?:\/\//i.test(src)) vessel.images.push({ src, alt: "" });
          }
        }
        const props = Array.isArray(node.additionalProperty)
          ? (node.additionalProperty as { name?: string; value?: string }[]) : [];
        for (const p of props) {
          if (p.name && p.value) assignSpec(vessel, p.name, String(p.value));
        }
        const offers = (node.offers as Record<string, unknown>) || {};
        if (offers.price && !vessel.price) vessel.price = String(offers.price);
      }
    } catch { /* skip */ }
  });

  // DOM specs
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });
  // key-specs pattern: <div><strong>LOA</strong><span>34.13m</span></div>
  $(".key-specs div, .specs-grid div, .vessel-specs div").each((_, el) => {
    const label = $(el).find("strong, b, .label, .spec-label").first().text();
    const value = $(el).find("span, .value, .spec-value").first().text();
    if (label && value) assignSpec(vessel, label, value);
  });
  // strong+br pattern: <p><strong>Label</strong><br/>Value<br/>...</p>
  $("p, .specs-column, .column-1, .column-2, .column-3, .column-4").each((_, p) => {
    const html = $(p).html() || "";
    const parts = html.split(/<br\s*\/?>/i);
    for (let i = 0; i < parts.length - 1; i++) {
      const sm = parts[i].match(/<strong[^>]*>(.*?)<\/strong>/i);
      if (sm) {
        const label = sm[1].replace(/<[^>]+>/g, "").trim();
        const val = parts[i + 1].replace(/<[^>]+>/g, "").trim();
        if (label && val) assignSpec(vessel, label, val);
      }
    }
  });

  // OG image
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && vessel.images.length === 0) vessel.images.push({ src: ogImg, alt: vessel.name });

  // Gallery images
  $("img[src]").each((_, img) => {
    const src = $(img).attr("data-src") || $(img).attr("src") || "";
    if (/\.(jpe?g|png|webp)/i.test(src) && /^https?:\/\//i.test(src)) {
      vessel.images.push({ src, alt: clean($(img).attr("alt")) });
    }
  });

  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|sprite|pixel|favicon|\.svg/i.test(i.src)
  );

  return vessel;
}

function normaliseUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export type { VesselData };
export { emptyVessel };
