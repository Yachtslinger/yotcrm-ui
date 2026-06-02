/**
 * YachtCharterFleet scraper  (yachtcharterfleet.com)
 *
 * CHARTER listing — sets vessel.isCharter = true. Like CharterWorld, vessel
 * specs are identical to a for-sale listing; this adds charter rate + areas.
 *
 * Structure:
 *   - schema.org/Vehicle JSON-LD: name, manufacturer (builder), model,
 *     productionDate (year) — the durable primary source (same pattern as
 *     YachtBuyer; survives CSS churn).
 *   - Spec table: <th/td>Length/Beam/Draft/GT/Cruising Speed/Built/Builder.
 *     Values can be doubled ("Perini Navi Perini Navi") — deduped here.
 *   - Rate: a seasonal rate card of "from $X p/week" rows. We summarise as
 *     low (cheapest) → high (most expensive) across the card.
 *   - Cruising areas: areaguide image alts ("Mediterranean", "Bermuda").
 *   - URL: /luxury-charter-yacht-{id}/{slug}.htm
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVesselFull } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapeYachtCharterFleet(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`YachtCharterFleet fetch failed: ${res.status}`);
  return parseYachtCharterFleet(url, await res.text());
}

export function parseYachtCharterFleet(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVesselFull(url);
  vessel.isCharter = true;

  const stripSuffix = (s: string) =>
    clean(s).replace(/\s*[-–|]?\s*yachts?\s+charter\b.*$/i, "")
            .replace(/\s*[-–|]?\s*charter\b.*$/i, "").trim();

  // ── 1. JSON-LD Vehicle (primary structured source) ────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed: unknown;
    try { parsed = JSON.parse($(el).text()); } catch { return; }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const root of arr) {
      const nodes = (root && typeof root === "object" && "@graph" in (root as Record<string, unknown>))
        ? (root as { "@graph": unknown[] })["@graph"]
        : [root];
      for (const n of nodes as Record<string, unknown>[]) {
        if (!n || typeof n !== "object" || n["@type"] !== "Vehicle") continue;
        if (!vessel.name && typeof n.name === "string") vessel.name = clean(n.name);
        if (!vessel.builder && typeof n.manufacturer === "string") vessel.builder = clean(n.manufacturer);
        if (!vessel.year && n.productionDate) {
          const y = String(n.productionDate).match(/\b(19|20)\d{2}\b/);
          if (y) vessel.year = parseInt(y[0]);
        }
        if (!vessel.grossTonnage && typeof n.weight === "string") vessel.grossTonnage = clean(n.weight);
      }
    }
  });
  if (!vessel.name) vessel.name = stripSuffix(cleanHeadline($("h1").first().text()) || clean($("title").text()));

  // ── 2. Spec table — dedupe doubled values ("Perini Navi Perini Navi") ─────
  const dedupeDouble = (v: string) => {
    const t = clean(v);
    const half = Math.floor(t.length / 2);
    if (t.length % 2 === 0 && t.slice(0, half).trim() === t.slice(half).trim()) return t.slice(0, half).trim();
    const words = t.split(/\s+/);
    if (words.length % 2 === 0 && words.slice(0, words.length / 2).join(" ") === words.slice(words.length / 2).join(" "))
      return words.slice(0, words.length / 2).join(" ");
    return t;
  };
  $("tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length < 2) return;
    const label = clean($(cells[0]).text()).replace(/:$/, "");
    const value = dedupeDouble($(cells[1]).text());
    if (label && value && label.length < 26) assignSpec(vessel, label, value);
  });

  // ── 3. Charter rate — seasonal card of "from $X p/week"; summarise lo→hi ──
  const amounts: { raw: string; n: number; cur: string }[] = [];
  const re = /from\s*((?:US)?(?:€|\$|£))\s?([\d,]{4,})\s*(?:p\/?w|per week|\/week|\/wk)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    amounts.push({ raw: m[0], n: parseInt(m[2].replace(/,/g, "")), cur: /€/.test(m[1]) ? "EUR" : /£/.test(m[1]) ? "GBP" : "USD" });
  }
  if (amounts.length) {
    amounts.sort((a, b) => a.n - b.n);
    const lo = amounts[0], hi = amounts[amounts.length - 1];
    vessel.charterCurrency = lo.cur;
    const sym = lo.cur === "EUR" ? "€" : lo.cur === "GBP" ? "£" : "$";
    vessel.charterRateLow = String(lo.n);
    vessel.charterRateHigh = String(hi.n);
    vessel.charterRate = lo.n === hi.n
      ? `From ${sym}${lo.n.toLocaleString()} p/week`
      : `${sym}${lo.n.toLocaleString()} – ${sym}${hi.n.toLocaleString()} p/week`;
  }

  // ── 4. Cruising areas — areaguide image alts ──────────────────────────────
  const areas = new Set<string>();
  $('img[alt*="Cruising"], img[src*="areaguide"]').each((_, el) => {
    const alt = clean($(el).attr("alt") || "");
    const name = alt.replace(/\s*(summer|winter)?\s*cruising.*$/i, "").trim();
    if (name && name.length < 30) areas.add(name);
  });
  if (areas.size) vessel.charterAreas = [...areas].slice(0, 6).join(", ");

  // ── 5. Description ────────────────────────────────────────────────────────
  const JUNK = /privacy|cookie|newsletter|sign in|enquir|rate card|©|all rights reserved/i;
  const KEEP = /\b(yacht|charter|guest|cabin|build|motor|sail|deck|crew|interior|tender|cruis|design|launched|refit|accommodat)\b/i;
  const paras: string[] = [];
  $("p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 60 || JUNK.test(t) || !KEEP.test(t)) return;
    if (!paras.includes(t)) paras.push(t);
  });
  if (paras.length) vessel.description = paras.join("\n\n").slice(0, 6000);

  // ── 6. Images — YCF CDN gallery ───────────────────────────────────────────
  const imgs: { src: string; alt: string }[] = [];
  const reImg = /https:\/\/image\.yachtcharterfleet\.com\/[^\s"')]+\.(?:jpe?g|png|webp)/gi;
  let im: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((im = reImg.exec(html)) !== null) {
    const src = im[0];
    if (/areaguide|logo|icon|sprite|flag/i.test(src)) continue;
    const key = (src.match(/\/k[0-9a-f]+\/[^/]+\/photo\/(\d+)/i) || [src, src])[1];
    if (seen.has(key)) continue;
    seen.add(key);
    imgs.push({ src, alt: vessel.name });
  }
  vessel.images = dedupeImages(imgs);

  return vessel;
}
