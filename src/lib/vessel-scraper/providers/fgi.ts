/**
 * FGI Yacht Group scraper
 * Handles: fgiyachtgroup.com/yachts-for-sale/[slug]
 *
 * Structure:
 *   - Spec label/value pairs in .yachts-specifications-label + .yachts-specifications-value
 *   - Rich description paragraphs in main content
 *   - Images via YATCO CDN (cloud.yatco.com) — prefer large_ over medium_
 *   - Also CloudFront hero image
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeFGI(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`FGI fetch failed: ${res.status}`);
  return parseFGI(url, await res.text());
}

function parseFGI(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name ──────────────────────────────────────────────────────────────
  vessel.name = cleanHeadline($('h1').first().text()) || cleanHeadline($('meta[property="og:title"]').attr('content')) || '';

  // ── 2. Spec label/value pairs (.yachts-specifications-label/value) ───────
  const labels = $('[class*="yachts-specifications-label"]');
  const values = $('[class*="yachts-specifications-value"]');
  labels.each((i, el) => {
    const label = clean($(el).text().replace(/<img[^>]*>/gi, '').replace(/\s+/g, ' '));
    const valEl = values.eq(i);
    const value = clean(valEl.text()).replace(/&#039;/g, "'");
    if (label && value) {
      // Map common FGI label names
      const l = label.toLowerCase();
      if (l.includes('askingprice') || l.includes('asking price') || l.includes('price')) {
        if (!vessel.price) vessel.price = value;
      } else if (l === 'length' || l.includes('length')) {
        if (!vessel.loa) vessel.loa = value;
      } else if (l === 'builder') {
        if (!vessel.builder) vessel.builder = value;
      } else if (l === 'built') {
        if (!vessel.year) {
          // "2010/2020" → year built, refit
          const ym = value.match(/\b(19|20)\d{2}\b/);
          if (ym) vessel.year = parseInt(ym[0]);
          if (/\//.test(value)) {
            const parts = value.split('/');
            if (parts[1]) (vessel as Record<string,unknown>).refitYear = parts[1].trim();
          }
        }
      } else {
        assignSpec(vessel, label, value);
      }
    }
  });

  // ── 3. Description — all content paragraphs ──────────────────────────────
  const JUNK = /request|brochure|layout|contact|form|cookie|privacy|click here|scroll down/i;
  const descParts: string[] = [];
  $('p').each((_, p) => {
    const t = clean($(p).text()).replace(/&#039;/g, "'");
    if (t.length > 100 && !JUNK.test(t) && /yacht|vessel|interior|engine|guest|deck|stateroom|suite|built/i.test(t))
      descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.join('\n\n').slice(0, 6000);

  // ── 4. Images — YATCO CDN large_ preferred, CloudFront hero ─────────────
  const imgSet = new Map<string, string>();
  const addImg = (src: string) => {
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (/logo|icon|svg|placeholder|price\.svg|length\.svg|builder\.svg|build\.svg/i.test(src)) return;
    // Prefer large_ over medium_ for YATCO images
    const key = src.replace(/\/(large|medium|small)_/, '/NORM/').split('?')[0];
    const existing = imgSet.get(key);
    // large_ beats medium_ beats others
    if (!existing || src.includes('/large_') || (!existing.includes('/large_') && src.includes('/medium_'))) {
      imgSet.set(key, src);
    }
  };
  $('img').each((_, el) => {
    addImg($(el).attr('data-src') || '');
    addImg($(el).attr('data-lazy-src') || '');
    addImg($(el).attr('src') || '');
  });
  // Regex sweep for YATCO and CloudFront images
  const re = /https?:\/\/(?:cloud\.yatco\.com|d1ijaqkr5345u2\.cloudfront\.net)\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) addImg(m[0]);

  const existingKeys = new Set(vessel.images.map(i => i.src.split('?')[0]));
  for (const [, src] of imgSet) {
    if (!/logo|icon|price\.svg|length\.svg|builder\.svg/i.test(src)) {
      const key = src.split('?')[0];
      if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
    }
  }
  vessel.images = dedupeImages(vessel.images);

  // ── 5. Features ──────────────────────────────────────────────────────────
  const feats: string[] = [];
  $('h2,h3,h4').filter((_, el) => /feature|highlight|amenities|key/i.test($(el).text()))
    .first().nextUntil('h2,h3,h4').find('li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 6 && t.length < 200) feats.push(t);
    });
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}
