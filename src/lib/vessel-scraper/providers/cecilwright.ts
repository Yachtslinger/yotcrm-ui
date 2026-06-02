/**
 * Cecil Wright scraper
 * Handles: cecilwright.com/sales/[slug]
 *
 * Why dedicated (generic fallback only reached 7/12):
 *   - Price lives in <section class="boat-price"> .boat-price__price under a
 *     "Purchase For" label (not "Price"/"Asking"), so generic price logic
 *     never matches it.
 *   - Gallery photos are on S3 (cecilwright-craft/store/_large|_thumbnail/...)
 *     and are not in plain <img src>, so the generic collector returns 0.
 *   - Specs are in .spec-grid__item (.spec-title + p.spec); replicated here so
 *     the provider is self-contained (the shared assignSpec/SPEC_MAP maps them).
 *   - Beam and draft are NOT published on the page — nothing to extract there;
 *     keyspecs is naturally capped by what the listing exposes.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeCecilWright(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Cecil Wright fetch failed: ${res.status}`);
  return parseCecilWright(url, await res.text());
}

export function parseCecilWright(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name — <h1>, else last "|" segment of <title> ─────────────────────
  vessel.name = cleanHeadline($("h1").first().text())
    || (clean($("title").text()).split("|").pop() || "").trim();

  // ── 2. Specs — .spec-grid__item (.spec-title + p.spec) ───────────────────
  $(".spec-grid__item").each((_, el) => {
    const label = clean($(el).find(".spec-title").first().text());
    const value = clean($(el).find("p.spec, .spec").first().text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // ── 3. Price — .boat-price__price (rendered under a "Purchase For" label) ─
  const price = clean($(".boat-price__price").first().text());
  if (price && /\d/.test(price)) vessel.price = price;

  // ── 4. Description — body paragraphs ─────────────────────────────────────
  const JUNK = /^menu|privacy|cookie|newsletter|sign in|subscribe|terms of|all rights reserved|©/i;
  const KEEP = /\b(yacht|vessel|built|motor|sail|feet|meter|metre|knot|cabin|stateroom|design|hull|engine|speed|range|deck|suite|guest|owner|tender|interior|saloon)\b/i;
  const paras: string[] = [];
  $("p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length < 60 || JUNK.test(t) || !KEEP.test(t)) return;
    if (!paras.includes(t)) paras.push(t);
  });
  if (paras.length) vessel.description = paras.join("\n\n").slice(0, 6000);

  // ── 5. Images — S3 gallery, prefer _large over _thumbnail, dedupe by file ─
  const byName = new Map<string, string>();
  const reS3 = /https:\/\/s3\.eu-west-2\.amazonaws\.com\/cecilwright-craft\/store\/_(?:large|thumbnail)\/[^\s"'<>]+\.(?:jpe?g|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = reS3.exec(html)) !== null) {
    const src = m[0];
    const fn = src.slice(src.lastIndexOf("/") + 1);
    const prev = byName.get(fn);
    if (!prev || /\/_large\//i.test(src)) byName.set(fn, src);
  }
  for (const src of byName.values()) vessel.images.push({ src, alt: vessel.name });

  return vessel;
}
