import * as cheerio from "cheerio";
import { NormalizedSpecs, NormalizedSpecsSchema } from "./schema";

type RawSpecMap = Record<string, unknown>;
type ListingAddress = {
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
};

export async function scrapeSpecs(url: string): Promise<NormalizedSpecs> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Unable to fetch specs (${res.status})`);
  const html = await res.text();
  return scrapeSpecsFromHtml(html);
}

export function scrapeSpecsFromHtml(html: string): NormalizedSpecs {
  const $ = cheerio.load(html);
  const structured = parseStructuredData($) || {};
  const parsed = parseLabeledSpecs($);
  const specs: NormalizedSpecs = NormalizedSpecsSchema.parse({
    length: structured.length || parsed.length || "",
    beam: structured.beam || parsed.beam || "",
    draft: structured.draft || parsed.draft || "",
    year: structured.year || parsed.year || "",
    staterooms: structured.staterooms || parsed.staterooms || "",
    power: structured.power || parsed.power || "",
    builder: structured.builder || parsed.builder || "",
    model: structured.model || parsed.model || "",
    location: structured.location || parsed.location || "",
    price: structured.price || parsed.price || "",
  });
  return specs;
}

export function parseStructuredData($: cheerio.CheerioAPI): Partial<NormalizedSpecs> | null {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    try {
      const raw = $(script).text();
      const json = JSON.parse(raw);
      const nodes = Array.isArray(json) ? json : [json];
      const listing = nodes.find((node) => typeof node["@type"] === "string" && /Boat|Product/i.test(node["@type"])) as RawSpecMap | undefined;
      if (!listing) continue;
      const properties = Array.isArray(listing.additionalProperty) ? (listing.additionalProperty as RawSpecMap[]) : [];
      const findProp = (pattern: RegExp) => {
        const match = properties.find((prop) => typeof prop.name === "string" && pattern.test(prop.name));
        return typeof match?.value === "string" ? match.value : "";
      };
      const offers = (listing.offers as RawSpecMap) || {};
      const available = offers.availableAtOrFrom as { address?: ListingAddress } | undefined;
      const offerAddress = available?.address;
      const builder = (listing.brand as RawSpecMap)?.name || (listing.manufacturer as RawSpecMap)?.name;
      const length = findProp(/length/i) || (typeof listing.length === "string" ? listing.length : "");
      const beam = findProp(/beam/i) || (typeof listing.beam === "string" ? listing.beam : "");
      const draft = findProp(/draft/i) || (typeof listing.draft === "string" ? listing.draft : "");
      const location =
        (offerAddress?.addressLocality as string) ||
        (typeof offers.areaServed === "string" ? offers.areaServed : "");
      const priceRaw = typeof offers.price === "number" || typeof offers.price === "string" ? offers.price : undefined;
      return {
        length: toFeet(length),
        beam: toFeet(beam),
        draft: toFeet(draft),
        year: (listing.productionDate as string) || (listing.modelDate as string) || "",
        staterooms: (listing.numberOfRooms as string) || (listing.numberOfBedrooms as string) || "",
        power: (listing.engine as string) || "",
        builder: typeof builder === "string" ? builder : "",
        model: (listing.model as string) || "",
        location,
        price: priceRaw ? formatPrice(priceRaw, typeof offers.priceCurrency === "string" ? offers.priceCurrency : undefined) : "",
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function parseLabeledSpecs($: cheerio.CheerioAPI): Partial<NormalizedSpecs> {
  const out: Partial<NormalizedSpecs> = {};
  const assign = (label: string, value: string) => {
    const cleanLabel = label.trim();
    const cleanValue = value.trim();
    if (!cleanLabel || !cleanValue) return;
    if (/length|loa/i.test(cleanLabel)) out.length = toFeet(cleanValue);
    else if (/beam/i.test(cleanLabel)) out.beam = toFeet(cleanValue);
    else if (/draft/i.test(cleanLabel)) out.draft = toFeet(cleanValue);
    else if (/year/i.test(cleanLabel)) out.year = cleanValue;
    else if (/builder|shipyard/i.test(cleanLabel)) out.builder = cleanValue;
    else if (/model/i.test(cleanLabel)) out.model = cleanValue;
    else if (/stateroom|cabin/i.test(cleanLabel)) out.staterooms = cleanValue;
    else if (/engine/i.test(cleanLabel)) out.power = cleanValue;
    else if (/power|hp|kw/i.test(cleanLabel)) out.power = cleanValue;
    else if (/location/i.test(cleanLabel)) out.location = cleanValue;
    else if (/price|asking/i.test(cleanLabel)) out.price = cleanValue;
  };

  $("dt, th").each((_, el) => {
    const key = $(el).text();
    const value = $(el).next("dd, td").text();
    assign(key, value);
  });

  $("li").each((_, el) => {
    const text = $(el).text();
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (match) assign(match[1], match[2]);
  });

  $("tr").each((_, row) => {
    const cells = $(row).find("td,th");
    if (cells.length >= 2) {
      assign(cells.eq(0).text(), cells.eq(1).text());
    }
  });

  return out;
}

function formatPrice(value: unknown, currency?: string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "";
  const symbol = currency === "EUR" ? "€" : "$";
  return `${symbol}${numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function toFeet(raw?: string): string {
  if (!raw) return "";
  const meters = raw.match(/([\d.]+)\s*m/gi);
  if (meters?.length) {
    const val = parseFloat(meters[0]);
    if (!Number.isNaN(val)) return `${(val * 3.28084).toFixed(1)} ft`;
  }
  const feet = raw.match(/([\d.]+)\s*(?:ft|')/i);
  if (feet) {
    const val = parseFloat(feet[1]);
    if (!Number.isNaN(val)) return `${val.toFixed(1)} ft`;
  }
  return raw.trim();
}
