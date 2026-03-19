/**
 * IYC.com vessel scraper
 * Handles: iyc.com/yachts/[slug]
 *
 * Structure:
 *   - JSON-LD type "Vehicle" with additionalProperty specs, price, manufacturer
 *   - Rich description in .rich-text p tags
 *   - Images from iycstorage.s3.amazonaws.com (prefer full-res, skip CDN resized)
 *   - No watermarks
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeIYC(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`IYC fetch failed: ${res.status}`);
  return parseIYC(url, await res.text());
}

function parseIYC(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. JSON-LD Vehicle ──────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).text().replace(/\\\//g, '/'));
      if (d['@type'] !== 'Vehicle') return;
      vessel.name = vessel.name || cleanHeadline(String(d.name || '').replace(/Yacht for Sale.*$/i, '').replace(/ - IYC$/i, '').trim()) || '';
      vessel.builder = vessel.builder || clean(String(d.manufacturer || d.brand?.name || ''));
      vessel.hullMaterial = vessel.hullMaterial || clean(String(d.material || ''));
      vessel.superstructure = vessel.superstructure || clean(String(d.bodyStyle || ''));
      if (!vessel.year && d.productionDate) vessel.year = parseInt(String(d.productionDate));
      // LOA from size field "221'5/67.5m"
      if (!vessel.loa && d.size) {
        const m = String(d.size).match(/([\d.'\/]+)\s*\/\s*([\d.]+m)/);
        if (m) vessel.loa = `${m[2]} (${m[1]})`;
        else vessel.loa = clean(String(d.size));
      }
      // Price
      const offers = d.offers || {};
      if (offers.price && !vessel.price) {
        const sym = (offers.priceCurrency === 'EUR') ? '€' : '$';
        vessel.price = `${sym}${Number(offers.price).toLocaleString('en-US')}`;
      }
      // additionalProperty specs
      for (const p of (d.additionalProperty || [])) {
        if (p.name && p.value) assignSpec(vessel, String(p.name), String(p.value));
      }
      // Hero image
      if (d.image) vessel.images.push({ src: String(d.image), alt: vessel.name });
    } catch { /* skip */ }
  });

  // ── 2. Name fallback ────────────────────────────────────────────────────
  if (!vessel.name) vessel.name = cleanHeadline($('h1').first().text().replace(/Yacht for Sale.*$/i,'').trim()) || '';

  // ── 3. Description — collect all .rich-text paragraphs ────────────────
  const JUNK = /privacy|cookie|contact|email us|call us|click here|inquire|form/i;
  const descParts: string[] = [];
  $('.rich-text p, .yacht-description p, .content-description p').each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 60 && !JUNK.test(t)) descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.join('\n\n').slice(0, 6000);

  // Fallback: body paragraphs
  if (!vessel.description) {
    $('p').each((_, p) => {
      if (vessel.description) return;
      const t = clean($(p).text());
      if (t.length > 100 && /yacht|vessel|built|engine|knot|deck|interior/i.test(t) && !JUNK.test(t))
        vessel.description = t;
    });
  }

  // ── 4. Images — prefer S3 full-res, skip imageboss.me CDN resized ──────
  const imgSet = new Map<string, string>();
  const addImg = (src: string) => {
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (/logo|icon|svg|placeholder|staff|broker/i.test(src)) return;
    // Skip imageboss CDN resized versions — keep only S3 originals
    if (/imageboss\.me/i.test(src)) return;
    const key = src.split('?')[0];
    if (!imgSet.has(key)) imgSet.set(key, src);
  };
  $('img').each((_, el) => {
    addImg($(el).attr('data-src') || '');
    addImg($(el).attr('src') || '');
  });
  // Regex sweep for S3 originals
  const s3Re = /https:\/\/iycstorage\.s3\.amazonaws\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = s3Re.exec(html)) !== null) addImg(m[0]);

  const existingKeys = new Set(vessel.images.map(i => i.src.split('?')[0]));
  for (const [key, src] of imgSet) {
    if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
  }
  vessel.images = dedupeImages(vessel.images);

  // ── 5. Features ─────────────────────────────────────────────────────────
  const feats: string[] = [];
  $('h2,h3,h4').filter((_, el) => /feature|highlight|key/i.test($(el).text()))
    .first().nextUntil('h2,h3,h4').find('li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 8 && t.length < 200) feats.push(t);
    });
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}
