/**
 * CharterWorld scraper  (charterworld.com)
 *
 * CHARTER listing — sets vessel.isCharter = true and populates charter rate
 * fields. Vessel specs are identical to a for-sale listing (LOA, builder,
 * beam, etc.), so this carries the same 9/12 vessel coverage the generic
 * fallback already produced, plus the charter-specific pricing.
 *
 * Structure:
 *   - Specs: <table><tr><td>Label:</td><td>value</td></tr> (Type/Year, Beam,
 *     L.O.A., Crew, Guests, Max Speed, Cabins, Engines, Cruise Speed,
 *     Builder/Designer).
 *   - Name: <h1> / <title> ("INCEPTION Yacht Charter Details, Heesen | ...").
 *   - Rate: two <div class="rates"> — EUR and US$ — each a low–high /wk range.
 *   - No vessel-level JSON-LD (only site Organization/WebPage).
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVesselFull } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeCharterWorld(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`CharterWorld fetch failed: ${res.status}`);
  return parseCharterWorld(url, await res.text());
}

export function parseCharterWorld(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVesselFull(url);
  vessel.isCharter = true;

  // ── Name — h1 up to the first "Heesen"/builder or "| From" rate tail ──────
  let rawName = cleanHeadline($("h1").first().text()) || clean($("title").text());
  rawName = rawName.split("|")[0].split(/\bYacht Charter\b/i)[0];
  // h1 is "INCEPTION  Heesen" — keep the leading all-caps token(s) as the name
  const nameM = rawName.match(/^[\s]*([A-Z0-9][A-Z0-9'’\- ]+?)(?:\s{2,}|\s+[A-Z][a-z])/);
  vessel.name = (nameM ? nameM[1] : rawName).trim();

  // ── Specs — rows are <th>Label:</th><td>value</td> (itemprop name/value) ──
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    let label = clean($tr.find('th [itemprop="name"], th').first().text()).replace(/:$/, "").trim();
    // assignSpec only strips trailing punctuation, so dotted abbreviations like
    // "L.O.A." don't match its "loa" pattern — collapse internal dots here.
    label = label.replace(/\bL\.?O\.?A\.?\b/i, "LOA").replace(/\bL\.W\.L\.?\b/i, "LWL");
    const value = clean($tr.find('td [itemprop="value"], td').first().text());
    if (!label || !value || label.length > 28) return;
    if (/type\/year/i.test(label)) {
      // "Heesen /2008" → builder + year
      const ym = value.match(/\b(19|20)\d{2}\b/);
      if (ym && !vessel.year) vessel.year = parseInt(ym[0]);
      const b = value.split("/")[0].trim();
      if (b && !vessel.builder) vessel.builder = b;
    } else if (/builder\/designer/i.test(label)) {
      // "Mark Wallace, Heesen" → take the last comma part (the yard)
      if (!vessel.builder) vessel.builder = value.split(",").pop()!.trim() || value;
    } else {
      assignSpec(vessel, label, value);
    }
  });

  // ── Charter rate — two <div class="rates"> (EUR + US$), each low-high /wk ──
  const rates: string[] = [];
  $(".rates").each((_, el) => { const t = clean($(el).text()); if (t) rates.push(t); });
  setCharterRate(vessel, rates);

  // ── Cruising areas — only from destination image paths, not gallery alts ──
  // CharterWorld embeds destinations in image URLs (/user/Image/Destinations/
  // {Name}/...). Gallery alts are vessel photo captions ("Aft: Yacht X's
  // Cruising Image"), NOT regions, so we deliberately ignore them here.
  const areas = new Set<string>();
  for (const m of html.matchAll(/\/Destinations\/([A-Za-z][A-Za-z0-9%\- ]{1,30}?)\//g)) {
    const name = decodeURIComponent(m[1]).replace(/%20/g, " ").trim();
    if (name && !/image|photo|thumb/i.test(name)) areas.add(name);
  }
  if (areas.size) vessel.charterAreas = [...areas].slice(0, 6).join(", ");

  // ── Description — listing prose ───────────────────────────────────────────
  const JUNK = /privacy|cookie|newsletter|sign in|enquir|©|all rights reserved/i;
  const KEEP = /\b(yacht|charter|guest|cabin|build|motor|sail|deck|crew|interior|tender|cruis|design|launched|refit)\b/i;
  const paras: string[] = [];
  $("p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 60 || JUNK.test(t) || !KEEP.test(t)) return;
    if (!paras.includes(t)) paras.push(t);
  });
  if (paras.length) vessel.description = paras.join("\n\n").slice(0, 6000);

  // ── Images — lazy-loaded gallery (data-src), vessel photos only ───────────
  const imgs: { src: string; alt: string }[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("data-src") || $(el).attr("src") || "";
    if (/^https?:/i.test(src) && /charterworld\.com\/images\/\d+\/yachts/i.test(src)
        && !/^data:/.test(src) && !/Destinations/i.test(src)) {
      imgs.push({ src, alt: vessel.name });
    }
  });
  vessel.images = dedupeImages(imgs);

  return vessel;
}

/**
 * Parse one or more published rate strings into the charter rate fields.
 * Prefers a EUR string if present, then falls back to the first.
 * Handles "EUR€ 250,000 - 280,000/wk" (range) and single values.
 */
function setCharterRate(vessel: VesselData, rates: string[]): void {
  if (!rates.length) return;
  const eur = rates.find(r => /eur|€/i.test(r));
  const primary = (eur || rates[0]).replace(/\s+/g, " ").trim();
  vessel.charterRate = primary;
  if (/eur|€/i.test(primary)) vessel.charterCurrency = "EUR";
  else if (/usd|us\$|\$/i.test(primary)) vessel.charterCurrency = "USD";
  else if (/gbp|£/i.test(primary)) vessel.charterCurrency = "GBP";
  // Only treat groups that look like money (>=4 digits, optionally grouped with
  // commas) as rate figures — guards against currency-entity digit noise.
  const nums = (primary.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g) || []).map(s => s.replace(/,/g, ""));
  if (nums.length >= 2) {
    vessel.charterRateLow = nums[0];
    vessel.charterRateHigh = nums[1];
  } else if (nums.length === 1) {
    vessel.charterRateLow = nums[0];
  }
}
