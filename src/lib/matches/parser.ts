/**
 * BoatWizard "New Listings" email parser
 * Extracts individual vessel records from HTML or plain text emails.
 */

import type { ParsedListing } from "./storage";

type PartialListing = Partial<ParsedListing>;

// Common patterns in BoatWizard listing emails
const PRICE_RE = /\$[\d,]+(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s*(?:USD|EUR)/gi;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const LOA_RE = /(\d{2,3})[''′]?\s*(?:ft|feet|foot|LOA)?|\b(\d{2,3})\s*(?:ft|feet|foot|LOA)\b/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

// Known yacht makes for matching
const KNOWN_MAKES = [
  "Azimut", "Benetti", "Bertram", "Boston Whaler", "Brunswick",
  "Burger", "Cabo", "Carver", "Caterpillar", "Chaparral",
  "Chris-Craft", "Cigarette", "Cobalt", "Cruisers", "Dufour",
  "Everglades", "Fairline", "Ferretti", "Fountain", "Galeon",
  "Grady-White", "Gulf Stream", "Hatteras", "Hinckley", "HMY",
  "Horizon", "Hunt", "Hydra-Sports", "Intrepid", "Jeanneau",
  "Jupiter", "Lazzara", "Luhrs", "Malibu", "Marquis",
  "Maritimo", "MasterCraft", "Meridian", "Monte Carlo",
  "Nautica", "Nordhavn", "Ocean Alexander", "Outer Reef",
  "Pacific Mariner", "Pardo", "Pathfinder", "Pershing",
  "Princess", "Pursuit", "Regal", "Regulator", "Rinker",
  "Riva", "Riviera", "Robalo", "Sailfish", "San Lorenzo",
  "Sabre", "Scout", "Sea Fox", "Sea Hunt", "Sea Pro",
  "Sea Ray", "Silverton", "Sealine", "Sportsman", "Sunseeker",
  "Tiara", "Trinity", "Viking", "Wellcraft", "Westport",
  "Yellowfin", "Zeelander",
];

const MAKE_RE = new RegExp(`\\b(${KNOWN_MAKES.join("|")})\\b`, "gi");

/**
 * Strip HTML tags, decode entities, normalize whitespace
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract a price string from text
 */
function extractPrice(text: string): string {
  const matches = text.match(PRICE_RE);
  if (!matches) return "";
  // Return the most likely asking price (usually the largest number)
  let best = "";
  let bestVal = 0;
  for (const m of matches) {
    const val = parseFloat(m.replace(/[^0-9.]/g, ""));
    if (val > bestVal) { bestVal = val; best = m.trim(); }
  }
  return best;
}

/**
 * Extract year from text
 */
function extractYear(text: string): string {
  const matches = text.match(YEAR_RE);
  if (!matches) return "";
  // Prefer a year that appears near the beginning (title position)
  return matches[0];
}

/**
 * Extract LOA from text
 */
function extractLoa(text: string): string {
  const m = LOA_RE.exec(text);
  LOA_RE.lastIndex = 0;
  if (!m) return "";
  const val = m[1] || m[2];
  return val ? `${val}'` : "";
}

/**
 * Extract make from text by matching known brands
 */
function extractMake(text: string): string {
  const m = MAKE_RE.exec(text);
  MAKE_RE.lastIndex = 0;
  if (m) return m[1];
  return "";
}

/**
 * Extract model — text after the make, before a number or line break
 */
function extractModel(text: string, make: string): string {
  if (!make) return "";
  const idx = text.toLowerCase().indexOf(make.toLowerCase());
  if (idx === -1) return "";
  const after = text.substring(idx + make.length).trim();
  // Grab words until we hit a number, pipe, or line break
  const m = after.match(/^([A-Za-z][\w\s-]{0,30})/);
  return m ? m[1].trim() : "";
}

/**
 * Extract listing URL
 */
function extractUrl(text: string): string {
  const matches = text.match(URL_RE);
  if (!matches) return "";
  // Prefer yachtworld, boatwizard, or denison URLs
  const preferred = matches.find(u =>
    /yachtworld|boatwizard|denison|jamesedition/i.test(u)
  );
  return (preferred || matches[0]).replace(/[)\]}>.,;]+$/, "");
}

