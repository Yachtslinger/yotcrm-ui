import * as cheerio from "cheerio";
import { NormalizedSpecs, NormalizedSpecsSchema } from "./schema";

type RawSpecMap = Record<string, string>;

export async function scrapeSpecs(url: string): Promise<NormalizedSpecs> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const structured = parseStructuredData($) || {};
  const fallback = parseLabeledSpecs($);

  const specs: NormalizedSpecs = NormalizedSpecsSchema.parse({
    length: structured.length || fallback.length || "",
    beam: structured.beam || fallback.beam || "",
    draft: structured.draft || fallback.draft || "",
    year: structured.year || fallback.year || "",
    staterooms: structured.staterooms || fallback.staterooms || "",
    power: structured.power || fallback.power || "",
    builder: structured.builder || fallback.builder || "",
    model: structured.model || fallback.model || "",
    location: structured.location || fallback.location || deriveLocation($),
    price: structured.price || fallback.price || derivePrice($),
    raw: collectRawText($),
  });

  return specs;
}

function parseStructuredData($: cheerio.CheerioAPI): Partial<NormalizedSpecs> | null {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    try {
      const json = JSON.parse($(script).html() || "null");
      const offer = Array.isArray(json) ? json.find((v) => v["@type"]) : json;
      if (!offer) continue;
      if (offer["@type"] === "Product" || offer["@type"] === "Boat") {
        return {
          length: toFeet(offer.additionalProperty?.find((p: RawSpecMap) => /length/i.test(p.name))?.value),
          beam: toFeet(offer.additionalProperty?.find((p: RawSpecMap) => /beam/i.test(p.name))?.value),
          draft: toFeet(offer.additionalProperty?.find((p: RawSpecMap) => /draft/i.test(p.name))?.value),
          year: offer.productionDate || offer.modelDate || "",
          staterooms: offer.numberOfRooms || "",
          power: offer.engine || offer.power || "",
          builder: offer.manufacturer?.name || "",
          model: offer.model || "",
          location: offer.offers?.seller?.name || offer.offers?.areaServed || "",
          price: offer.offers?.price ? `$${Number(offer.offers.price).toLocaleString()}` : "",
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function parseLabeledSpecs($: cheerio.CheerioAPI): Partial<NormalizedSpecs> {
  const out: Partial<NormalizedSpecs> = {};
  const assign = (label: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    if (/length/i.test(label)) out.length = toFeet(v);
    else if (/beam/i.test(label)) out.beam = toFeet(v);
    else if (/draft/i.test(label)) out.draft = toFeet(v);
    else if (/state\s?rooms?/i.test(label)) out.staterooms = v;
    else if (/power|hp|horse/i.test(label)) out.power = v;
    else if (/builder/i.test(label)) out.builder = v;
    else if (/model/i.test(label)) out.model = v;
    else if (/year/i.test(label)) out.year = v;
    else if (/price/i.test(label)) out.price = sanitizePrice(v);
  };

  $("dt, th").each((_, el) => assign($(el).text(), $(el).next("dd, td").text()));
  $("li").each((_, el) => {
    const text = $(el).text();
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (match) assign(match[1], match[2]);
  });
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td,th");
    if (cells.length >= 2) assign(cells.eq(0).text(), cells.eq(1).text());
  });
  return out;
}

function toFeet(raw?: string): string {
  if (!raw) return "";
  const meters = raw.match(/([\d.]+)\s*m/gi);
  if (meters?.length) {
    const val = parseFloat(meters[0]);
    if (!Number.isNaN(val)) return `${(val * 3.28084).toFixed(1)} ft`;
  }
  const ft = raw.match(/([\d.]+)\s*(?:ft|')/i);
  if (ft) {
    const val = parseFloat(ft[1]);
    if (!Number.isNaN(val)) return `${val.toFixed(1)} ft`;
  }
  return raw.trim();
}

function sanitizePrice(raw: string): string {
  const match = raw.match(/\$?\s?\d[\d,\.]*/);
  return match ? match[0].replace(/\s+/g, "") : raw;
}

function derivePrice($: cheerio.CheerioAPI): string {
  const text = collectRawText($);
  const match = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/);
  return match ? match[0] : "";
}

function deriveLocation($: cheerio.CheerioAPI): string {
  const text = collectRawText($);
  const match = text.match(/\b[A-Z][a-z]+,\s?[A-Z]{2}\b/);
  return match ? match[0] : "";
}

function collectRawText($: cheerio.CheerioAPI): string {
  return $("body").text().replace(/\s+/g, " ").trim();
}
