/**
 * RUYachts scraper (ruyachts.com)
 * Spec structure: div.item > div.wrapper > div.title + div.txt
 * Plain fetch works — no Cloudflare protection.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec, dualMeasure } from "../utils";

export async function scrapeRUYachts(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ruyachts fetch ${res.status}`);
  return parseRUYachts(url, await res.text());
}

function parseRUYachts(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── Name ──────────────────────────────────────────────────────────────────
  vessel.name = cleanHeadline(
    $("h1").first().text() ||
    $('meta[property="og:title"]').attr("content") || ""
  )
    .replace(/\s*[|\-–]\s*Romeo United Yachts.*$/i, "")
    .replace(/\s+for\s+sale\s*/i, " ")
    .replace(/\s+Yacht\s*$/i, "")
    .trim();

  // ── Spec grid: div.item > div.wrapper > div.title + div.txt ──────────────
  // The FIRST wrapper often contains a long descriptive text (not a spec).
  // Subsequent wrappers are proper label:value spec pairs.
  $("div.item div.wrapper").each((_, wrapper) => {
    const label = clean($(".title", wrapper).first().text());
    const value = clean($(".txt", wrapper).first().text());
    if (!label || !value) return;

    // Long values (>80 chars, likely prose) that don't look like spec values
    // are the vessel description paragraph ruyachts embeds in the spec grid.
    if (!vessel.description && value.length > 80 && !/^\d/.test(value) && value.split(" ").length > 12) {
      vessel.description = value;
      return; // don't pass to assignSpec
    }

    assignSpec(vessel, label, value);
  });

  // ── Fallback: any div pair where first child looks like a label ───────────
  if (!vessel.loa) {
    $("[class*='spec'], [class*='detail'], [class*='characteristic']").each((_, container) => {
      $(container).find(".title, .label, .key, th, dt").each((_, labelEl) => {
        const label = clean($(labelEl).text());
        const value = clean(
          $(labelEl).next().text() ||
          $(labelEl).siblings(".txt, .value, .val, td, dd").first().text()
        );
        if (label && value && label.length < 60) assignSpec(vessel, label, value);
      });
    });
  }

  // ── Table fallback ────────────────────────────────────────────────────────
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── DL/DT/DD fallback ────────────────────────────────────────────────────
  $("dt").each((_, el) => {
    assignSpec(vessel, $(el).text(), $(el).next("dd").text());
  });

  // ── JSON-LD structured data ───────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        if (node.name && !vessel.name) vessel.name = cleanHeadline(String(node.name));
        if (node.description && !vessel.description) vessel.description = clean(String(node.description));
        const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
        for (const p of props as { name?: string; value?: string }[]) {
          if (p.name && p.value) assignSpec(vessel, p.name, String(p.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── Description ──────────────────────────────────────────────────────────
  // Populated above from spec grid prose block; fallback to page-level selectors.
  if (!vessel.description) {
    const desc =
      clean($(".description, [class*='overview'] p, article p, [class*='about'] p").first().text()) ||
      clean($('meta[property="og:description"]').attr("content"));
    // Reject generic SEO meta descriptions (contain "for Sale" and are short)
    if (desc && !(desc.length < 120 && /for sale/i.test(desc))) {
      vessel.description = desc;
    }
  }

  // ── Price ─────────────────────────────────────────────────────────────────
  if (!vessel.price) {
    const priceText = $("[class*='price' i]").first().text();
    const priceMatch = priceText.match(/(US\$[\d,]+|\$[\d,]+|€[\d,]+|£[\d,]+)/);
    if (priceMatch) vessel.price = priceMatch[1];
  }

  // ── Location ──────────────────────────────────────────────────────────────
  if (!vessel.location) {
    vessel.location = clean($("[class*='location' i], [class*='lying' i]").first().text());
  }

  // ── Images ────────────────────────────────────────────────────────────────
  const base = new URL(url);

  $("img[src], img[data-src]").each((_, img) => {
    const src =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("src") || "";
    const alt = clean($(img).attr("alt") || "");

    if (!src) return;
    if (/logo|icon|sprite|no-photo|placeholder|\.svg|1x1|pixel|persons?\/|broker|agent|staff|team|farzan|avatar|\/th\/th-|model\/cover|shipyard\/logo|events\/|yacht-news\/|ruy\.png/i.test(src)) return;

    // Make relative URLs absolute
    let absSrc = src;
    if (!/^https?:\/\//i.test(src)) {
      try { absSrc = new URL(src, base).href; } catch { return; }
    }

    vessel.images.push({ src: absSrc, alt });
  });

  vessel.images = dedupeImages(vessel.images);

  // OG image as fallback hero — but skip site brand marks
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && vessel.images.length === 0
      && !/logo|icon|ruy\.png|placeholder|no-photo/i.test(ogImg)) {
    vessel.images.push({ src: ogImg, alt: vessel.name });
  }

  return vessel;
}
