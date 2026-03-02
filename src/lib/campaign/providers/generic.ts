import * as cheerio from "cheerio";
import { CampaignDraft } from "../providers/denison";
import { stealthFetch } from "./stealthFetch";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Generic yacht listing scraper — works for BoatTrader, boats.com,
 * JamesEdition, YATCO, and any site with structured data or standard DOM.
 * Falls back to Puppeteer stealth when plain fetch is blocked (403).
 */
export async function scrapeGeneric(rawUrl: string): Promise<CampaignDraft> {
  const url = rawUrl.trim();
  let html: string;
  try {
    html = await fetchPage(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/403|forbidden|blocked/i.test(msg)) {
      console.log(`[generic] Plain fetch blocked for ${url}, falling back to Puppeteer stealth`);
      html = await stealthFetch(url);
    } else {
      throw err;
    }
  }
  return parseGeneric(url, html);
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseGeneric(url: string, html: string): CampaignDraft {
  const $ = cheerio.load(html);
  const draft: CampaignDraft = { gallery: [], specs: {} };
  draft.listingUrl = url;

  // --- JSON-LD ---
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        if (node.name && !draft.headline) draft.headline = String(node.name).trim();
        if (node.description && !draft.description) draft.description = String(node.description).trim();
        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : img?.url || img?.contentUrl;
            if (src && /^https?:\/\//i.test(String(src))) draft.gallery.push(String(src));
          }
        }
        const offers = node.offers || {};
        if (offers.price && !draft.price) {
          const p = offers.price;
          const c = offers.priceCurrency || "USD";
          draft.price = typeof p === "number"
            ? `${c === "EUR" ? "€" : "$"}${p.toLocaleString("en-US")}`
            : String(p);
        }
        const addr = offers.availableAtOrFrom?.address || node.address;
        if (addr && !draft.location) {
          const city = addr.addressLocality;
          const region = addr.addressRegion;
          if (city || region) draft.location = [city, region].filter(Boolean).join(", ");
        }
      }
    } catch { /* skip */ }
  });

  // --- OG meta fallbacks ---
  if (!draft.headline) draft.headline = clean($('meta[property="og:title"]').attr("content"));
  if (!draft.description) draft.description = clean($('meta[property="og:description"]').attr("content"));
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && /^https?:\/\//i.test(ogImg)) draft.gallery.unshift(ogImg);

  // --- DOM fallbacks ---
  if (!draft.headline) draft.headline = clean($("h1").first().text());
  if (!draft.price) {
    draft.price = clean($('[class*="price" i]').first().text()) ||
      clean($('[data-testid*="price"]').first().text());
  }
  if (!draft.location) {
    draft.location = clean($('[class*="location" i]').first().text());
  }

  if (!draft.description) {
    const desc = clean($("article p").first().text() || $("p").first().text());
    if (desc && desc.length > 30) {
      draft.description = desc.length > 600 ? desc.slice(0, 600).replace(/\s\S*$/, "…") : desc;
    }
  }

  // --- Specs ---
  const specMap: Record<string, keyof CampaignDraft["specs"]> = {
    "length": "loa", "loa": "loa", "overall": "loa",
    "beam": "beam", "draft": "draft", "year": "year",
    "builder": "builder", "make": "builder", "manufacturer": "builder",
    "model": "model", "stateroom": "staterooms", "cabin": "staterooms",
    "head": "heads", "bathroom": "heads",
    "engine": "engines", "power": "power", "horsepower": "power", "hp": "power",
  };

  const tryAssign = (label: string, value: string) => {
    const l = label.toLowerCase();
    const v = clean(value);
    if (!v) return;
    for (const [key, field] of Object.entries(specMap)) {
      if (l.includes(key)) { draft.specs[field] = draft.specs[field] || v; break; }
    }
  };

  $("dt").each((_, el) => tryAssign($(el).text(), $(el).next("dd").text()));
  $("th").each((_, el) => tryAssign($(el).text(), $(el).next("td").text()));
  $("tr").each((_, row) => {
    const cells = $(row).find("td,th");
    if (cells.length >= 2) tryAssign(cells.eq(0).text(), cells.eq(1).text());
  });
  $("li").each((_, el) => {
    const t = clean($(el).text());
    const m = t.match(/^([^:]+):\s*(.+)$/);
    if (m) tryAssign(m[1], m[2]);
  });

  // --- Features filtering ---
  const FEATURE_BLACKLIST = /^(english|español|français|italiano|deutsch|our\s*news|home|about|contact|menu|search|login|sign\s*in|privacy|terms|cookie|newsletter|subscribe|unsubscribe|back\s*to|view\s*all|show\s*more|read\s*more|see\s*all|close|share|print|save|compare|facebook|twitter|instagram|linkedin|youtube|pinterest)$/i;
  const isJunkFeature = (text: string): boolean => {
    if (!text || text.length < 4 || text.length > 200) return true;
    if (FEATURE_BLACKLIST.test(text.trim())) return true;
    if (!/\s/.test(text) && text.length < 15 && !/\d/.test(text)) return true;
    return false;
  };

  // --- Features ---
  const features: string[] = [];
  const featureHeader = $("h2,h3,h4").filter((_, el) => /feature|highlight|equipment/i.test($(el).text())).first();
  if (featureHeader.length) {
    featureHeader.nextUntil("h2,h3,h4").find("li").each((_, li) => {
      const t = clean($(li).text());
      if (!isJunkFeature(t)) features.push(t);
    });
  }
  if (features.length) draft.features = features.slice(0, 10);

  // --- Gallery cleanup ---
  if (!draft.gallery.length) {
    $("img[src]").each((_, img) => {
      const src = $(img).attr("src") || "";
      if (/^https?:\/\//i.test(src) && !/icon|logo|flag|avatar|sprite|pixel/i.test(src)) {
        const w = Number($(img).attr("width"));
        if (!w || w >= 300) draft.gallery.push(src);
      }
    });
  }
  // Dedupe
  draft.gallery = [...new Set(draft.gallery)];
  draft.heroUrl = draft.gallery[0];
  // Clean up headline
  draft.headline = stripListingSuffix(draft.headline);
  draft.subject = draft.headline;

  return draft;
}

function stripListingSuffix(s?: string): string | undefined {
  if (!s) return s;
  return s
    .replace(/\s*[-–|]\s*(Denison|YachtWorld|Yacht\s*World|Boat\s*Trader|boats\.com|YATCO|James\s*Edition|Boat\s*International).*$/i, "")
    .replace(/\s*[-–|]\s*(Yacht(s|ing)?\s*(Sales?|for\s*Sale)?).*$/i, "")
    .trim() || undefined;
}

function clean(s?: string | null): string {
  return (s || "").replace(/\s+/g, " ").trim();
}
