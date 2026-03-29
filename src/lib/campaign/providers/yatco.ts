import * as cheerio from "cheerio";
import { CampaignDraft } from "../providers/denison";
import { stealthFetch } from "./stealthFetch";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;

export async function scrapeYatco(rawUrl: string): Promise<CampaignDraft> {
  const url = rawUrl.trim();
  let html: string;
  try {
    html = await fetchPage(url);
    // If we got a Cloudflare challenge or a suspiciously short page, fall through to stealth
    if (html.length < 5000 || /challenge-platform|just a moment/i.test(html)) {
      throw new Error("CF challenge detected, falling back to stealthFetch");
    }
  } catch {
    html = await stealthFetch(url);
  }
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
          // Title — prefer H1 (set after JSON-LD loop); seed from node.name as fallback
          // H1 format: "Probability 1997 122' 1" DELTA MARINE Motor Yacht" — much richer
          if (node.name && !draft.headline) {
            const brand = node.brand?.name || "";
            draft.headline = brand ? `${brand} ${node.name}` : String(node.name);
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

          // Speed — array of QuantitativeValue: [{name:"Max Speed",value:"17 Knots"}, ...]
          if (Array.isArray(node.speed)) {
            for (const s of node.speed) {
              const n = String(s.name || "").toLowerCase();
              const v = String(s.value || "");
              if (n.includes("max") && v && !draft.specs.maxSpeed) draft.specs.maxSpeed = v;
              if (n.includes("cruis") && v && !draft.specs.cruiseSpeed) draft.specs.cruiseSpeed = v;
            }
          }

          // Gross tonnage — single QuantitativeValue in weight field
          if (node.weight?.value && !draft.specs.grossTonnage) {
            draft.specs.grossTonnage = String(node.weight.value);
          }
        }
      }
    } catch { /* skip */ }
  });

  // H1 is the richest headline on YATCO — overrides the node.name seed
  // Format: "Probability 1997 122' 1\" DELTA MARINE Motor Yacht"
  const h1 = clean($("h1").first().text());
  if (h1) draft.headline = h1;

  // DOM fallbacks
  if (!draft.headline) {
    draft.headline = clean($("title").text());
  }

  // Location — YATCO JSON-LD has no address; it lives in body text only
  // Pattern: "Palm Beach Gardens, Florida, United States"
  if (!draft.location) {
    const bodyText = $("body").text();
    const locMatch = bodyText.match(/Location[:\s]+([A-Za-z][A-Za-z\s,]+(?:United States|United Kingdom|France|Italy|Spain|Australia|Netherlands|Croatia|Greece|Turkey|Bahamas|UAE|[A-Z][a-z]+))/);
    if (locMatch) draft.location = locMatch[1].trim();
  }
  if (!draft.location) {
    draft.location = clean($('[class*="location" i]').first().text());
  }

  // Gallery: YATCO listing photos are on cloud.yatco.com/ForSale/Vessel/Photo/
  // They come in small_ and large_ variants — keep large_ only, fall back to any
  if (!draft.gallery.length) {
    const allImgs: string[] = [];
    $("img[src], img[data-src]").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src") || "";
      if (src.includes("cloud.yatco.com") && src.includes("ForSale")) allImgs.push(src);
    });
    // Prefer large_ variants; if none exist use whatever we have
    const largeImgs = allImgs.filter(s => s.includes("large_"));
    draft.gallery = largeImgs.length ? largeImgs : allImgs;
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
