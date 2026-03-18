/**
 * BoatInternational.com vessel scraper
 * Sites: boatinternational.com/yachts-for-sale/[slug]
 *        boatinternational.com/superyachts/[slug]
 *
 * Architecture: Server-side rendered with rich structured data.
 *   - JSON-LD (Product/BoatItem)
 *   - Spec table: .specification-list or dl.yacht-specs or table.specs-table
 *   - Gallery: lazily loaded via data-src / data-lazy-src attributes
 *
 * Image notes:
 *   - BI images served from cdn.boatinternational.com — no watermarks
 *   - Prefer largest resolution; filter out thumbnails (<300px in URL params)
 */

import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapeBoatInternational(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`BoatInternational fetch failed: ${res.status}`);
  const html = await res.text();
  return parseBoatInternational(url, html);
}

function parseBoatInternational(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. JSON-LD ───────────────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes: Record<string, unknown>[] = Array.isArray(json)
        ? json
        : json["@graph"] ? json["@graph"] : [json];
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
          if (src && /^https?:\/\//i.test(src)) vessel.images.push({ src, alt: vessel.name });
        }
      }
    } catch { /* skip */ }
  });

  // ── 2. Name ──────────────────────────────────────────────────────────────
  if (!vessel.name) {
    vessel.name =
      cleanHeadline($("h1.yacht-title, h1.listing-title, h1[itemprop='name'], h1").first().text()) || "";
  }

  // ── 3. Price ─────────────────────────────────────────────────────────────
  if (!vessel.price) {
    const p = clean(
      $(".price, .asking-price, [data-testid='price'], .yacht-price, .listing-price").first().text()
    );
    if (p && /\d/.test(p)) vessel.price = p;
  }

  // ── 4. Description ───────────────────────────────────────────────────────
  if (!vessel.description) {
    const parts: string[] = [];
    $(".yacht-description p, .description-text p, .listing-description p, [itemprop='description'] p").each((_, p) => {
      const t = clean($(p).text());
      if (t.length > 40) parts.push(t);
    });
    if (parts.length) vessel.description = parts.join("\n\n");
    else {
      const t = clean($(".yacht-description, .description-text, [itemprop='description']").first().text());
      if (t.length > 40) vessel.description = t;
    }
  }

  // ── 5. Location ──────────────────────────────────────────────────────────
  if (!vessel.location) {
    const loc = clean(
      $(".yacht-location, .location, [itemprop='locationCreated'], .lying-at").first().text()
    );
    if (loc) vessel.location = loc;
  }

  // ── 6. Specs — many possible patterns on BI ──────────────────────────────
  // Pattern A: <dl> spec list
  $("dl.yacht-specs dt, dl.specification-list dt, dl dt").each((_, dt) => {
    const label = clean($(dt).text());
    const value = clean($(dt).next("dd").text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Pattern B: table rows
  $("table.specs-table tr, table.specification-table tr, .specifications-table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // Pattern C: flex/grid key-value items
  $(".spec-item, .specification-item, .yacht-spec-item").each((_, el) => {
    const label = clean($(el).find(".spec-label, .label, strong, dt").first().text());
    const value = clean($(el).find(".spec-value, .value, span, dd").last().text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Pattern D: data-attribute pairs (used on newer BI pages)
  $("[data-spec-name]").each((_, el) => {
    const label = $(el).attr("data-spec-name") || "";
    const value = clean($(el).text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Pattern E: any <li> with a colon-separated label
  $(".specs li, .specifications li").each((_, li) => {
    const text = clean($(li).text());
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0 && colonIdx < 40) {
      assignSpec(vessel, text.slice(0, colonIdx), text.slice(colonIdx + 1));
    }
  });

  // ── 7. Images ────────────────────────────────────────────────────────────
  if (vessel.images.length === 0) {
    const imgSet = new Map<string, string>();

    // Prefer lazy-loaded high-res
    $("img[data-lazy-src], img[data-src], img[src]").each((_, img) => {
      const src =
        $(img).attr("data-lazy-src") ||
        $(img).attr("data-src") ||
        $(img).attr("src") || "";
      if (/^https?:\/\//i.test(src) && /\.(jpe?g|png|webp)/i.test(src)) {
        // Deduplicate by normalized key (strip size params)
        const key = src.replace(/[?&](w|h|width|height|size|q|quality)=[\d]+/gi, "").split("?")[0];
        if (!imgSet.has(key)) imgSet.set(key, src);
      }
    });

    vessel.images = Array.from(imgSet.values()).map(src => ({ src, alt: vessel.name }));
  }

  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|sprite|favicon|avatar|placeholder|no-image|noimage|default|staff|broker|agent/i.test(i.src) &&
    !isThumbnailSmall(i.src)
  );

  return vessel;
}

/** Filter out very small thumbnails based on size params in URL */
function isThumbnailSmall(src: string): boolean {
  const wMatch = src.match(/[?&]w=(\d+)/i) || src.match(/\/(\d+)x\d+\./);
  if (wMatch && parseInt(wMatch[1]) < 200) return true;
  return false;
}
