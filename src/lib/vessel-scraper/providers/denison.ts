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

/** Decode HTML entities AND sanitize ALL control characters inside JSON string values.
 *  Denison embeds raw \n, \r, \t, and other control chars (0x00–0x1F) directly
 *  inside JSON string values, making the entire block invalid JSON.
 *  Strategy: walk char-by-char, track string context, replace any control char with space. */
function decodeEntities(s: string): string {
  // 1. Decode HTML entities
  const decoded = s
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");

  // 2. Walk char-by-char: replace all control chars inside string literals with space
  const out: string[] = [];
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < decoded.length; i++) {
    const ch = decoded[i];
    if (escapeNext) { out.push(ch); escapeNext = false; continue; }
    if (ch === "\\" && inString) { out.push(ch); escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; out.push(ch); continue; }
    if (inString && ch.charCodeAt(0) < 32) { out.push(" "); continue; }
    out.push(ch);
  }
  return out.join("");
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

  // ── 4. Spec text extraction — THREE formats Denison uses ─────────────────
  const specContainer = $(".specifications, [class*='spec'], [class*='detail']").first();
  const rawSpecText = specContainer.length
    ? specContainer.text()
    : $("body").text().slice(0, 40000);

  const specText = rawSpecText
    .replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/\r\n|\r|\n/g, " ")   // collapse ALL newlines → spaces
    .replace(/\s{2,}/g, " ");       // collapse multiple spaces → single

  // ── Helper: parse "N x QTY|unit" tank notation ───────────────────────────
  function parseTank(value: string): string {
    const m = value.match(/^(\d+)\s*x\s*([\d,]+)\s*\|?\s*(gallon|liter|litre|gal|lt)\b/i);
    if (!m) return value;
    const total = parseInt(m[1]) * parseInt(m[2].replace(/,/g, ""));
    if (/gal/i.test(m[3])) {
      return `${total.toLocaleString("en-US")} gal / ${Math.round(total * 3.78541).toLocaleString("en-US")} lt`;
    }
    return `${total.toLocaleString("en-US")} lt / ${Math.round(total / 3.78541).toLocaleString("en-US")} gal`;
  }

  // ── Format A: direct targeted extraction for key fields ──────────────────
  // Use specific regex per field — more reliable than generic colon parsing
  // because after whitespace normalization colon-values bleed into adjacent labels

  const directMatch = (pattern: RegExp): string => {
    const m = specText.match(pattern);
    return m ? m[1].trim() : "";
  };

  // Tanks — "Label: N x QTY|unit"
  if (!vessel.fuelTank) {
    const raw = directMatch(/(?:Fuel\s*Tank|Fuel)[:\s]+(\d+\s*x\s*[\d,]+\|?\s*(?:gallon|gal|lt|litre|liter)\b)/i);
    if (raw) vessel.fuelTank = parseTank(raw);
  }
  if (!vessel.freshWater) {
    const raw = directMatch(/Fresh\s*Water[:\s]+(\d+\s*x\s*[\d,]+\|?\s*(?:gallon|gal|lt|litre|liter)\b)/i);
    if (raw) vessel.freshWater = parseTank(raw);
  }
  if (!vessel.holdingTank) {
    const raw = directMatch(/Holding[:\s]+(\d+\s*x\s*[\d,]+\|?\s*(?:gallon|gal|lt|litre|liter)\b)/i);
    if (raw) vessel.holdingTank = parseTank(raw);
  }

  // Basic specs — "Label: Value" (stop before next capital Label pattern)
  const colonExtract = (label: RegExp, maxLen = 60): string => {
    const m = specText.match(label);
    if (!m) return "";
    // Grab text after the match, stop at the next "Word Word:" or end of reasonable value
    const after = specText.slice(m.index! + m[0].length).trim();
    const stop = after.search(/\s[A-Z][a-z]+\s[A-Z]|\s[A-Z]{2,}[a-z]+:/);
    return (stop > 0 ? after.slice(0, Math.min(stop, maxLen)) : after.slice(0, maxLen)).trim();
  };

  if (!vessel.staterooms) {
    const v = directMatch(/Cabins[:\s]+(\d+)/i);
    if (v) vessel.staterooms = v;
  }
  if (!vessel.guests) {
    const v = directMatch(/Max\s*Passengers[:\s]+(\d+)/i);
    if (v) vessel.guests = v;
  }

  // Equipment — "Label - Value" (stop at next dash-pair item)
  const dashExtract = (label: RegExp, maxLen = 60): string => {
    const m = specText.match(label);
    if (!m) return "";
    const after = specText.slice(m.index! + m[0].length).trim();
    // Stop at comma, or at next "Word - " pattern indicating new equipment item
    const commaStop = after.indexOf(",");
    const nextItem = after.search(/\b[A-Z][a-zA-Z\s]{2,20}\s+-\s+[A-Z]/);
    const stop = [commaStop, nextItem].filter(n => n > 4).sort((a,b) => a-b)[0] ?? maxLen;
    return after.slice(0, Math.min(stop, maxLen)).trim();
  };

  if (!vessel.gensets)       vessel.gensets       = dashExtract(/(?:Main\s*)?Generator\s*-\s*/i, 50);
  if (!vessel.shorepower)    vessel.shorepower    = dashExtract(/Shore\s*(?:Cable|Power)\s*-\s*/i, 40);
  if (!vessel.voltageSystem) {
    // Stop before "Lighting", "Emergency", or "Battery" which are adjacent line items
    const m = specText.match(/Main\s*Power\s*System\s*-\s*([A-Za-z0-9\/\s]+?)(?=\s+Lighting\b|\s+Emergency\b|\s+Battery\b)/i);
    if (m) vessel.voltageSystem = m[1].trim();
  }
  if (!vessel.airCon)        vessel.airCon        = dashExtract(/Air\s*Conditioning\s*-\s*/i, 80);
  if (!vessel.bowThruster) {
    // "Bow and Stern Thrusters - Upgraded..." → the value is a refit note; just confirm presence
    const hasBowStern = /Bow\s*and\s*Stern\s*Thruster[s]?/i.test(specText);
    if (hasBowStern) {
      vessel.bowThruster   = "Hydraulic (Bow & Stern)";
      vessel.sternThruster = "Hydraulic (Bow & Stern)";
    } else {
      vessel.bowThruster   = dashExtract(/Bow\s*Thruster[s]?\s*-\s*/i, 60);
      vessel.sternThruster = dashExtract(/Stern\s*Thruster[s]?\s*-\s*/i, 60);
    }
  }
  if (!vessel.sternThruster && vessel.bowThruster) vessel.sternThruster = vessel.bowThruster;
  if (!vessel.radar)         vessel.radar         = dashExtract(/Radar\s*-\s*/i, 30);
  if (!vessel.autopilot) {
    const m = specText.match(/Autopilot\s+([A-Z][A-Z0-9\-]{2,20})/i);
    if (m) vessel.autopilot = m[1].trim();
  }
  if (!vessel.aisSystem && /\bAIS\b/.test(specText)) vessel.aisSystem = "SIMRAD AIS";
  if (!vessel.satcom && /Starlink/i.test(specText)) vessel.satcom = "Starlink";
  if (!vessel.chartPlotter) {
    // Stop specifically before "SIMRAD AIS" or "SIMRAD Aut" to avoid bleeding into next items
    const m = specText.match(/Plotter\s*-\s*(.+?)(?=\s+SIMRAD\s+AIS|\s+SIMRAD\s+Aut|\s+Ritchie)/i);
    if (m) vessel.chartPlotter = m[1].trim();
  }
  if (!vessel.fireSuppression && /Fixed\s*Fire\s*Suppression/i.test(specText)) {
    vessel.fireSuppression = "Fixed Fire Suppression";
  }
  if (!vessel.lifeRafts) {
    const parts: string[] = [];
    if (/EPIRB/i.test(specText)) parts.push("EPIRB");
    const pfds = specText.match(/(\d+)\s*Adult\s*type\s*[12]\s*PFD/i);
    if (pfds) parts.push(pfds[0].trim());
    if (parts.length) vessel.lifeRafts = parts.join("; ");
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

  // ── 7. Gallery — collect ALL boatsgroup images from img tags ─────────────
  const imgSet = new Map<string, string>(); // base path → best URL

  // Prefer full-res /images/ path over /resize/ thumbnails
  // Both patterns appear: data-src="/resize/...?w=800" and href="/images/..."
  const addImg = (raw: string) => {
    if (!raw || !/boatsgroup\.com/i.test(raw)) return;
    const decoded = raw.replace(/&amp;/g, "&");
    if (isJunk(decoded)) return;
    // Prefer /images/ (full res) over /resize/ (thumbnail)
    const fullRes = decoded
      .replace(/\/resize\/(\d+\/\d+\/\d+\/)/, "/images/$1")  // /resize/X/Y/Z/ → /images/X/Y/Z/
      .split("?")[0];                                          // strip all query params
    const key = fullRes;
    if (!imgSet.has(key)) imgSet.set(key, fullRes);
  };

  $("img").each((_, img) => {
    addImg($(img).attr("data-src") || "");
    addImg($(img).attr("data-lazy-src") || "");
    addImg($(img).attr("src") || "");
  });

  // Anchor tags often hold full-res /images/ links (lightbox pattern)
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/boatsgroup\.com\/images\//i.test(href)) addImg(href);
  });

  // Regex sweep of raw HTML for any /images/ boatsgroup URLs missed by cheerio
  const bgFullRegex = /https:\/\/images\.boatsgroup\.com\/images\/[^\s"'&<>]+\.(?:jpg|jpeg|png|webp)/gi;
  // Also catch /resize/ ones we might have missed
  const bgResizeRegex = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s"'&<>]+\.(?:jpg|jpeg|png|webp)[^\s"'&<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = bgFullRegex.exec(html)) !== null)   addImg(m[0]);
  while ((m = bgResizeRegex.exec(html)) !== null)  addImg(m[0]);

  // Merge with any existing images (e.g. from JSON-LD)
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
