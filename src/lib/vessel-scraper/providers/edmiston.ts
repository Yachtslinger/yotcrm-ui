/**
 * Edmiston.com vessel scraper
 * Handles: edmiston.com/[id]/[slug]-yacht-for-sale/
 *
 * Structure:
 *   - JSON-LD @graph containing Product with additionalProperty specs
 *   - Rich description paragraphs in main content
 *   - Images from origin.edmiston.com/lib/image/[hash]/[filename]
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

export async function scrapeEdmiston(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Edmiston fetch failed: ${res.status}`);
  return parseEdmiston(url, await res.text());
}

function parseEdmiston(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. JSON-LD Product in @graph ────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).text());
      const nodes = d['@graph'] ? d['@graph'] : [d];
      for (const node of nodes) {
        if (node['@type'] !== 'Product') continue;
        vessel.name = vessel.name || cleanHeadline(String(node.name || '')) || '';
        vessel.builder = vessel.builder || clean(String(node.brand?.name || ''));
        // Description from JSON-LD (short) — we'll overwrite with full body text below
        const ldDesc = clean(String(node.description || ''));
        if (ldDesc.length > 40 && !vessel.description) vessel.description = ldDesc;
        // Hero image
        const img = node.image ? String(node.image).replace(/&amp;/g,'&').split('?')[0] : '';
        if (img && /^https?:\/\//i.test(img)) vessel.images.push({ src: img, alt: vessel.name });
        // additionalProperty specs
        for (const p of (node.additionalProperty || [])) {
          if (p.name && p.value) {
            const label = String(p.name).trim();
            const value = String(p.value).trim();
            // Map Edmiston's specific field names
            const l = label.toLowerCase();
            if (l === 'length') { if (!vessel.loa) vessel.loa = `${value}m`; }
            else if (l === 'beam') { if (!vessel.beam) vessel.beam = `${value}m`; }
            else if (l === 'draft') { if (!vessel.draft) vessel.draft = `${value}m`; }
            else if (l === 'gross tonnage') { if (!vessel.grossTonnage) vessel.grossTonnage = value; }
            else if (l === 'cruising speed') { if (!vessel.cruiseSpeed) vessel.cruiseSpeed = `${value} kn`; }
            else if (l === 'built') { if (!vessel.year) vessel.year = parseInt(value); }
            else if (l === 'exterior designer' || l === 'exterior design') { if (!vessel.exteriorDesign) vessel.exteriorDesign = value; }
            else if (l === 'interior design' || l === 'interior designer') { if (!vessel.interiorDesign) vessel.interiorDesign = value; }
            else if (l === 'hull material') { if (!vessel.hullMaterial) vessel.hullMaterial = value; }
            else if (l === 'superstructure material') { if (!vessel.superstructure) vessel.superstructure = value; }
            else if (l === 'deck material') { if (!(vessel as Record<string,unknown>).deckMaterial) (vessel as Record<string,unknown>).deckMaterial = value; }
            else { assignSpec(vessel, label, value); }
          }
        }
        // Price from description text "€195,000,000 EUR"
        if (!vessel.price && node.description) {
          const pm = String(node.description).match(/([€$£][\d,]+(?:,000)?)\s*(?:EUR|USD|GBP)?/);
          if (pm) vessel.price = pm[1];
        }
      }
    } catch { /* skip */ }
  });

  // ── 2. Name fallback ────────────────────────────────────────────────────
  if (!vessel.name)
    vessel.name = cleanHeadline($('h1').first().text().replace(/yacht for sale/i,'').trim()) || '';

  // ── 3. Full description — all body paragraphs ────────────────────────────
  const JUNK = /privacy|cookie|contact|enquire|speak to|request|charter management|sell a yacht|build a yacht|yacht management|search edmiston/i;
  const descParts: string[] = [];
  $('p').each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 100 && !JUNK.test(t) &&
        /yacht|vessel|built|engine|guest|deck|interior|exterior|range|speed|hull|design|suite|accommodation/i.test(t))
      descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.join('\n\n').slice(0, 6000);

  // ── 4. Features / key highlights ─────────────────────────────────────────
  const feats: string[] = [];
  $('h2,h3,h4').filter((_, el) => /feature|highlight|key|award/i.test($(el).text()))
    .first().nextUntil('h2,h3,h4').find('li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 8 && t.length < 200) feats.push(t);
    });
  // Also try bullet-style paragraphs in key features section
  if (!feats.length) {
    $('li').each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 20 && t.length < 200 && /\b(yacht|pool|suite|deck|engine|beam|nm|knot|GT|award)\b/i.test(t))
        feats.push(t);
    });
  }
  vessel.features = [...new Set(feats)].slice(0, 20);

  // ── 5. Images — origin.edmiston.com/lib/image/[hash]/[filename] ──────────
  const imgSet = new Map<string, string>();
  const addImg = (src: string) => {
    if (!src || !/origin\.edmiston\.com/i.test(src)) return;
    if (/logo|icon|svg|placeholder|thumbnail/i.test(src)) return;
    // Clean up escaped slashes and optimole CDN wrappers
    const decoded = src.replace(/\\\//g,'/').replace(/&amp;/g,'&');
    // Strip query params — Edmiston images are clean without them
    const clean_src = decoded.split('?')[0];
    if (!imgSet.has(clean_src)) imgSet.set(clean_src, clean_src);
  };
  $('img').each((_, el) => {
    addImg($(el).attr('data-src') || '');
    addImg($(el).attr('src') || '');
  });
  // Regex sweep for any escaped origin.edmiston.com URLs in the raw HTML
  const re = /https?:\\?\/\\?\/origin\.edmiston\.com\\?\/lib\\?\/image\\?\/[^\s"'<>\\]+\.(?:jpg|jpeg|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) addImg(m[0].replace(/\\/g,''));

  const existingKeys = new Set(vessel.images.map(i => i.src.split('?')[0]));
  for (const [key, src] of imgSet) {
    if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
  }
  vessel.images = dedupeImages(vessel.images).filter(i =>
    !/logo|icon|placeholder|thumbnail|staff|broker/i.test(i.src)
  );

  return vessel;
}
