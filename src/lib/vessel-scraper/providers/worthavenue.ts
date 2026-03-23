/**
 * Worth Avenue Yachts scraper
 * Sites: worthavenueyachts.com/yacht-for-sale/[slug]/
 *        worthavenueyachts.com/yacht/[slug]/
 *
 * Structure: WordPress/Avada theme, server-rendered.
 * Specs live as alternating label/value text nodes inside plain <div> blocks —
 * no special class names needed. Images on CloudFront CDN.
 *
 * Confirmed fields: Length, Beam, Draft, Year Built, Refit, Builder, Designer,
 * Cruising Speed, Max Speed, Stabilizers, Engines, Generators.
 */

import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec, mineFromText } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Cache-Control": "no-cache",
};

export async function scrapeWorthAvenue(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Worth Avenue fetch failed: ${res.status}`);
  return parseWorthAvenue(url, await res.text());
}

function parseWorthAvenue(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name ───────────────────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1.entry-title, h1.yacht-title, h1").first().text()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content") || "") ||
    "";
  // Strip trailing " Yacht for Sale | Worth Avenue Yachts" etc.
  vessel.name = vessel.name.replace(/\s*[|–-]\s*(?:Yacht\s*for\s*(?:Sale|Charter)|Worth\s*Avenue).*/i, "").trim();

  // ── 2. OG / meta basics ──────────────────────────────────────────────────
  const ogDesc = clean($('meta[property="og:description"]').attr("content") || "");
  const metaDesc = clean($('meta[name="description"]').attr("content") || "");

  // Year from title/meta: "GALAXY is a 2005 Motor Yacht"
  if (!vessel.year) {
    const ym = (ogDesc + " " + metaDesc).match(/\b((?:19|20)\d{2})\s+(?:Motor|Sailing|Explorer|Sport|Custom)/i);
    if (ym) vessel.year = parseInt(ym[1]);
  }

  // ── 3. Spec block — alternating label/value divs ──────────────────────────
  // WAY renders specs as a flat sequence of text nodes, label then value.
  // We collect all text in the spec section and pair them up.
  const rawText = $("body").text().replace(/\t/g, " ").replace(/ {3,}/g, "  ");

  // Find the "Specifications" section and extract label:value pairs
  const specSection = rawText.match(/Specifications\s*([\s\S]{100,3000}?)(?:Gallery|Description|Overview|Inquire|Contact|Similar|Charter|\n{4})/i);
  if (specSection) {
    const specText = specSection[1];
    // Split into lines, pair up label → value
    const lines = specText.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i];
      const value = lines[i + 1];
      // Label: short (1-4 words), no numbers. Value: has numbers or is a proper noun
      if (label.length < 50 && !/^\d/.test(label) && value.length < 200) {
        assignSpec(vessel, label, value);
      }
    }
  }

  // ── 4. DOM spec walk — for structured spec blocks ─────────────────────────
  // WAY sometimes uses definition lists or paired divs
  $("dt, .spec-label, .field-label, strong").each((_, el) => {
    const label = $(el).text().trim();
    const value = $(el).next().text().trim() ||
                  $(el).parent().find("dd, .spec-value, .field-value").first().text().trim();
    if (label && value && label.length < 60) assignSpec(vessel, label, value);
  });

  // Table rows
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── 5. JSON-LD ─────────────────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).text());
      const nodes = Array.isArray(d) ? d : (d["@graph"] ? d["@graph"] : [d]);
      for (const node of nodes) {
        if (!node) continue;
        if (!vessel.name && node.name) vessel.name = cleanHeadline(String(node.name));
        const offers = node.offers || {};
        if (!vessel.price && offers.price) {
          const p = Number(offers.price);
          const sym = offers.priceCurrency === "EUR" ? "€" : "$";
          if (!isNaN(p) && p > 0) vessel.price = `${sym}${p.toLocaleString("en-US")}`;
        }
        for (const prop of (node.additionalProperty || [])) {
          if (prop.name && prop.value) assignSpec(vessel, String(prop.name), String(prop.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── 6. Price — WAY often shows price in page text ─────────────────────────
  if (!vessel.price) {
    // "Asking Price: $12,500,000" or "$12,500,000" near "price"
    const pm = rawText.match(/[Aa]sking\s+[Pp]rice[:\s]*(\$[\d,]+)/);
    const pm2 = rawText.match(/\$([\d]{1,3}(?:,\d{3})+)/);
    if (pm) vessel.price = pm[1];
    else if (pm2 && parseInt(pm2[1].replace(/,/g,"")) > 100000) vessel.price = `$${pm2[1]}`;
  }

  // ── 7. Description ─────────────────────────────────────────────────────────
  const JUNK = /privacy|cookie|newsletter|worth avenue|inquire|disclaimer|terms of use/i;
  const descParts: string[] = [];
  $("p, .entry-content p, .yacht-description p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 80 || JUNK.test(t)) return;
    if (!/yacht|vessel|engine|knot|deck|stateroom|cabin|hull|beam|guest|charter|owner/i.test(t)) return;
    if (!descParts.includes(t)) descParts.push(t);
  });
  vessel.description = descParts.join("\n\n").slice(0, 6000) || ogDesc;

  // ── 8. Features from bullet lists near spec/amenity sections ───────────────
  const feats: string[] = [];
  $("ul li, ol li").each((_, li) => {
    const t = clean($(li).text());
    if (t.length > 5 && t.length < 150 && !/menu|nav|cookie|privacy|terms/i.test(t)) {
      feats.push(t);
    }
  });
  vessel.features = [...new Set(feats)].slice(0, 30);

  // ── 9. Images — CloudFront CDN ────────────────────────────────────────────
  // WAY serves all yacht images via d1s3bchkz5vhvg.cloudfront.net
  // Prefer full-size (no -yacht_large, _medium, _thumbnail suffix)
  const imgMap = new Map<string, string>();
  const addImg = (src: string) => {
    if (!src || !/cloudfront\.net|worthavenueyachts\.com/i.test(src)) return;
    if (/logo|icon|badge|map|placeholder/i.test(src)) return;
    // Key = base without size suffix, prefer largest
    const key = src.replace(/-yacht_(?:large|medium|small|thumbnail)/i, "").split("?")[0];
    const existing = imgMap.get(key) || "";
    // Keep the one without a size suffix (full res) or prefer _large
    if (!existing || (!src.includes("_medium") && !src.includes("_thumbnail") && !src.includes("_small"))) {
      imgMap.set(key, src);
    }
  };

  $("img").each((_, img) => {
    addImg($(img).attr("data-src") || "");
    addImg($(img).attr("data-lazy-src") || "");
    addImg($(img).attr("src") || "");
    addImg($(img).attr("data-bg") || "");
  });

  // Regex sweep for CloudFront URLs in JS/data attributes
  const cfRe = /https?:\/\/d1s3bchkz5vhvg\.cloudfront\.net\/[^\s"'<>]+\.(?:jpe?g|png|webp)[^\s"'<>]*/gi;
  let cfMatch: RegExpExecArray | null;
  while ((cfMatch = cfRe.exec(html)) !== null) addImg(cfMatch[0]);

  for (const [, src] of imgMap) {
    vessel.images.push({ src, alt: vessel.name });
  }
  vessel.images = dedupeImages(vessel.images);

  // ── 10. Mine description for remaining fields ──────────────────────────────
  if (vessel.description) mineFromText(vessel, vessel.description);
  if (vessel.features?.length) mineFromText(vessel, vessel.features.join(". "));

  return vessel;
}
