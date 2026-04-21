/**
 * market-analysis/parser.ts
 * Parses Denison-format comp PDFs into CompRecord arrays.
 *
 * Actual PDF text format (pdfplumber extract_text() WITHOUT layout=True):
 *   US$3,300,000
 *   112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR
 *   Fort Lauderdale, FL
 *   <description paragraphs>
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
  // Prefer USD in parens for EUR/AUD listings: "€3.8M ($4,454,018)" → 4454018
  const parenUsd = s.match(/\(\$?([\d,]+)\)/);
  if (parenUsd) return parseInt(parenUsd[1].replace(/,/g, ""));
  // Strip US$, A$, £, € then parse first number
  const cleaned = s.replace(/US\$|A\$|£|€|\$/g, "").replace(/,/g, "").trim().split(/\s/)[0];
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 10000 ? null : Math.round(n);
}

// Extract a field value from "Label: Value NextLabel: Value" single-spaced format
function fieldVal(line: string, label: string): string {
  // Stop at next "Word:" or "Two Words:" pattern (another field label)
  const re = new RegExp(
    `\\b${label}:\\s*(.+?)(?=\\s+[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*:|$)`,
    "i"
  );
  const m = line.match(re);
  return m ? m[1].trim() : "";
}

// Search all lines in a block for a field value
function findField(lines: string[], label: string): string {
  for (const line of lines) {
    const val = fieldVal(line, label);
    if (val) return val;
  }
  return "";
}

export function parseCompPdf(rawText: string, source: string): CompRecord[] {
  const records: CompRecord[] = [];

  // Split into listing blocks by the header line pattern:
  // "112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR"
  const headerRe = /^(\d{2,3}(?:\s+ft(?:\s+\d+\s+in)?)?)\s+(\d{4})\s+(.{5,})/gm;
  const matches = [...rawText.matchAll(headerRe)];

  for (let i = 0; i < matches.length; i++) {
    const headerStart = matches[i].index!;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index! : rawText.length;

    // Look back before header for the price line (e.g. "US$3,300,000")
    const lookback = rawText.slice(Math.max(0, headerStart - 300), headerStart);
    const priceLineMatch = lookback.match(/(US\$|A\$|\$|£|€)[\d,]+(?:\s*\([^)]+\))?[\s]*$/m);
    const headerPriceLine = priceLineMatch ? priceLineMatch[0].trim() : "";

    const block = rawText.slice(headerStart, blockEnd);
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);

    const record = parseBlock(lines, headerPriceLine, matches[i], source);
    if (record) records.push(record);
  }

  // Deduplicate
  const seen = new Set<string>();
  return records.filter(r => {
    const key = `${r.name}|${r.year}|${r.soldPrice ?? r.askPrice ?? r.listedPrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBlock(
  lines: string[],
  headerPriceLine: string,
  headerMatch: RegExpMatchArray,
  source: string
): CompRecord | null {
  // Header: "112 ft 2001 Westport Raised Pilothouse Motor Yacht, SUPERSTAR"
  const lengthFromHeader = headerMatch[1].replace(/\s+ft.*/, "ft").trim();
  const year = headerMatch[2];
  const rest = headerMatch[3]; // "Westport 112, KEMOSABE" or "Westport Raised Pilothouse Motor Yacht, SUPERSTAR"

  // Vessel name after last comma
  const lastComma = rest.lastIndexOf(",");
  const makeModelRaw = lastComma > -1 ? rest.slice(0, lastComma).trim() : rest.trim();
  const nameFromHeader = lastComma > -1 ? rest.slice(lastComma + 1).trim() : "";

  // Pull structured fields from spec lines
  const make = findField(lines, "Make") || makeModelRaw.split(/\s+/)[0] || "";
  const modelRaw = findField(lines, "Model");
  const model = modelRaw || makeModelRaw.split(/\s+/).slice(1).join(" ") || "";
  const name = findField(lines, "Name") || nameFromHeader;
  const length = findField(lines, "Length") || lengthFromHeader;
  const location = findField(lines, "Boat Location");
  const listedDate = findField(lines, "Listed Date");
  const soldDate = findField(lines, "Sold Date");
  const activeRaw = findField(lines, "Active");
  const daysOnMarket = activeRaw && /^\d+$/.test(activeRaw.trim()) ? parseInt(activeRaw) : null;

  // Prices
  const listedPriceRaw = findField(lines, "Listed Price");
  const soldPriceRaw = findField(lines, "Sold Price");
  const priceFieldRaw = findField(lines, "Price");
  const listedPrice = parsePrice(listedPriceRaw);
  const soldPrice = parsePrice(soldPriceRaw);
  const headerPrice = parsePrice(headerPriceLine || priceFieldRaw);

  const isSold = !!soldPrice || !!soldDate || source.includes("sold");
  const askPrice = !isSold ? (headerPrice || listedPrice) : null;
  const finalListedPrice = listedPrice || (!isSold ? null : headerPrice);

  return {
    name: name || makeModelRaw,
    make,
    model,
    year,
    length,
    listedPrice: finalListedPrice,
    soldPrice: soldPrice || null,
    askPrice,
    listedDate,
    soldDate,
    daysOnMarket,
    location,
    source,
  };
}
