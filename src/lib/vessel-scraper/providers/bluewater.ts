/**
 * Bluewater Yachting scraper
 * Handles: bluewateryachting.com  (for-sale listings)
 *
 * Why dedicated (generic fallback only reached 6/12):
 *   - NO JSON-LD and NO canonical on the page, so the generic JSON-LD path
 *     (name/builder/price/year/images) gets nothing.
 *   - Builder lives ONLY in the <title>:
 *       "NAME <type>yacht for Sale - BUILDER Luxury Yacht"
 *   - Asking price is in <div class="yachtprice"> (a styled box, not a
 *     label/value row and not JSON-LD), so generic price logic walks past it.
 *   - The gallery is served as CSS background-image via Cloudinary fetch URLs,
 *     so the generic <img src>/data-src collector never sees the photos.
 *   - Specs live in a .yachtSPEC summary box (.label/.result) plus a detailed
 *     "<li>Label: value</li>" sheet — fed through assignSpec/SPEC_MAP.
 *
 * The shared post-processing in scrapeVessel() (text-mining + AI fill +
 * watermark filter) still runs after this returns, so it backstops any spec
 * this provider doesn't set structurally.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeBluewater(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Bluewater fetch failed: ${res.status}`);
  return parseBluewater(url, await res.text());
}

export function parseBluewater(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name + builder from <title> / og:title ────────────────────────────
  // "LOON Megayacht for Sale - Icon Yachts Luxury Yacht" -> name=LOON, builder=Icon Yachts
  const rawTitle = clean($('meta[property="og:title"]').attr("content")) || clean($("title").text());
  const tm = rawTitle.match(/^(.*?)\s+\S*yacht\s+for\s+sale\s*[-–|]\s*(.*?)\s+luxury\s+yacht\s*$/i);
  if (tm) {
    vessel.name = cleanHeadline(tm[1]) || tm[1].trim();
    vessel.builder = tm[2].trim();
  } else {
    vessel.name = cleanHeadline(rawTitle) || cleanHeadline($("h1").first().text()) || "";
  }

  // ── 2. Asking price — first non-empty .yachtprice box ────────────────────
  // (the page renders desktop + mobile variants; some are display:none/empty)
  $(".yachtprice").each((_, el) => {
    if (vessel.price) return;
    const t = clean($(el).text());
    if (/\d/.test(t)) vessel.price = t;
  });

  // ── 3. Specs — .yachtSPEC summary box (parsed first so clean values win) ──
  $(".yachtSPEC").each((_, el) => {
    const label = clean($(el).find(".label").first().text());
    const value = clean($(el).find(".result").first().text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // ── 4. Specs — detailed "<li>Label: value</li>" sheet ────────────────────
  // assignSpec is first-wins + SPEC_MAP-gated, so unrecognised rows (e.g.
  // acoustic "dB(a)" readings) are silently ignored and clean .yachtSPEC
  // values set in step 3 are preserved.
  $("li").each((_, el) => {
    const t = clean($(el).text());
    const ci = t.indexOf(":");
    if (ci < 1 || ci > 48 || t.length > 140) return;
    if (/https?:|sign in|menu|©/i.test(t)) return;
    const label = t.slice(0, ci).trim();
    const value = t.slice(ci + 1).trim();
    if (label && value) assignSpec(vessel, label, value);
  });

  // ── 5. Description — listing body paragraphs ─────────────────────────────
  const JUNK = /privacy|cookie|newsletter|sign in|contact a broker|terms of use|all rights reserved|©/i;
  const KEEP = /\b(yacht|vessel|built|motor|sail|feet|meter|knot|cabin|stateroom|design|hull|engine|speed|range|deck|suite|guest|owner|tender|interior|saloon)\b/i;
  const paras: string[] = [];
  $("p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 60 || JUNK.test(t) || !KEEP.test(t)) return;
    if (!paras.includes(t)) paras.push(t);
  });
  if (paras.length) vessel.description = paras.join("\n\n").slice(0, 6000);

  // ── 6. Images — Cloudinary full-res + direct _uploads, dedupe by photo hash.
  // Gallery photos are CSS background-image (Cloudinary fetch) URLs that wrap
  // a /_uploads/website/brokerage/yachts/{size|original}/{hash}.jpg source.
  // Key by the hash so the same photo at different sizes collapses to one,
  // preferring the Cloudinary full-res rendition.
  const byHash = new Map<string, string>();
  const consider = (src: string) => {
    if (!src) return;
    const hm = src.match(/_uploads\/website\/brokerage\/yachts\/(?:\d+|original)\/([0-9a-f]{12,})/i);
    if (!hm) return;
    const hash = hm[1].toLowerCase();
    const isCloud = /res\.cloudinary\.com/i.test(src);
    const prev = byHash.get(hash);
    if (!prev || (isCloud && !/res\.cloudinary\.com/i.test(prev))) byHash.set(hash, src);
  };
  let m: RegExpExecArray | null;
  const reCloud = /https:\/\/res\.cloudinary\.com\/bluewater\/image\/fetch\/[^\s"')]+/gi;
  while ((m = reCloud.exec(html)) !== null) consider(m[0]);
  const reDirect = /https:\/\/www\.bluewateryachting\.com\/_uploads\/website\/brokerage\/yachts\/(?:\d+|original)\/[0-9a-f]{12,}\.(?:jpe?g|png|webp)/gi;
  while ((m = reDirect.exec(html)) !== null) consider(m[0]);
  $("img").each((_, el) => consider($(el).attr("data-src") || $(el).attr("src") || ""));

  for (const src of byHash.values()) vessel.images.push({ src, alt: vessel.name });
  vessel.images = dedupeImages(vessel.images).filter(i => !/logo|icon|sprite|flag|\.svg/i.test(i.src));

  return vessel;
}
