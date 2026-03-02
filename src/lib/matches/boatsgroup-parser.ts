/**
 * BoatsGroup Email Parser
 * 
 * Parses the nightly "New Listings From Your Professional Boat Shopper" email
 * from product-updates@mail.boatsgroup.com
 * 
 * Extracts only:
 *   Section A: "70+ Motor Yachts New Listings USA" (USA, 70ft+, $1M+)
 *   Section B: "70+ Yachts Outside of North America" (Global, 70ft+, $1M+)
 * 
 * Ignores all other saved-search sections (smaller boats, lower prices, etc.)
 */

export type BoatsGroupListing = {
  make: string;
  model: string;
  year: string;
  loa: string;
  asking_price: string;
  location: string;
  listing_url: string;
  brokerage: string;
  raw_text: string;
  section: "usa" | "global";
  vessel_type: string;
};

export type BoatsGroupParseResult = {
  sections: {
    name: string;
    tag: "usa" | "global";
    criteria: string;
    resultCount: number;
    listings: BoatsGroupListing[];
  }[];
  ignoredSections: string[];
  totalExtracted: number;
  parseErrors: string[];
};

// ─── Section Identification ─────────────────────────────

// Section A pattern: contains "USA" or "North America" in title, 70+ ft
const SECTION_A_RE = /70\+.*(?:USA|North America|New Listings USA)/i;
// Section B pattern: contains "Outside" or "Global" or "Europe" in title, 70+ ft
const SECTION_B_RE = /70\+.*(?:Outside|Global|Europe|Worldwide)/i;

/**
 * Decode quoted-printable encoding from .eml text body
 */
function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, "")           // soft line breaks
    .replace(/=20\s*$/gm, " ")        // trailing =20
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return String.fromCharCode(code);
    });
}

/**
 * Extract the text/plain body from a raw .eml file
 */
function extractTextBody(rawEml: string): string {
  // Find boundary
  const boundaryMatch = rawEml.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    // No MIME boundary — treat entire content as text
    return decodeQP(rawEml);
  }

  const boundary = boundaryMatch[1];
  const parts = rawEml.split(`--${boundary}`);

  // Find text/plain part
  for (const part of parts) {
    if (part.includes("Content-Type: text/plain")) {
      // Get content after the blank line following headers
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const body = part.substring(headerEnd + 4);
      return decodeQP(body);
    }
  }

  // Fallback: if no text/plain found, try to use the raw content
  // (handles paste of just the text body)
  return decodeQP(rawEml);
}

// ─── Listing Extraction ─────────────────────────────────

const LISTING_LINE_RE = /^Length:\s*(\d+)ft\s+Year:\s*(\d{4})\s+Price:\s*\$?([\d,]+)/;
const BROKERAGE_RE = /^\s*Brokerage:\s*(.+)/;
const URL_RE = /^<?(https?:\/\/psp\.boatwizard\.com\/boat[^\s>]*)/;

function extractListingsFromBlock(
  lines: string[],
  section: "usa" | "global"
): BoatsGroupListing[] {
  const listings: BoatsGroupListing[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for "Length: XXft Year: XXXX Price: $X,XXX,XXX"
    const detailMatch = line.match(LISTING_LINE_RE);
    if (detailMatch) {
      const loa = detailMatch[1];
      const year = detailMatch[2];
      const price = detailMatch[3].replace(/,/g, "");

      // Location is next non-empty line
      let location = "";
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        location = lines[j].trim().replace(/\s*$/, "").replace(/^Location:\s*/i, "");
      }

      // Brokerage follows location
      let brokerage = "";
      j++;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        const brokerMatch = lines[j].match(BROKERAGE_RE);
        if (brokerMatch) brokerage = brokerMatch[1].trim();
      }

      // Boat name is above the URL which is above the detail line
      // Walk backwards from the detail line to find the boat name
      let boatName = "";
      let listingUrl = "";
      let k = i - 1;

      // Skip empty lines going backwards
      while (k >= 0 && !lines[k].trim()) k--;

      // The URL line(s) — may span multiple lines due to QP encoding
      let urlLines: string[] = [];
      while (k >= 0 && (lines[k].trim().startsWith("<https://") || lines[k].trim().startsWith("https://") || lines[k].trim().match(/^[^\s<]*boatwizard/))) {
        urlLines.unshift(lines[k].trim());
        k--;
      }
      if (urlLines.length > 0) {
        const fullUrl = urlLines.join("").replace(/^</, "").replace(/>$/, "");
        const urlMatch = fullUrl.match(/(https?:\/\/psp\.boatwizard\.com\/boat[^\s>]*)/);
        if (urlMatch) listingUrl = urlMatch[1];
      }

      // Skip more empty lines
      while (k >= 0 && !lines[k].trim()) k--;

      // Boat name line (e.g. "Ocean Alexander 72 Pilothouse")
      if (k >= 0) {
        boatName = lines[k].trim().replace(/\s*$/, "");
      }

      // Parse make/model from boat name
      let make = "";
      let model = "";
      if (boatName) {
        // Common patterns: "Ocean Alexander 72 Pilothouse", "Riva 86' DOMINO", "Bertram 700"
        // Split on first number or known model separator
        const nameMatch = boatName.match(/^([A-Za-z\s]+?)[\s]+(\d.*)$/);
        if (nameMatch) {
          make = nameMatch[1].trim();
          model = nameMatch[2].trim();
        } else {
          make = boatName;
        }
      }

      const rawBlock = [boatName, listingUrl ? `URL: ${listingUrl}` : "",
        `Length: ${loa}ft Year: ${year} Price: $${price}`,
        `Location: ${location}`, `Brokerage: ${brokerage}`
      ].filter(Boolean).join("\n");

      listings.push({
        make, model, year, loa,
        asking_price: price,
        location,
        listing_url: listingUrl,
        brokerage,
        raw_text: rawBlock,
        section,
        vessel_type: "motor_yacht",
      });

      i = j + 1;
      continue;
    }
    i++;
  }

  return listings;
}

