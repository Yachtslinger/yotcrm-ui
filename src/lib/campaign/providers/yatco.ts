import * as cheerio from "cheerio";
import { CampaignDraft } from "../providers/denison";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;

export async function scrapeYatco(rawUrl: string): Promise<CampaignDraft> {
  const url = rawUrl.trim();
  const html = await fetchPage(url);
  return parseYatco(url, html);
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

function parseYatco(url: string, html: string): CampaignDraft {
  const $ = cheerio.load(html);
  const draft: CampaignDraft = { gallery: [], specs: {} };
  draft.listingUrl = url;

  // YATCO has rich JSON-LD with Vehicle schema
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json)
        ? json
        : json["@graph"]
          ? json["@graph"]
          : [json];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();

        if (/vehicle|product|boat/i.test(type) || node.offers) {
          // Title — YATCO uses boat name in "name" field
          if (node.name && !draft.headline) {
            // Build full title from brand + name
            const brand = node.brand?.name || "";
            draft.headline = brand
              ? `${brand} ${node.name}`
              : String(node.name);
          }

          if (node.description && !draft.description) {
            let desc = String(node.description).trim();
            if (desc.length > 600) desc = desc.slice(0, 600).replace(/\s\S*$/, "…");
            draft.description = desc;
          }

          // Image
          if (node.image) {
            const imgs = Array.isArray(node.image) ? node.image : [node.image];
            for (const img of imgs) {
              const src = typeof img === "string" ? img : img?.url || img?.contentUrl;
              if (src && /^https?:\/\//i.test(String(src))) draft.gallery.push(String(src));
            }
          }

          // Price from offers
          const offers = node.offers || {};
          if (offers.price && !draft.price) {
            const p = offers.price;
            const c = offers.priceCurrency || "USD";
            draft.price = typeof p === "number"
              ? `${c === "EUR" ? "€" : "$"}${p.toLocaleString("en-US")}`
              : String(p);
          }

          // Location from seller or offers
          const seller = offers.seller;
          if (seller && !draft.location) {
            const addr = seller.address;
            if (addr) {
              const city = addr.addressLocality;
              const region = addr.addressRegion;
              if (city || region) draft.location = [city, region].filter(Boolean).join(", ");
            }
          }

          // YATCO-specific: specs from additionalProperty array
          if (Array.isArray(node.additionalProperty)) {
            const propMap: Record<string, keyof CampaignDraft["specs"]> = {
              "length": "loa", "beam": "beam", "draft": "draft",
            };
            for (const prop of node.additionalProperty) {
              const name = String(prop.name || "").toLowerCase();
              const value = String(prop.value || "");
              for (const [key, field] of Object.entries(propMap)) {
                if (name.includes(key) && value) {
                  draft.specs[field] = draft.specs[field] || value;
                }
              }
            }
          }

          // Year from productionDate
          if (node.productionDate && !draft.specs.year) {
            draft.specs.year = String(node.productionDate);
          }

          // Builder from brand
          if (node.brand?.name && !draft.specs.builder) {
            draft.specs.builder = node.brand.name;
          }
        }
      }
    } catch { /* skip */ }
  });

  // DOM fallbacks
  if (!draft.headline) {
    draft.headline = clean($("h1").first().text()) || clean($("title").text());
  }
  if (!draft.location) {
    draft.location = clean($('[class*="location" i]').first().text());
  }

  // Gallery: grab YATCO CDN images
  if (!draft.gallery.length) {
    $("img[src]").each((_, img) => {
      const src = $(img).attr("src") || "";
      if (/^https?:\/\//i.test(src) && !/icon|logo|flag|avatar|sprite|pixel/i.test(src)) {
        const w = Number($(img).attr("width"));
        if (!w || w >= 200) draft.gallery.push(src);
      }
    });
  }

  draft.gallery = Array.from(new Set(draft.gallery));
  draft.heroUrl = draft.gallery[0];
  draft.headline = stripListingSuffix(draft.headline);
  draft.subject = draft.headline;

  return draft;
}

function stripListingSuffix(s?: string): string | undefined {
  if (!s) return s;
  return s
    .replace(/\s*[-–|]\s*(YATCO|Yacht\s*World|Denison|Boat\s*Trader).*$/i, "")
    .replace(/\s*[-–|]\s*(Yacht(s|ing)?\s*(Sales?|for\s*Sale)?).*$/i, "")
    .trim() || undefined;
}

function clean(s?: string | null): string {
  return (s || "").replace(/\s+/g, " ").trim();
}
