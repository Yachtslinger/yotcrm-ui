/**
 * SuperYachtFan.com vessel scraper
 * Sites: superyachtfan.com/yacht/[name]/
 *        superyachtfan.com/superyacht/[name]/
 *
 * SYF is a dedicated yacht database. Profile pages are highly structured:
 *   - Technical specs in multiple .specifications-table sections
 *   - Exterior/Interior design credits
 *   - Charter and ownership history
 *   - Photo gallery with owner-submitted photos
 *
 * HTML structure:
 *   Specs:    .yacht-spec-list li  (label in .label span, value in .value span)
 *             OR table.specifications-table tr
 *             OR .spec-block .spec-row
 *   Name:     h1.yacht-name or h1
 *   Builder:  .yacht-builder or spec row "Shipyard"
 *   Gallery:  .gallery-container img, .photo-slider img
 *             Lazy: data-original, data-lazy, data-src
 *
 * Image notes:
 *   - SYF photos are generally unwatermarked professional shots
 *   - Filter out SYF site logos and tiny thumbnails
 *   - Some images have "/thumb/" in path — prefer parent without "/thumb/"
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
  Referer: "https://www.superyachtfan.com/",
};

export async function scrapeSuperyachtFan(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`SuperYachtFan fetch failed: ${res.status}`);
  const html = await res.text();
  return parseSuperyachtFan(url, html);
}

function parseSuperyachtFan(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name ──────────────────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1.yacht-name, h1.entry-title, h1").first().text()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content")) || "";
  vessel.name = vessel.name
    .replace(/\s*[|–-]\s*(superyacht|superyachtfan|fan|yacht|database).*$/i, "")
    .trim();

  // ── 2. Description ───────────────────────────────────────────────────────
  const descParts: string[] = [];
  $(".yacht-description p, .yacht-intro p, .about-yacht p, .entry-content p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 40) descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.slice(0, 3).join("\n\n");
  else {
    vessel.description = clean($('meta[property="og:description"]').attr("content"));
  }

  // ── 3. Specs — SYF has multiple spec section patterns ────────────────────
  // Pattern A: <ul class="yacht-spec-list"> <li><span class="label">...</span><span class="value">...</span></li>
  $(".yacht-spec-list li, .spec-list li, .specifications-list li").each((_, li) => {
    const label = clean($(li).find(".label, .spec-name, strong, dt").first().text());
    const value = clean($(li).find(".value, .spec-value, span:last-child, dd").last().text());
    if (label && value && label !== value) assignSpec(vessel, label, value);
  });

  // Pattern B: table rows in any .specifications or .tech-specs table
  $(".specifications table tr, .technical-specs table tr, .spec-table tr, table.yacht-specs tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // Pattern C: .spec-row div pattern
  $(".spec-row, .detail-row, .info-row").each((_, row) => {
    const label = clean($(row).find(".spec-label, .label, .detail-label, strong").first().text());
    const value = clean($(row).find(".spec-value, .value, .detail-value, span").last().text());
    if (label && value && label !== value) assignSpec(vessel, label, value);
  });

  // Pattern D: SYF sometimes uses definition-list style
  $("dl dt").each((_, dt) => {
    assignSpec(vessel, $(dt).text(), $(dt).next("dd").text());
  });

  // Pattern E: compact inline "Key: Value" paragraphs in article
  $(".yacht-facts p, .quick-facts p").each((_, p) => {
    const text = clean($(p).text());
    const colonIdx = text.indexOf(":");
    if (colonIdx > 0 && colonIdx < 35) {
      assignSpec(vessel, text.slice(0, colonIdx), text.slice(colonIdx + 1).trim());
    }
  });

  // ── 4. Builder/Shipyard (SYF often has a dedicated .yacht-builder element) ─
  if (!vessel.builder) {
    const builder = clean($(".yacht-builder a, .shipyard-name, [itemprop='manufacturer']").first().text());
    if (builder) vessel.builder = builder;
  }

  // ── 5. Location ──────────────────────────────────────────────────────────
  if (!vessel.location) {
    const loc = clean($(".yacht-location, .home-port, .lying-at").first().text());
    if (loc) vessel.location = loc;
  }

  // ── 6. Price ─────────────────────────────────────────────────────────────
  if (!vessel.price) {
    const p = clean($(".charter-price, .sale-price, .asking-price, .price").first().text());
    if (p && /\d/.test(p)) vessel.price = p;
  }

  // ── 7. Images ────────────────────────────────────────────────────────────
  const imgSet = new Map<string, string>();

  // OG image as hero
  const og = $('meta[property="og:image"]').attr("content");
  if (og && /^https?:\/\//i.test(og)) imgSet.set("og", og);

  // Gallery images — SYF lazy-loads with data-original or data-lazy
  $("img[data-original], img[data-lazy], img[data-src], img[src]").each((_, img) => {
    const src =
      $(img).attr("data-original") ||
      $(img).attr("data-lazy") ||
      $(img).attr("data-src") ||
      $(img).attr("src") || "";
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (!/\.(jpe?g|png|webp)/i.test(src)) return;
    if (isSYFJunk(src)) return;
    // Prefer non-thumbnail: if URL contains /thumb/ try to get the parent
    const key = src.replace(/\/thumb\//, "/").split("?")[0];
    const fullSrc = src.includes("/thumb/") ? src.replace("/thumb/", "/") : src;
    if (!imgSet.has(key)) imgSet.set(key, fullSrc);
  });

  vessel.images = Array.from(imgSet.values()).map(src => ({ src, alt: vessel.name }));
  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|sprite|favicon|avatar|banner|author|placeholder|noimage|no-image|default-yacht/i.test(i.src)
  );

  return vessel;
}

/** Filter out SYF UI chrome: logos, small thumbnails, sponsors */
function isSYFJunk(src: string): boolean {
  if (/logo|icon|avatar|banner|sponsor|partner|advertisement|social/i.test(src)) return true;
  // Tiny thumbnails with explicit dimensions
  if (/-\d{2}x\d{2,3}\./i.test(src)) return true;
  return false;
}
