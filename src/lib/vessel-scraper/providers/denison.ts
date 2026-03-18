/**
 * Denison Yachting / Denison Yacht Sales scraper
 * Sites: denisonyachtsales.com, denisonyachting.com
 *
 * Page structure (confirmed 2026-03):
 *   - JSON-LD type "Vehicle" — contains additionalProperty specs, brand, price, single thumb image
 *     NOTE: JSON-LD contains HTML entities (&#039; &amp; etc) so must be decoded before JSON.parse
 *   - JSON-LD name = "138' Richmond 2004" (LOA + builder + year) — NOT the vessel name
 *   - Vessel name is in <h1> only
 *   - Year is in JSON-LD description text: "built by X in YYYY"
 *   - 39+ XLARGE gallery images at images.boatsgroup.com/resize/...XLARGE.jpg?w=800
 *     → upscale by replacing w=800 with w=1200 and stripping format=webp
 *   - Specs in flat "Label: Value" text block under class="specifications"
 *   - Description in class="description" <p> or overview section
 */

import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function scrapeDenison(url: string): Promise<VesselData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let html: string;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Denison fetch failed (${res.status})`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }
  return parseDenison(url, html);
}

/** Decode HTML entities in a string so JSON.parse won't choke */
function decodeEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

/** Upscale a boatsgroup CDN thumbnail to full resolution */
function upscaleBoatsgroup(src: string): string {
  return src
    .replace(/[?&]w=\d+/,  (m) => m.replace(/\d+/, "1200"))
    .replace(/[?&]h=\d+/g, "")
    .replace(/[?&]format=webp/g, "")
    .replace(/[?&]exact/g, "")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder|language-flag|Arrow|Image-3\d\d/i.test(src);
}

function parseDenison(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. JSON-LD — decode entities first, then parse ───────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = decodeEntities($(el).text());
    let json: Record<string, unknown>;
    try { json = JSON.parse(raw); } catch { return; }

    const nodes: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : json["@graph"] ? (json["@graph"] as Record<string, unknown>[]) : [json];

    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const type = String(node["@type"] || "").toLowerCase();
      if (!/vehicle|product|boat/i.test(type) && !node.offers) continue;

      // ── Price ──────────────────────────────────────────────────────────
      const offers = (node.offers as Record<string, unknown>) || {};
      if (offers.price && !vessel.price) {
        const p = Number(offers.price);
        vessel.price = !isNaN(p) ? `$${p.toLocaleString("en-US")}` : String(offers.price);
      }

      // ── Builder from brand.name ────────────────────────────────────────
      const brand = (node.brand as Record<string, string>);
      if (brand?.name && !vessel.builder) vessel.builder = clean(brand.name);

      // ── Year: mine from description text "built by X in YYYY" ─────────
      if (!vessel.year && node.description) {
        const desc = String(node.description);
        const ym = desc.match(/\bin\s+((?:19|20)\d{2})\b/i) ||
                   desc.match(/\b((?:19|20)\d{2})\b/);
        if (ym) vessel.year = parseInt(ym[1]);
      }

      // ── Location ───────────────────────────────────────────────────────
      if (!vessel.location && node.description) {
        const desc = String(node.description);
        const locm = desc.match(/located in ([A-Za-z ,]+?)(?:\.|;|and )/i);
        if (locm) vessel.location = clean(locm[1]);
      }

      // ── Single thumb image from JSON-LD (low-res — upscale) ───────────
      const ldImg = node.image as string | undefined;
      if (ldImg && /^https?:\/\//i.test(ldImg)) {
        vessel.images.push({ src: upscaleBoatsgroup(ldImg), alt: "" });
      }

      // ── additionalProperty specs ───────────────────────────────────────
      const props = Array.isArray(node.additionalProperty)
        ? (node.additionalProperty as { name?: string; value?: string }[]) : [];
      for (const prop of props) {
        if (prop.name && prop.value) assignSpec(vessel, prop.name, String(prop.value));
      }
    }
  });

  // ── 2. Name from H1 (JSON-LD name is "138' Richmond 2004", not vessel name) ──
  vessel.name =
    cleanHeadline($("h1").first().text().replace(/Yacht for Sale/i, "").trim()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content")) || "";

  // ── 3. Description — find first substantial paragraph ───────────────────
  if (!vessel.description) {
    // Denison description is usually in a <p> inside .overview or .listing-description
    $("p").each((_, p) => {
      if (vessel.description) return;
      const t = clean($(p).text());
      // Skip nav/boilerplate; accept first meaty paragraph about the boat
      if (t.length > 80 && /\b(yacht|vessel|built|motor|sail|feet|meter|knot|cabin|stateroom)\b/i.test(t)) {
        vessel.description = t;
      }
    });
  }
  if (!vessel.description) {
    vessel.description = clean($('meta[property="og:description"]').attr("content"));
  }

  // ── 4. Flat "Label: Value" spec text under .specifications ───────────────
  // Denison renders specs as: "Cruising Speed: 18 kn Maximum Speed: 12 kn Beam: 27' 11'' ..."
  const specContainer = $(".specifications, [class*='spec'], [class*='detail']").first();
  const rawSpecText = specContainer.length
    ? specContainer.text()
    : $("body").text().slice(0, 30000); // fallback: mine full page text

  // Split on known label patterns — look for "Word(s): value" pairs
  const specPairs = rawSpecText.match(/([A-Z][A-Za-z\s\/\(\)]+?):\s*([^\n:]{2,80})/g) || [];
  for (const pair of specPairs) {
    const colon = pair.indexOf(":");
    const label = pair.slice(0, colon).trim();
    const value = pair.slice(colon + 1).trim();
    if (label.length < 50 && value.length > 0 && value.length < 150) {
      assignSpec(vessel, label, value);
    }
  }

  // ── 5. dt/dd and table fallbacks ─────────────────────────────────────────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── 6. Price/location from DOM if JSON-LD didn't have them ───────────────
  if (!vessel.price) {
    const priceText = clean($('[class*="price" i]').first().text());
    if (priceText && /\$/.test(priceText)) vessel.price = priceText;
  }
  if (!vessel.location) {
    vessel.location = clean($('[class*="location" i], .location').first().text());
  }

  // ── 7. Gallery — collect ALL XLARGE boatsgroup images from img tags ──────
  const imgSet = new Map<string, string>(); // base path → best URL

  $("img").each((_, img) => {
    const raw =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("src") || "";
    if (!raw || !/boatsgroup\.com/i.test(raw)) return;
    if (isJunk(raw)) return;

    const decoded = raw.replace(/&amp;/g, "&");
    const upscaled = upscaleBoatsgroup(decoded);
    // Key on base path (without params) to deduplicate same image at diff sizes
    const key = upscaled.split("?")[0];
    if (!imgSet.has(key)) imgSet.set(key, upscaled);
  });

  // Also scan raw HTML for boatsgroup XLARGE URLs missed by cheerio
  const bgRegex = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s"'&<>]+XLARGE[^\s"'&<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = bgRegex.exec(html)) !== null) {
    const src = m[0].replace(/&amp;/g, "&");
    const upscaled = upscaleBoatsgroup(src);
    const key = upscaled.split("?")[0];
    if (!imgSet.has(key) && !isJunk(src)) imgSet.set(key, upscaled);
  }

  // Merge with any existing images (e.g. from JSON-LD), XLARGE set wins
  const existingKeys = new Set(vessel.images.map(i => i.src.split("?")[0]));
  for (const [key, src] of imgSet) {
    if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
  }

  vessel.images = dedupeImages(vessel.images).filter(i => !isJunk(i.src));

  // ── 8. Features / highlights ─────────────────────────────────────────────
  const feats: string[] = [];
  $("h2,h3,h4").filter((_, el) =>
    /feature|highlight|equipment|key/i.test($(el).text())
  ).first().nextUntil("h2,h3,h4").find("li").each((_, li) => {
    const t = clean($(li).text());
    if (t.length > 8 && t.length < 200) feats.push(t);
  });
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}
