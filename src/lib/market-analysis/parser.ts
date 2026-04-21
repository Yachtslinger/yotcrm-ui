/**
 * market-analysis/parser.ts
 * Parses Denison-format comp PDFs into CompRecord arrays.
 *
 * PDF format (extract_text WITHOUT layout=True):
 *   US$3,300,000
 *   112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR
 *   Fort Lauderdale, FL
 *   <description>
 *   Make: Westport   Listed Date: October 2, 2025   Name: SUPERSTAR
 *   Model: Raised Pilothouse Motor Yacht   Sold Date: December 8, 2025   Fuel Type: Diesel
 *   Year: 2001   Listed Price: $3,890,000   Max Draft: 5 ft 6 in
 *   Length: 112 ft   Sold Price: US$3,300,000
 *   Condition: Used   Hull Material: Fiberglass
 *   Class: Motor Yacht   Beam: 23 ft
 *   Active: 67   Boat Location: Fort Lauderdale, FL
 */

import type { CompRecord } from "./storage";

function parsePrice(s: string | undefined | null): number | null {
  if (!s) return null;
  // Handle "US$3,300,000", "$3,890,000", "€3,800,000 ($4,454,018)", "A$12,950,000 ($9,158,680)"
  // Prefer USD value in parens if present (for EUR/AUD listings)
  const parenUsd = s.match(/\(\$?([\d,]+)\)/);
  if (parenUsd) return parseInt(parenUsd[1].replace(/,/g, ""));
  const cleaned = s.replace(/US\$|A\$|£|€|\$/g, "").replace(/,/g, "").trim().split(/\s/)[0];
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 10000 ? null : Math.round(n);
}

function parseDate(s: string | undefined | null): string {
  return s?.trim() || "";
}

function fieldVal(block: string, label: string): string {
  // Match "Label: VALUE" — stop at two or more spaces (next column), newline, or another Label:
  const re = new RegExp(`(?:^|\\s)${label}:\\s*(.+?)(?=\\s{2,}\\w|\\n|$)`, "im");
  const m = block.match(re);
  if (!m) return "";
  // Strip any trailing label fragments like "Max Draft: 5 ft 6 in" bleeding in
  return m[1].replace(/\s{2,}.+$/, "").trim();
}

export function parseCompPdf(rawText: string, source: string): CompRecord[] {
  const records: CompRecord[] = [];

  // Each listing block starts with the header line pattern:
  // "112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR"
  // which may be preceded by a price line "US$3,300,000"
  const headerRe = /^(\d{2,3}(?:\s+ft(?:\s+\d+\s+in)?)?)\s+(\d{4})\s+(.{5,})/gm;
  const matches = [...rawText.matchAll(headerRe)];

  for (let i = 0; i < matches.length; i++) {
    const headerStart = matches[i].index!;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;

    // Look back up to 3 lines before header to find price line
    const lookback = rawText.slice(Math.max(0, headerStart - 200), headerStart);
    const priceLineMatch = lookback.match(/(US\$|A\$|\$|£|€)[\d,]+(?:\s*\([^)]+\))?[\s]*$/m);
    const priceLineFull = priceLineMatch ? priceLineMatch[0].trim() : "";

    const block = rawText.slice(headerStart, blockEnd);
    const record = parseBlock(block, priceLineFull, source);
    if (record) records.push(record);
  }

  // Dedup by name+year+price
  const seen = new Set<string>();
  return records.filter(r => {
    const key = `${r.name}|${r.year}|${r.soldPrice ?? r.askPrice ?? r.listedPrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBlock(block: string, priceLineFull: string, source: string): CompRecord | null {
  // Parse header: "112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR"
  const headerM = block.match(/^(\d{2,3}(?:\s+ft(?:\s+\d+\s+in)?)?)\s+(\d{4})\s+(.+)/);
  if (!headerM) return null;

  const lengthFromHeader = headerM[1].replace(/\s+ft.*/, "ft").trim();
  const year = headerM[2];
  const rest = headerM[3]; // "Westport Raised Pilothouse Motor Yacht, SUPERSTAR"

  // Vessel name is after last comma (if any)
  const lastComma = rest.lastIndexOf(",");
  const makeModel = lastComma > -1 ? rest.slice(0, lastComma).trim() : rest.trim();
  const vesselName = lastComma > -1 ? rest.slice(lastComma + 1).trim() : "";

  // Extract fields from the spec block (the tabular section at bottom of each listing)
  const make = fieldVal(block, "Make") || makeModel.split(/\s+/)[0] || "";
  const model = fieldVal(block, "Model") || makeModel.split(/\s+/).slice(1).join(" ") || "";
  const length = fieldVal(block, "Length") || lengthFromHeader;
  const location = fieldVal(block, "Boat Location");
  const name = fieldVal(block, "Name") || vesselName;

  // Prices
  const listedPriceRaw = fieldVal(block, "Listed Price");
  const soldPriceRaw = fieldVal(block, "Sold Price");
  const listedPrice = parsePrice(listedPriceRaw);
  const soldPrice = parsePrice(soldPriceRaw);

  // For active listings PDFs: price comes from the header price line or "Price:" field
  const priceFieldRaw = fieldVal(block, "Price");
  const headerPrice = parsePrice(priceLineFull || priceFieldRaw);

  // Days on market — "Active: 67"
  const activeRaw = fieldVal(block, "Active");
  const daysOnMarket = activeRaw && /^\d+$/.test(activeRaw.trim()) ? parseInt(activeRaw) : null;

  // Dates
  const listedDate = parseDate(fieldVal(block, "Listed Date"));
  const soldDate = parseDate(fieldVal(block, "Sold Date"));

  // Determine if sold or active
  const isSold = !!soldPrice || !!soldDate || source.includes("sold");
  const askPrice = !isSold ? (headerPrice || listedPrice) : null;
  const finalListedPrice = listedPrice || (!isSold ? null : headerPrice);
  const finalSoldPrice = soldPrice;

  return {
    name: name || makeModel,
    make,
    model,
    year,
    length,
    listedPrice: finalListedPrice,
    soldPrice: finalSoldPrice,
    askPrice,
    listedDate,
    soldDate,
    daysOnMarket,
    location,
    source,
  };
}
