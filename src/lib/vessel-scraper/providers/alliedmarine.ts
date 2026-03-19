/**
 * Allied Marine scraper
 * Handles: alliedmarine.com/used-yachts-for-sale/[slug]
 *
 * Structure:
 *   - Boats Group CMS — same CDN as Denison (images.boatsgroup.com)
 *   - Price and location in meta description
 *   - Rich body paragraphs in main content
 *   - No JSON-LD Product — parse OG meta + body text
 *   - Images: images.boatsgroup.com/images/[path]_XLARGE.jpg (full res)
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};

export async function scrapeAlliedMarine(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Allied Marine fetch failed: ${res.status}`);
  return parseAlliedMarine(url, await res.text());
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder|language-flag|Arrow/i.test(src);
}

function parseAlliedMarine(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Name from H1 ──────────────────────────────────────────────────────
  vessel.name = cleanHeadline($('h1').first().text()) ||
    cleanHeadline($('meta[property="og:title"]').attr('content')) || '';

  // ── 2. Price + location from meta description ────────────────────────────
  // "Palmer Johnson 123 Motor Yacht for sale • 2006 • 123 ft • Palm Beach, FL, US • Asking $4,995,000"
  const metaDesc = $('meta[name="description"], meta[property="og:description"]').first().attr('content') || '';
  if (!vessel.price) {
    const pm = metaDesc.match(/Asking\s+([€$£][\d,]+)/i);
    if (pm) vessel.price = pm[1];
  }
  if (!vessel.location) {
    const lm = metaDesc.match(/•\s*([^•]+,\s*[A-Z]{2}(?:,\s*[A-Z]{2})?)\s*•/);
    if (lm) vessel.location = lm[1].trim();
  }
  if (!vessel.year) {
    const ym = metaDesc.match(/•\s*((?:19|20)\d{2})\s*•/);
    if (ym) vessel.year = parseInt(ym[1]);
  }
  if (!vessel.loa) {
    const lm = metaDesc.match(/•\s*([\d.]+\s*ft)\s*•/i);
    if (lm) vessel.loa = lm[1];
  }

  // ── 3. JSON-LD — Boats Group embeds Vehicle or Product ──────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).text());
      const nodes = d['@graph'] ? d['@graph'] : Array.isArray(d) ? d : [d];
      for (const node of nodes) {
        if (!/Vehicle|Product|Boat/i.test(String(node['@type'] || ''))) continue;
        if (!vessel.builder && node.brand?.name) vessel.builder = clean(String(node.brand.name));
        if (!vessel.builder && node.manufacturer?.name) vessel.builder = clean(String(node.manufacturer.name));
        if (!vessel.year && node.productionDate) vessel.year = parseInt(String(node.productionDate));
        const offers = node.offers || {};
        if (!vessel.price && offers.price) {
          const sym = offers.priceCurrency === 'EUR' ? '€' : '$';
          vessel.price = `${sym}${Number(offers.price).toLocaleString('en-US')}`;
        }
        for (const p of (node.additionalProperty || [])) {
          if (p.name && p.value) assignSpec(vessel, String(p.name), String(p.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── 4. Dom specs — dt/dd and table ───────────────────────────────────────
  $('dt').each((_, el) => assignSpec(vessel, $(el).text(), $(el).next('dd').text()));
  $('table tr').each((_, row) => {
    const cells = $(row).find('th, td');
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── 5. Full description — rich body paragraphs ───────────────────────────
  const JUNK = /privacy|cookie|contact|inquire|disclaimer|offered subject|cannot guarantee|broker|allied marine group/i;
  const descParts: string[] = [];
  $('p').each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 100 && !JUNK.test(t) &&
        /yacht|vessel|engine|guest|deck|interior|stateroom|suite|hull|galley|salon|flybridge|helm/i.test(t))
      descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.join('\n\n').slice(0, 6000);

  // ── 6. Features ──────────────────────────────────────────────────────────
  const feats: string[] = [];
  $('h2,h3,h4').filter((_, el) => /feature|highlight|key|equipment/i.test($(el).text()))
    .first().nextUntil('h2,h3,h4').find('li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 6 && t.length < 200) feats.push(t);
    });
  vessel.features = [...new Set(feats)].slice(0, 20);

  // ── 7. Images — Boats Group CDN (same as Denison) ────────────────────────
  // Allied wraps boatsgroup URLs through their own CDN: alliedmarine.p7img.io
  // Pull the inner boatsgroup URL which is the clean full-res source
  const imgSet = new Map<string, string>();
  const addImg = (raw: string) => {
    if (!raw) return;
    const decoded = raw.replace(/&amp;/g, '&');
    // Unwrap Allied's CDN proxy to get the boatsgroup source URL
    const bgMatch = decoded.match(/https?:\/\/images\.boatsgroup\.com\/[^\s"'<>&)]+/i);
    const src = bgMatch ? bgMatch[0] : decoded;
    if (!src || !/boatsgroup\.com/i.test(src)) return;
    if (isJunk(src)) return;
    // Prefer _XLARGE over other sizes
    const key = src.replace(/_XLARGE|_LARGE|_MEDIUM|_SMALL/i, '_NORM').split('?')[0];
    const existing = imgSet.get(key);
    if (!existing || src.includes('_XLARGE') || (!existing.includes('_XLARGE') && src.includes('_LARGE')))
      imgSet.set(key, src);
  };
  $('img').each((_, el) => {
    addImg($(el).attr('data-src') || '');
    addImg($(el).attr('data-lazy-src') || '');
    addImg($(el).attr('src') || '');
  });
  // Regex sweep — catches both direct boatsgroup and proxied URLs
  const re = /https?:\/\/(?:alliedmarine\.p7img\.io[^\s"'<>]*https?:\/\/)?images\.boatsgroup\.com\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)[^\s"'<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) addImg(m[0]);

  const existingKeys = new Set(vessel.images.map(i => i.src.split('?')[0]));
  for (const [, src] of imgSet) {
    const key = src.split('?')[0];
    if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
  }
  vessel.images = dedupeImages(vessel.images).filter(i => !isJunk(i.src));

  return vessel;
}
