/**
 * SuperYachtTimes.com vessel scraper
 * Sites: superyachttimes.com/yacht-news/[slug]
 *        superyachttimes.com/yachts/[name]
 *
 * SYT is a hybrid news/database site. Listing-style pages have a structured
 * "Key Facts" sidebar and spec table. News articles embed specs inline.
 *
 * HTML structure:
 *   Key facts box:   .key-facts table tr, .yacht-specs tr, .specifications tr
 *   Article body:    .article-content p, .content-body p
 *   Gallery:         .image-gallery img, .photo-gallery img
 *   Hero:            meta[property="og:image"] or .article-hero img
 *
 * Image notes:
 *   - SYT images are served from media.superyachttimes.com — no watermarks
 *   - Filter out staff/author photos and logo assets
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

export async function scrapeSuperyachtTimes(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`SuperYachtTimes fetch failed: ${res.status}`);
  const html = await res.text();
  return parseSuperyachtTimes(url, html);
}

function parseSuperyachtTimes(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name ──────────────────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1.article-title, h1.yacht-name, h1.page-title, h1").first().text()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content")) || "";

  // Strip common SYT suffixes like " | For Sale" or " – SuperYachtTimes"
  vessel.name = vessel.name
    .replace(/\s*[|–-]\s*(for sale|superyacht times|syt|news).*$/i, "")
    .trim();

  // ── 2. Description (article body + sub-heading) ───────────────────────────
  const subHeading = clean($(".article-subtitle, .intro-text, .standfirst").first().text());
  const bodyParts: string[] = [];
  $(".article-content p, .content-body p, .article-body p, .entry-content p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 40) bodyParts.push(t);
  });
  const ogDesc = clean($('meta[property="og:description"]').attr("content"));
  vessel.description = subHeading || bodyParts.slice(0, 3).join("\n\n") || ogDesc;

  // ── 3. Key Facts / Specs ─────────────────────────────────────────────────
  // Pattern A: table inside .key-facts or .yacht-specs or .specifications block
  $(".key-facts table tr, .yacht-specs table tr, .specifications table tr, .spec-table tr, .boat-details tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // Pattern B: dt/dd spec lists
  $(".key-facts dl dt, .yacht-specs dl dt, dl.specs dt").each((_, dt) => {
    assignSpec(vessel, $(dt).text(), $(dt).next("dd").text());
  });

  // Pattern C: .spec-item or .fact-item divs
  $(".spec-item, .fact-item, .key-fact").each((_, el) => {
    const label = clean($(el).find(".label, strong, .spec-label, dt").first().text());
    const value = clean($(el).find(".value, span, .spec-value, dd").last().text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Pattern D: paragraph-embedded specs (common in SYT articles)
  //   "LOA: 45m | Beam: 8.5m | Builder: Lürssen | Year: 2010"
  const inlineSpecText = $(".article-content, .content-body").text();
  const inlineBlocks = inlineSpecText.match(/([A-Za-z][A-Za-z\s\/]+):\s*([^\|,\n]{2,40})/g) || [];
  for (const block of inlineBlocks) {
    const sep = block.indexOf(":");
    const label = block.slice(0, sep).trim();
    const value = block.slice(sep + 1).trim();
    if (label.length < 35 && value.length > 1 && value.length < 60) {
      assignSpec(vessel, label, value);
    }
  }

  // ── 4. Price ─────────────────────────────────────────────────────────────
  if (!vessel.price) {
    const priceText = clean($(".price, .asking-price, .sale-price").first().text());
    if (priceText && /\d/.test(priceText)) vessel.price = priceText;
    // Also check article text for "asking price of $X million"
    if (!vessel.price) {
      const priceMatch = inlineSpecText.match(/asking price[^\d$€£]*([€$£][\d,\.]+(?:\s*million)?)/i);
      if (priceMatch) vessel.price = priceMatch[1];
    }
  }

  // ── 5. Location ──────────────────────────────────────────────────────────
  if (!vessel.location) {
    const loc = clean($(".location, .lying-at, .yacht-location").first().text());
    if (loc) vessel.location = loc;
  }

  // ── 6. Year/Builder from meta or article headline if still missing ────────
  if (!vessel.year || !vessel.builder) {
    // e.g. "2010 Lürssen 45m superyacht Calliope is for sale"
    const titleText = $("h1").first().text();
    if (!vessel.year) {
      const ym = titleText.match(/\b(19|20)\d{2}\b/);
      if (ym) vessel.year = parseInt(ym[0]);
    }
  }

  // ── 7. Images ────────────────────────────────────────────────────────────
  const imgSet = new Map<string, string>();

  // Hero OG image first
  const og = $('meta[property="og:image"]').attr("content");
  if (og && /^https?:\/\//i.test(og)) imgSet.set("og", og);

  // Gallery and article images
  $("img[src], img[data-src], img[data-lazy-src]").each((_, img) => {
    const src =
      $(img).attr("data-lazy-src") ||
      $(img).attr("data-src") ||
      $(img).attr("src") || "";
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (!/\.(jpe?g|png|webp)/i.test(src)) return;
    if (isSYTJunk(src, $, img)) return;
    const key = src.split("?")[0];
    if (!imgSet.has(key)) imgSet.set(key, src);
  });

  vessel.images = Array.from(imgSet.values()).map(src => ({ src, alt: vessel.name }));
  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|sprite|favicon|avatar|author|staff|placeholder|no-photo|noimage/i.test(i.src)
  );

  return vessel;
}

/** Filter out SYT UI chrome: author photos, category thumbnails, ad banners */
function isSYTJunk(src: string, $: ReturnType<typeof cheerio.load>, el: ReturnType<typeof $>[0]): boolean {
  // Small site thumbnails often have dimensions in URL like -150x150
  if (/-\d{2,3}x\d{2,3}\./i.test(src)) return true;
  // Author/staff/logo
  if (/author|staff|avatar|logo|icon|banner|ad\b|advert|sponsor/i.test(src)) return true;
  // Alt text contains junk signals
  const alt = ($(el).attr("alt") || "").toLowerCase();
  if (/logo|icon|author|sponsor|partner/i.test(alt)) return true;
  return false;
}