// ─── Main Parser ────────────────────────────────────────

export function parseBoatsGroupEmail(rawInput: string): BoatsGroupParseResult {
  const errors: string[] = [];
  const ignoredSections: string[] = [];

  // Extract text body (handles both raw .eml and pasted text)
  let text = rawInput;
  if (rawInput.includes("Content-Type: text/plain") || rawInput.includes("boundary=")) {
    text = extractTextBody(rawInput);
  }

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  // Find all section headers by looking for "X result(s)" pattern
  // Each section has: title line, search criteria block, "N result(s)", then listings
  type SectionBound = {
    titleLine: number;
    title: string;
    criteriaStart: number;
    resultsLine: number;
    resultCount: number;
    startLine: number;  // first listing line
    endLine: number;    // last listing line (start of next section or EOF)
  };

  const sections: SectionBound[] = [];

  for (let i = 0; i < lines.length; i++) {
    const resultsMatch = lines[i].match(/^(\d+)\s+result\(s\)/);
    if (resultsMatch) {
      const resultCount = parseInt(resultsMatch[1]);

      // Walk backwards to find the section title
      // Look for "Search Criteria:" then the title above it
      let criteriaLine = -1;
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        if (lines[j].match(/Search Criteria:/i)) {
          criteriaLine = j;
          break;
        }
      }

      // Title is above criteria
      let titleLine = -1;
      let title = "";
      if (criteriaLine > 0) {
        for (let j = criteriaLine - 1; j >= Math.max(0, criteriaLine - 5); j--) {
          const trimmed = lines[j].trim();
          if (trimmed && !trimmed.startsWith("<") && trimmed.length > 5) {
            titleLine = j;
            title = trimmed;
            break;
          }
        }
      }

      // Start line is after the "N result(s)" line + URL line
      let startLine = i + 1;
      // Skip the "view all" URL lines
      while (startLine < lines.length && (
        lines[startLine].trim().startsWith("<https://") ||
        lines[startLine].trim().startsWith("https://") ||
        !lines[startLine].trim()
      )) {
        startLine++;
      }

      sections.push({
        titleLine,
        title,
        criteriaStart: criteriaLine,
        resultsLine: i,
        resultCount,
        startLine,
        endLine: lines.length, // will be adjusted
      });
    }
  }

  // Set end boundaries: each section ends where the next section's title begins
  for (let s = 0; s < sections.length; s++) {
    if (s + 1 < sections.length) {
      // End at the title of the next section (or criteria start, whichever is earlier)
      const nextStart = sections[s + 1].titleLine >= 0 ? sections[s + 1].titleLine : sections[s + 1].criteriaStart;
      sections[s].endLine = nextStart >= 0 ? nextStart : sections[s + 1].resultsLine;
    }
  }

  // Now classify sections as A (USA), B (Global), or ignored
  const result: BoatsGroupParseResult = {
    sections: [],
    ignoredSections: [],
    totalExtracted: 0,
    parseErrors: errors,
  };

  for (const sec of sections) {
    // Check B first — "70+ Yachts Outside of North America" matches BOTH
    // A (contains "North America") and B (contains "Outside"), so B must take priority
    const isB = SECTION_B_RE.test(sec.title);
    const isA = !isB && SECTION_A_RE.test(sec.title);

    if (!isA && !isB) {
      ignoredSections.push(`${sec.title} (${sec.resultCount} results)`);
      continue;
    }

    const tag = isB ? "global" as const : "usa" as const;
    const sectionLines = lines.slice(sec.startLine, sec.endLine);
    const listings = extractListingsFromBlock(sectionLines, tag);

    if (listings.length === 0 && sec.resultCount > 0) {
      errors.push(`Section "${sec.title}" claimed ${sec.resultCount} results but extracted 0`);
    }

    result.sections.push({
      name: sec.title,
      tag,
      criteria: lines.slice(sec.criteriaStart, sec.resultsLine).map(l => l.trim()).filter(Boolean).join(" "),
      resultCount: sec.resultCount,
      listings,
    });

    result.totalExtracted += listings.length;
  }

  result.ignoredSections = ignoredSections;
  return result;
}