/**
 * Extract location from text — look for city/state patterns
 */
function extractLocation(text: string): string {
  // "City, ST" or "City, State" patterns
  const m = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
  if (m) return `${m[1]}, ${m[2]}`;
  // Florida-specific
  const fl = text.match(/\b(Fort Lauderdale|Miami|Palm Beach|Stuart|Sarasota|Tampa|Naples|Jupiter|Dania|Pompano|Hollywood|Key (?:West|Largo|Biscayne)|Destin|Riviera Beach|North Palm Beach)\b/i);
  if (fl) return `${fl[1]}, FL`;
  return "";
}

/**
 * Split email content into individual vessel blocks.
 * BoatWizard emails typically use:
 * - HTML table rows
 * - Repeated patterns with horizontal rules
 * - Numbered listings
 * - Bold headings per vessel
 */
function splitIntoBlocks(text: string): string[] {
  // Strategy 1: Split on horizontal rules or heavy dividers
  let blocks = text.split(/(?:\n\s*[-=_]{3,}\s*\n|\n\s*\*{3,}\s*\n)/);

  // Strategy 2: If that gives only 1 block, try splitting on patterns
  // like "2024 Viking" or "Year Make" at start of line
  if (blocks.length <= 1) {
    blocks = text.split(/\n(?=\s*(?:19[5-9]\d|20[0-4]\d)\s+[A-Z])/);
  }

  // Strategy 3: Split on double newlines if blocks are still large
  if (blocks.length <= 1) {
    blocks = text.split(/\n\n+/);
  }

  // Filter out tiny blocks (< 20 chars) and header/footer blocks
  return blocks
    .map(b => b.trim())
    .filter(b => b.length >= 20)
    .filter(b => !(/^(unsubscribe|copyright|all rights|this email|you are receiving)/i.test(b)));
}

/**
 * Parse a single text block into a vessel record
 */
function parseBlock(block: string): PartialListing | null {
  const year = extractYear(block);
  const make = extractMake(block);
  const price = extractPrice(block);
  const loa = extractLoa(block);
  const url = extractUrl(block);
  const location = extractLocation(block);
  const model = extractModel(block, make);

  // Must have at least a make OR a year+price to be a valid vessel block
  if (!make && !(year && price)) return null;

  return {
    make: make || "",
    model: model || "",
    year: year || "",
    loa: loa || "",
    asking_price: price || "",
    location: location || "",
    vessel_type: /sail/i.test(block) ? "sail" : "motor",
    features: "",
    listing_url: url || "",
    broker_notes: "",
    raw_text: block.substring(0, 2000), // cap stored raw text
  };
}

/**
 * Main export: parse a BoatWizard email (HTML or text) into vessel records
 */
export function parseBoatWizardEmail(htmlOrText: string): PartialListing[] {
  if (!htmlOrText || htmlOrText.trim().length === 0) return [];

  // Strip HTML if present
  const isHtml = /<[a-z][\s\S]*>/i.test(htmlOrText);
  const text = isHtml ? stripHtml(htmlOrText) : htmlOrText;

  // Split into individual vessel blocks
  const blocks = splitIntoBlocks(text);

  // Parse each block
  const listings: PartialListing[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const vessel = parseBlock(block);
    if (!vessel) continue;

    // Dedup within email by make+model+year
    const key = `${vessel.make}|${vessel.model}|${vessel.year}`.toLowerCase();
    if (seen.has(key) && key !== "||") continue;
    seen.add(key);

    listings.push(vessel);
  }

  return listings;
}
