/**
 * market-analysis/parser.ts
 * Parses Denison-format comp PDFs into CompRecord arrays.
 * Handles both sold comps (have Listed/Sold Price + Active days)
 * and active listings (have Price field only).
 *
 * Expected PDF text format per listing:
 *   "112 ft 2007 Westport 112, KEMOSABE\n$6,495,000\nFort Lauderdale, FL\n..."
 *   Fields: Make, Model, Year, Length, Price, Listed Date, Sold Date,
 *           Listed Price, Sold Price, Active, Boat Location, Name
 */

import type { CompRecord } from "./storage";

// ── Price parsing ─────────────────────────────────────────────────────────────
function parsePrice(s: string | undefined | null): number | null {
  if (!s) return null;
  // Strip currency symbols, commas, "Tax: Paid" suffixes, AU$/£/€ etc.
  const cleaned = s.replace(/[A-Z$£€]/g, "").replace(/,/g, "").replace(/\s.*/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n);
}

// ── Date parsing ──────────────────────────────────────────────────────────────
function parseDate(s: string | undefined | null): string {
  if (!s) return "";
  return s.trim();
}

// ── Extract all listing blocks from raw PDF text ──────────────────────────────
// Each block starts with a header like "112 ft 2007 Westport 112, VESSEL NAME"
// and contains structured key: value pairs.
export function parseCompPdf(rawText: string, source: string): CompRecord[] {
  const records: CompRecord[] = [];

  // Split into individual listing blocks by the header pattern:
  // e.g. "112 ft 2007 Westport 112, KEMOSABE" or "108 ft 2015 Benetti..."
  const headerRe = /^\d{2,3}(?:\s+ft(?:\s+\d+\s+in)?)\s+\d{4}\s+.{3,}/gm;
  const matches = [...rawText.matchAll(headerRe)];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;
    const block = rawText.slice(start, end);
    const record = parseBlock(block, source);
    if (record) records.push(record);
  }

  // Deduplicate by name+year+soldPrice (same vessel may appear twice in broader PDFs)
  const seen = new Set<string>();
  return records.filter(r => {
    const key = `${r.name}|${r.year}|${r.soldPrice ?? r.askPrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBlock(block: string, source: string): CompRecord | null {
  // Helper: extract a field value from the block
  const field = (label: string): string => {
    const re = new RegExp(`^${label}[:\\s]+(.+)$`, "im");
    const m = block.match(re);
    return m ? m[1].trim() : "";
  };

  // Parse header line: "112 ft 2007 Westport 112, KEMOSABE"
  const headerM = block.match(/^(\d{2,3}(?:\s+ft(?:\s+\d+\s+in)?)?)\s+(\d{4})\s+(.+)/);
  if (!headerM) return null;

  const lengthRaw = headerM[1].trim();
  const year = headerM[2];
  const rest = headerM[3]; // "Westport 112, KEMOSABE" or "Westport 112" etc.

  // Extract vessel name (after comma if present)
  const commaIdx = rest.indexOf(",");
  const makeModel = commaIdx > -1 ? rest.slice(0, commaIdx).trim() : rest.trim();
  const vesselName = field("Name") || (commaIdx > -1 ? rest.slice(commaIdx + 1).trim() : "");

  // Make/model split
  const makeParts = makeModel.split(/\s+/);
  const make = field("Make") || makeParts[0] || "";
  const model = field("Model") || makeParts.slice(1).join(" ") || "";

  // Prices
  const listedPriceRaw = field("Listed Price");
  const soldPriceRaw = field("Sold Price");
  const askPriceRaw = field("Price");
  const listedPrice = parsePrice(listedPriceRaw);
  const soldPrice = parsePrice(soldPriceRaw);
  const askPrice = parsePrice(askPriceRaw);

  // Dates
  const listedDate = parseDate(field("Listed Date"));
  const soldDate = parseDate(field("Sold Date"));

  // Days on market — "Active" field in sold comp PDFs
  const activeRaw = field("Active");
  const daysOnMarket = activeRaw ? parseInt(activeRaw) : null;

  // Location
  const location = field("Boat Location");

  // Length normalization
  const length = lengthRaw.replace(/\s+ft\s+\d+\s+in/, "ft").replace(/\s+ft/, "ft").trim();

  return {
    name: vesselName || makeModel,
    make,
    model,
    year,
    length,
    listedPrice: listedPrice || null,
    soldPrice: soldPrice || null,
    askPrice: askPrice || null,
    listedDate,
    soldDate,
    daysOnMarket: isNaN(daysOnMarket as number) ? null : daysOnMarket,
    location,
    source,
  };
}
