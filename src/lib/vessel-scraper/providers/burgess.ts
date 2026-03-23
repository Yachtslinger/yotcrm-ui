/**
 * Burgess Yachts scraper
 * Site: burgessyachts.com/en/buy-a-yacht/yachts-for-sale/[name]-[id]
 *
 * Structure: Server-rendered .NET site. JSON-LD Vehicle with name+brand
 * but NO additionalProperty. All spec data lives as alternating label/value
 * text nodes in plain <div> blocks — same pattern as Worth Avenue.
 *
 * Images: served via burgessyachts.com CDN and imgix.
 * Price: POA only on most listings; USD shown in page text when available.
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
};

export async function scrapeBurgess(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Burgess fetch failed: ${res.status}`);
  return parseBurgess(url, await res.text());
}

function parseBurgess(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name from JSON-LD or H1 ──────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).text());
      const nodes = d["@graph"] ? d["@graph"] : [d];
      for (const n of (Array.isArray(nodes) ? nodes : [nodes])) {
        if (!n) continue;
        if (n["@type"] === "Vehicle" || n["@type"] === "Product") {
          if (!vessel.name && n.name) vessel.name = cleanHeadline(String(n.name));
          if (!vessel.builder && n.brand?.name) vessel.builder = clean(String(n.brand.name));
          const offers = n.offers || {};
          if (!vessel.price && offers.price) {
            const p = Number(offers.price);
            if (!isNaN(p) && p > 0) {
              const sym = offers.priceCurrency === "EUR" ? "€" : "$";
              vessel.price = `${sym}${p.toLocaleString("en-US")}`;
            }
          }
          // additionalProperty (usually empty on Burgess but check anyway)
          for (const prop of (n.additionalProperty || [])) {
            if (prop.name && prop.value) assignSpec(vessel, String(prop.name), String(prop.value));
          }
        }
      }
    } catch { /* skip */ }
  });

  if (!vessel.name) {
    vessel.name = cleanHeadline($("h1").first().text())
      .replace(/\s*[-–|]\s*(?:Burgess|Yachts?\s*for\s*Sale).*/i, "").trim();
  }

  // ── 2. Spec block — alternating label/value lines ────────────────────────
  // Burgess renders: <div>Beam</div><div>18.3m (60ft)</div> etc.
  // Extract all text, find spec section, pair lines.
  const rawText = $("body").text()
    .replace(/\t/g, " ").replace(/ {3,}/g, "  ")
    .replace(/&[a-z#0-9]+;/g, " ");

  // Known spec labels Burgess uses — used to identify spec section start
  // Trigger labels (core structural ones) vs all valid spec labels
  const TRIGGER_LABELS = /^(?:LOA|Beam|Draft|Gross\s+tonnage|Cruising\s+speed|Maximum\s+speed)$/i;
  const SPEC_LABELS = /^(?:LOA|Beam|Draft|Gross\s+tonnage|Cruising\s+speed|Maximum\s+speed|Range|Flag|Lying|Class|Exterior\s+designer|Interior\s+designer|Construction|Crew|Guests?|Cabins?|Engines?|Propulsion|Hull|Year|Refit|Builder|Tenders?|Stabiliz)$/i;

  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  let inSpec = false;
  let pairsFound = 0;
  const seenLabels = new Set<string>();
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i];
    const value = lines[i + 1];
    // Only enter spec mode on core structural trigger labels
    if (TRIGGER_LABELS.test(label)) inSpec = true;
    if (inSpec && SPEC_LABELS.test(label) && label.length < 60
        && value.length > 1 && value.length < 300
        && !(value.length <= 4 && /^\d+$/.test(value))) {
      // Stop if we've seen this label before — means we hit a duplicate section
      const lk = label.toLowerCase();
      if (seenLabels.has(lk)) break;
      seenLabels.add(lk);
      assignSpec(vessel, label, value);
      i++; // skip value line
      pairsFound++;
      if (pairsFound > 25) break;
    }
  }

  // ── 3. DOM spec fallbacks ─────────────────────────────────────────────────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── 4. Year from name/meta ────────────────────────────────────────────────
  if (!vessel.year) {
    const ogDesc = $('meta[property="og:description"]').attr("content") || "";
    const ym = (ogDesc + " " + rawText.slice(0, 5000)).match(/\b((?:19|20)\d{2})\s+(?:Motor|Sail|Explorer|Custom|built)/i)
      || ogDesc.match(/\b((?:19|20)\d{2})\b/);
    if (ym) vessel.year = parseInt(ym[1]);
  }

  // ── 5. Price from page text ───────────────────────────────────────────────
  if (!vessel.price) {
    const allPrices = [...rawText.matchAll(/\$([\d]{1,3}(?:,\d{3})+)/g)];
    for (const m of allPrices) {
      if (parseInt(m[1].replace(/,/g,"")) >= 1000000) {
        vessel.price = `$${m[1]}`; break;
      }
    }
  }

  // ── 6. Description ────────────────────────────────────────────────────────
  const JUNK = /privacy|cookie|newsletter|burgess|disclaimer|terms\s*of\s*use|all\s*rights/i;
  const descParts: string[] = [];
  $("p, .description p, .overview p, [class*='content'] p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 80 || JUNK.test(t)) return;
    if (!/yacht|vessel|engine|knot|deck|cabin|hull|guest|stateroom|charter|built|refit/i.test(t)) return;
    if (!descParts.includes(t)) descParts.push(t);
  });
  vessel.description = descParts.join("\n\n").slice(0, 6000)
    || clean($('meta[property="og:description"]').attr("content") || "");

  // ── 7. Images ─────────────────────────────────────────────────────────────
  const seenImgs = new Set<string>();
  const addImg = (src: string) => {
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (/logo|icon|flag|badge|placeholder|\.svg|avatar|staff|broker/i.test(src)) return;
    const key = src.split("?")[0];
    if (seenImgs.has(key)) return;
    seenImgs.add(key);
    vessel.images.push({ src, alt: vessel.name });
  };

  $("img").each((_, img) => {
    addImg($(img).attr("data-src") || "");
    addImg($(img).attr("data-lazy-src") || "");
    addImg($(img).attr("src") || "");
  });

  // Regex sweep for Burgess CDN URLs
  const cdnRe = /https?:\/\/(?:[a-z0-9-]+\.)?(?:burgessyachts\.com|imgix\.net|burgessyachtsmedia\.com)\/[^\s"'<>]+\.(?:jpe?g|png|webp)[^\s"'<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = cdnRe.exec(html)) !== null) addImg(m[0]);

  vessel.images = dedupeImages(vessel.images);

  // ── 8. Mine description ───────────────────────────────────────────────────
  if (vessel.description) mineFromText(vessel, vessel.description);

  return vessel;
}
