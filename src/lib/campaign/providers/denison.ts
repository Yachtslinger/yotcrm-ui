import * as cheerio from "cheerio";

export type CampaignDraft = {
  subject?: string;
  preheader?: string;
  headline?: string;
  location?: string;
  price?: string;
  heroUrl?: string;
  gallery: string[];
  description?: string;
  features?: string[];
  specs: {
    loa?: string;
    beam?: string;
    draft?: string;
    year?: string;
    builder?: string;
    model?: string;
    staterooms?: string;
    heads?: string;
    engines?: string;
    engineMake?: string;
    engineModel?: string;
    power?: string;
  };
  listingUrl?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;

export async function scrapeDenison(rawUrl: string, html?: string): Promise<CampaignDraft> {
  const url = normalizeUrl(rawUrl);
  const markup = html ?? (await fetchDenisonHtml(url));
  return parseDenisonHtml(url, markup);
}

function normalizeUrl(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) throw new Error("Invalid URL");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!/denisonyachtsales\.com$/i.test(parsed.hostname)) {
    throw new Error(`Unsupported domain: ${parsed.hostname}`);
  }
  parsed.hash = "";
  return parsed.toString();
}

async function fetchDenisonHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    // Detect redirect to search/listings page (bad slug → 301 → /yachts-for-sale)
    const finalUrl = res.url || url;
    if (/\/yachts-for-sale\/?$/i.test(finalUrl) || /\/yacht-listings\/?$/i.test(finalUrl)) {
      throw new Error(`URL redirected to search page (${finalUrl}). The listing slug may be incorrect.`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDenisonHtml(url: string, html: string): CampaignDraft {
  const $ = cheerio.load(html);

  // Detect if we landed on a search/listings page instead of an individual listing
  const title = $("title").text().trim().toLowerCase();
  if (/^yachts for sale$/i.test(title) || /^yacht listings$/i.test(title)) {
    throw new Error("Scraped a search results page, not an individual listing. Check the URL slug.");
  }

  const json = extractJsonLd($);
  const og = extractOpenGraph($);
  const dom = extractDomData($, url);

  const gallery = dedupeUrls([...(json.gallery ?? []), ...(og.images ?? []), ...dom.gallery]);
  const heroUrl = json.hero || og.hero || gallery[0];

  const specs = mergeSpecs(json.specs, dom.specs);
  const engineInfo = parseEngineDetails(specs.engines || json.specs.engines || dom.specs.engines || "");
  const finalSpecs = { ...specs, ...engineInfo };

  // Strip common suffixes from headline/subject
  const stripSuffix = (s?: string) =>
    s ? s.replace(/\s*[-–|]\s*(Denison\s*(Yacht(ing|s?\s*Sales?)?)?|denisonyachtsales\.com).*$/i, "").trim() : s;

  const rawSubject = json.subject || dom.headline || og.title;
  const rawHeadline = json.headline || og.title || dom.headline;

  return {
    subject: stripSuffix(rawSubject),
    preheader: json.preheader || json.description || og.description || dom.description,
    headline: stripSuffix(rawHeadline),
    location: json.location || dom.location,
    price: json.price || dom.price,
    heroUrl,
    gallery,
    description: json.description || dom.description || og.description,
    features: dom.features?.length ? dom.features : undefined,
    specs: finalSpecs,
    listingUrl: url,
  };
}

type SpecFields = CampaignDraft["specs"];

type JsonLdResult = {
  subject?: string;
  preheader?: string;
  headline?: string;
  description?: string;
  hero?: string;
  gallery?: string[];
  price?: string;
  location?: string;
  specs: SpecFields;
};

function extractJsonLd($: cheerio.CheerioAPI): JsonLdResult {
  const result: JsonLdResult = { specs: {} };
  const scripts = $('script[type="application/ld+json"]').toArray();
  scripts.forEach((script) => {
    try {
      const json = JSON.parse($(script).text());
      const nodes = normalizeJsonLdNodes(json);
      nodes.forEach((node) => mapJsonLdNode(node, result));
    } catch {
      // ignore malformed block
    }
  });
  return result;
}

function mapJsonLdNode(node: Record<string, unknown>, acc: JsonLdResult): void {
  const type = normalizeType(node["@type"]);
  if (!type) return;
  if (/Product|Boat|Vehicle|Offer/i.test(type)) {
    const name = getString(node.name);
    acc.subject = acc.subject || name;
    acc.headline = acc.headline || name;
    const description = getString(node.description);
    acc.description = acc.description || description;
    if (node.image) {
      const images = getArray(node.image) ?? [node.image];
      const normalized = images
        .map((img) => (typeof img === "string" ? sanitizeImageUrl(img) : null))
        .filter((value): value is string => Boolean(value));
      if (normalized.length) {
        acc.gallery = [...(acc.gallery ?? []), ...normalized];
        acc.hero = acc.hero || normalized[0];
      }
    }
    const offers = getRecord(node.offers);
    if (offers) {
      const priceSpec = getRecord(offers.priceSpecification);
      const price = offers.price ?? priceSpec?.price;
      const currency = offers.priceCurrency ?? priceSpec?.priceCurrency;
      const formatted = formatPrice(price, currency);
      if (formatted) acc.price = acc.price || formatted;
      const available = getRecord(offers.availableAtOrFrom);
      const address = available?.address ?? offers.areaServed ?? node.address;
      const location = formatAddress(address);
      if (location) acc.location = acc.location || location;
    } else if (node.address || node.areaServed) {
      const location = formatAddress(node.address || node.areaServed);
      if (location) acc.location = acc.location || location;
    }
    acc.specs = mergeSpecs(acc.specs, hydrateSpecsFromJson(node));
  }
}

function hydrateSpecsFromJson(node: Record<string, unknown>): SpecFields {
  const specs: SpecFields = {};
  const assign = (key: keyof SpecFields, value?: unknown) => {
    if (typeof value === "string" && value.trim()) specs[key] = value.trim();
  };
  const brand = getRecord(node.brand);
  const manufacturer = getRecord(node.manufacturer);
  assign("builder", getString(brand?.name) ?? getString(manufacturer?.name));
  assign("model", getString(node.model));
  assign("year", getString(node.productionDate) ?? getString(node.vehicleModelDate));
  assign("staterooms", getString(node.numberOfRooms) ?? getString(node.numberOfCabins));
  assign("heads", getString(node.numberOfBathroomsTotal) ?? getString(node.numberOfBathrooms) ?? getString(node.numberOfPartialBathrooms));
  assign("engines", getString(node.engine) ?? getString(node.vehicleEngine));
  assign("power", getString(node.power));
  type AdditionalProperty = { name?: string; value?: string };
  const additional = Array.isArray(node.additionalProperty) ? (node.additionalProperty as AdditionalProperty[]) : [];
  additional.forEach((entry) => {
    if (!entry) return;
    const label = entry.name ? String(entry.name) : "";
    const value = entry.value ? String(entry.value) : "";
    if (!value) return;
    const key = detectSpecKey(label);
    if (key) specs[key] = specs[key] || value;
  });
  return specs;
}

function extractOpenGraph($: cheerio.CheerioAPI) {
  const title = $('meta[property="og:title"]').attr("content") || undefined;
  const description = $('meta[property="og:description"]').attr("content") || undefined;
  const image = $('meta[property="og:image"]').attr("content") || undefined;
  return {
    title: title?.trim(),
    description: description?.trim(),
    hero: sanitizeImageUrl(image),
    images: image ? [sanitizeImageUrl(image)].filter(Boolean) as string[] : [],
  };
}

function extractDomData($: cheerio.CheerioAPI, baseUrl: string) {
  const specs: SpecFields = {};
  let location: string | undefined;
  let price: string | undefined;
  let features: string[] = [];

  const assign = (label: string, value: string) => {
    const key = detectSpecKey(label);
    const cleanValue = cleanText(value);
    if (!key || !cleanValue) return;
    specs[key] = specs[key] || cleanValue;
    if (key === "staterooms" && /head/i.test(label) && !specs.heads) {
      specs.heads = cleanValue;
    }
  };

  const handlePair = (label: string, value: string) => {
    const cleanLabel = label.toLowerCase();
    const cleanValue = cleanText(value);
    if (!cleanValue) return;
    if (/location/.test(cleanLabel)) location = location || cleanValue.replace(/flag/i, "").trim();
    else if (/price|asking/.test(cleanLabel)) price = price || cleanValue;
    assign(label, value);
  };

  $("dt").each((_, el) => {
    handlePair($(el).text(), $(el).next("dd").text());
  });
  $("th").each((_, el) => {
    handlePair($(el).text(), $(el).next("td").text());
  });
  $("tr").each((_, row) => {
    const cells = $(row).find("td,th");
    if (cells.length >= 2) handlePair(cells.eq(0).text(), cells.eq(1).text());
  });
  $("li").each((_, el) => {
    const text = cleanText($(el).text());
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (match) handlePair(match[1], match[2]);
  });

  const headline = cleanText($("h1").first().text());
  const description = cleanText($("article p").first().text() || $("p").first().text());

  // Blacklist for nav items, language links, and other junk
  const LANGUAGE_NAMES = /\b(english|español|français|italiano|deutsch|português|中文|日本語|한국어|русский|العربية|dutch|swedish|norwegian|danish|finnish|polish|czech|greek|turkish|arabic|chinese|japanese|korean|russian|portuguese|french|spanish|italian|german)\b/i;
  const FEATURE_BLACKLIST = /^(our\s*news|home|about|contact|menu|search|login|sign\s*in|privacy|terms|cookie|newsletter|subscribe|unsubscribe|back\s*to|view\s*all|show\s*more|load\s*more|read\s*more|see\s*all|see\s*more|close|share|print|save|compare|facebook|twitter|instagram|linkedin|youtube|pinterest|tiktok|email\s*us|call\s*us|get\s*directions?)$/i;
  const stripBullets = (text: string): string => text.replace(/^[\s•●○◦▪▸►→\-–—*·»›‣⁃\u2022\u2023\u25E6\u2043\u2219]+/, "").trim();
  const isJunkFeature = (text: string): boolean => {
    const stripped = stripBullets(text);
    if (!stripped || stripped.length < 4) return true;
    if (stripped.length > 200) return true;
    if (FEATURE_BLACKLIST.test(stripped)) return true;
    if (LANGUAGE_NAMES.test(stripped) && stripped.split(/\s+/).length <= 2) return true;
    if (/\bviews?\b/i.test(stripped)) return true;
    // Single words that are likely nav links (not boat features)
    if (!/\s/.test(stripped) && stripped.length < 15 && !/\d/.test(stripped)) return true;
    return false;
  };

  const featureSection = $("h2,h3").filter((_, el) => /feature|highlight|equipment|key\s*feature/i.test($(el).text())).first();
  if (featureSection.length) {
    const list = featureSection.nextUntil("h2,h3").find("li");
    if (list.length) {
      features = list
        .map((_, li) => cleanText($(li).text()))
        .toArray()
        .filter((text) => !isJunkFeature(text));
    }
  }
  // Only use broader fallback if within a content area, not nav
  if (!features.length) {
    const contentArea = $("main, article, .listing-detail, .yacht-detail, .content, [role='main']").first();
    if (contentArea.length) {
      features = contentArea.find("ul li")
        .map((_, li) => cleanText($(li).text()))
        .toArray()
        .filter((text) => !isJunkFeature(text))
        .slice(0, 8);
    }
  }

  const bodyText = cleanText($("body").text());
  bodyText.split(/[\n\r]+/).forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) handlePair(match[1], match[2]);
  });

  const gallery = collectGalleryImages($, baseUrl);

  return { specs, location, price, headline, description, gallery, features };
}

function collectGalleryImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const selectors = [
    ".gallery img[src]",
    ".carousel img[src]",
    ".swiper-slide img[src]",
    "[data-gallery] img[src]",
    "figure img[src]",
    ".hero img[src]",
    "img[src]",
  ];
  const results: string[] = [];
  selectors.forEach((selector) => {
    $(selector).each((_, img) => {
      const src = toAbsolute($(img).attr("src") || "", baseUrl);
      const normalized = sanitizeImageUrl(src);
      if (!normalized) return;
      const widthAttr = Number($(img).attr("width"));
      const heightAttr = Number($(img).attr("height"));
      if ((widthAttr && widthAttr < 600) || (heightAttr && heightAttr < 400)) return;
      results.push(normalized);
    });
  });
  return results;
}

function parseEngineDetails(raw: string) {
  if (!raw) return {};
  const text = raw.replace(/\s+/g, " ").trim();
  const match = text.match(/(\d+)\s*x\s*([A-Za-z][A-Za-z&\s]+)\s*([A-Za-z0-9\-]+)?(?:.*?)(\d[\d,\.]*\s*(?:hp|kW))/i);
  if (!match) {
    return {};
  }
  const [, count, make, model, power] = match;
  return {
    engineMake: capitalize(make.trim()),
    engineModel: model ? model.trim() : undefined,
    power: power ? `${count} x ${power.trim()}` : undefined,
  };
}

