/**
 * FAA Aircraft Registry Provider
 * Searches the FAA N-Number (aircraft registration) database by owner name.
 * Public data at: https://registry.faa.gov/AircraftInquiry/
 */

import { addSource, logAuditEvent } from "../storage";
import { type IdentityAnchors } from "../validation";

export type FAAResult = {
  aircraft: {
    n_number: string;
    serial_number: string;
    manufacturer: string;
    model: string;
    year: string;
    owner_name: string;
    owner_address: string;
    type: string;       // "Fixed wing single engine", "Rotorcraft", etc.
    source_url: string;
  }[];
  error?: string;
};

export async function searchFAA(
  profileId: number,
  leadId: number,
  fullName: string,
  companyName?: string,
  anchors?: IdentityAnchors,
): Promise<FAAResult> {
  const result: FAAResult = { aircraft: [] };

  try {
    // Search by individual name
    const nameHits = await queryFAAByName(fullName);
    result.aircraft.push(...nameHits);

    // Search by company name
    if (companyName) {
      const compHits = await queryFAAByName(companyName);
      result.aircraft.push(...compHits);
    }

    // Deduplicate by N-number
    const seen = new Set<string>();
    result.aircraft = result.aircraft.filter(a => {
      if (seen.has(a.n_number)) return false;
      seen.add(a.n_number);
      return true;
    });

    // Store enrichment sources — lower confidence for name-only matches
    // FAA doesn't provide owner address in search results, so we can't
    // validate against location anchors. Flag as "unverified location".
    const hasLocationAnchors = anchors && (anchors.city || anchors.state);
    const confidence = hasLocationAnchors ? 60 : 85; // Lower when we can't cross-verify

    for (const aircraft of result.aircraft) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "faa",
        source_url: aircraft.source_url,
        source_label: `FAA: N${aircraft.n_number} ${aircraft.manufacturer} ${aircraft.model}${hasLocationAnchors ? " (name match only)" : ""}`,
        layer: "capital",
        data_key: "aircraft_registration",
        data_value: JSON.stringify({
          n_number: aircraft.n_number,
          manufacturer: aircraft.manufacturer,
          model: aircraft.model,
          year: aircraft.year,
          type: aircraft.type,
        }),
        confidence: confidence,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "faa",
      aircraft_found: result.aircraft.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "faa", error: err.message,
    });
  }

  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function queryFAAByName(name: string): Promise<FAAResult["aircraft"]> {
  if (!name || name.trim().length < 3) return [];

  try {
    // Split name into last/first for FAA search
    const parts = name.trim().split(/\s+/);
    let lastName = parts[parts.length - 1] || "";
    let firstName = parts.slice(0, -1).join(" ") || "";

    // For company names, search as last name only
    if (parts.length === 1 || name.includes("LLC") || name.includes("Inc") || name.includes("Corp")) {
      lastName = name.trim();
      firstName = "";
    }

    const url = `https://registry.faa.gov/AircraftInquiry/Search/NameResult?LastName=${encodeURIComponent(lastName)}&FirstName=${encodeURIComponent(firstName)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "YotCRM/1.0",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      console.warn(`[FAA] Query returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseFAAHTML(html, name);
  } catch (err: any) {
    console.warn(`[FAA] Search failed for "${name}": ${err.message}`);
    return [];
  }
}

function parseFAAHTML(html: string, ownerName: string): FAAResult["aircraft"] {
  const aircraft: FAAResult["aircraft"] = [];

  // FAA returns an HTML table with N-Number, Serial, Manufacturer, Model, etc.
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkPattern = /NNumberResult\?nNumberTxt=([^"&]+)/i;
  const rows = html.match(rowPattern) || [];

  for (const row of rows) {
    const cells: string[] = [];
    let match;
    while ((match = cellPattern.exec(row)) !== null) {
      cells.push(match[1].replace(/<[^>]+>/g, "").trim());
    }
    cellPattern.lastIndex = 0;

    if (cells.length >= 4 && /^\d/.test(cells[0])) {
      const nNum = cells[0].replace(/^N/i, "");
      const linkMatch = row.match(linkPattern);

      aircraft.push({
        n_number: nNum,
        serial_number: cells[1] || "",
        manufacturer: cells[2] || "",
        model: cells[3] || "",
        year: cells[4] || "",
        owner_name: ownerName,
        owner_address: "",
        type: cells[5] || "",
        source_url: linkMatch
          ? `https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=${nNum}`
          : `https://registry.faa.gov/AircraftInquiry/Search/NameResult`,
      });
    }
  }

  return aircraft.slice(0, 10);
}