function mergeSpecs(primary: SpecFields, secondary: SpecFields): SpecFields {
  const merged: SpecFields = { ...secondary };
  (Object.keys(primary) as Array<keyof SpecFields>).forEach((key) => {
    if (primary[key] && !merged[key]) {
      merged[key] = primary[key];
    }
  });
  return merged;
}

function detectSpecKey(label: string): keyof SpecFields | null {
  const normalized = label.toLowerCase();
  if (/length|loa|yacht details|overall/.test(normalized)) return "loa";
  if (/beam/.test(normalized)) return "beam";
  if (/draft/.test(normalized)) return "draft";
  if (/year/.test(normalized)) return "year";
  if (/builder|shipyard/.test(normalized)) return "builder";
  if (/model/.test(normalized)) return "model";
  if (/stateroom|cabin|berth/.test(normalized)) return "staterooms";
  if (/head/.test(normalized)) return "heads";
  if (/engine|power|horsepower|hp|kw/.test(normalized)) return "engines";
  return null;
}

function dedupeUrls(urls: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  return urls
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function sanitizeImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const clean = url.trim();
  if (!clean) return undefined;
  if (/\.(svg)$/i.test(clean)) return undefined;
  if (/flag|icon|emoji/i.test(clean)) return undefined;
  if (!/^https?:\/\//i.test(clean)) return undefined;
  return clean.replace(/^http:\/\//i, "https://");
}

function toAbsolute(src: string, base: string): string {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("//")) {
    const parsed = new URL(base);
    return `${parsed.protocol}${src}`;
  }
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

function formatPrice(price: unknown, currency: unknown): string | undefined {
  if (typeof price === "string" && price.trim()) return price.trim();
  if (typeof price === "number") {
    const symbol = currency === "EUR" ? "€" : "$";
    return `${symbol}${price.toLocaleString("en-US")}`;
  }
  return undefined;
}

function formatAddress(address: unknown): string | undefined {
  if (typeof address === "string") return cleanText(address);
  const record = getRecord(address);
  if (!record) return undefined;
  const city = getString(record.addressLocality);
  const region = getString(record.addressRegion) ?? getString(record.addressCountry);
  const parts = [city, region].filter((part): part is string => Boolean(part));
  if (parts.length) return parts.join(", ");
  return undefined;
}

function cleanText(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function capitalize(value: string): string {
  return value
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function normalizeType(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
}

function normalizeJsonLdNodes(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((node): node is Record<string, unknown> => isRecord(node));
  }
  if (isRecord(data) && Array.isArray(data["@graph"])) {
    return (data["@graph"] as unknown[]).filter((node): node is Record<string, unknown> => isRecord(node));
  }
  return isRecord(data) ? [data] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? (value as Record<string, unknown>) : undefined;
}

function getArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
