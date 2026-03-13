/**
 * USCG Vessel Documentation Provider
 * Searches the US Coast Guard vessel documentation database.
 * Public data at: https://www.st.nmfs.noaa.gov/st1/CoastGuard/
 * and NVDC abstract search.
 */

import { addSource, logAuditEvent } from "../storage";
import { type IdentityAnchors, validateAgainstAnchors } from "../validation";

export type USCGResult = {
  vessels: {
    name: string;
    hin: string;
    owner: string;
    hailing_port: string;
    vessel_type: string;
    gross_tons: string;
    length: string;
    year_built: string;
    source_url: string;
  }[];
  error?: string;
};

export async function searchUSCG(
  profileId: number,
  leadId: number,
  fullName: string,
  companyName?: string,
  anchors?: IdentityAnchors,
): Promise<USCGResult> {
  const result: USCGResult = { vessels: [] };

  try {
    // Search by owner name
    const nameVessels = await queryUSCGByOwner(fullName);
    result.vessels.push(...nameVessels);

    // Search by company name
    if (companyName) {
      const compVessels = await queryUSCGByOwner(companyName);
      result.vessels.push(...compVessels);
    }

    // Deduplicate by HIN
    const seen = new Set<string>();
    result.vessels = result.vessels.filter(v => {
      const key = v.hin || v.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Validate against identity anchors — filter vessels owned by wrong person
    if (anchors && (anchors.city || anchors.state)) {
      result.vessels = result.vessels.filter(v => {
        // Hailing port contains city/state — validate it
        const portText = (v.hailing_port || "").toLowerCase();
        if (!portText) return true; // No port data — keep it
        // Check if state matches
        if (anchors.state && portText.includes(anchors.state.toLowerCase())) return true;
        // Check if city matches
        if (anchors.city && portText.includes(anchors.city.toLowerCase())) return true;
        // If port doesn't match any known location, but we have limited anchors, keep it flagged
        // Only reject if we have strong anchor data AND it clearly mismatches
        if (anchors.city && anchors.state) return false;
        return true;
      });
    }

    // Store as enrichment sources
    for (const vessel of result.vessels) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "uscg",
        source_url: vessel.source_url,
        source_label: `USCG: ${vessel.name} (${vessel.length}ft, ${vessel.year_built})`,
        layer: "capital",
        data_key: "vessel_registration",
        data_value: JSON.stringify({
          name: vessel.name,
          hin: vessel.hin,
          length: vessel.length,
          year_built: vessel.year_built,
          type: vessel.vessel_type,
        }),
        confidence: 85,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "uscg",
      vessels_found: result.vessels.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "uscg", error: err.message,
    });
  }

  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function queryUSCGByOwner(ownerName: string): Promise<USCGResult["vessels"]> {
  if (!ownerName || ownerName.trim().length < 3) return [];

  try {
    // USCG NVDC vessel abstract search — public endpoint
    // Try the NOAA-hosted Coast Guard vessel database
    const url = `https://www.st.nmfs.noaa.gov/pls/webpls/cgvesq_s.cg_vess_qry_own?v_owner_name=${encodeURIComponent(ownerName.trim())}&v_vessel_name=&v_hport_state=&v_call_sign=`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "YotCRM/1.0" },
    });

    if (!response.ok) {
      console.warn(`[USCG] Query returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseUSCGHTML(html, ownerName);
  } catch (err: any) {
    console.warn(`[USCG] Search failed for "${ownerName}": ${err.message}`);
    return [];
  }
}

function parseUSCGHTML(html: string, ownerName: string): USCGResult["vessels"] {
  const vessels: USCGResult["vessels"] = [];

  // Parse table rows from USCG response
  // The USCG response is an HTML table with vessel data
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const rows = html.match(rowPattern) || [];

  for (const row of rows.slice(1)) { // Skip header row
    const cells: string[] = [];
    let match;
    while ((match = cellPattern.exec(row)) !== null) {
      cells.push(match[1].replace(/<[^>]+>/g, "").trim());
    }
    cellPattern.lastIndex = 0;

    if (cells.length >= 5) {
      vessels.push({
        name: cells[0] || "",
        hin: cells[1] || "",
        owner: ownerName,
        hailing_port: cells[2] || "",
        vessel_type: cells[3] || "",
        gross_tons: cells[4] || "",
        length: cells[5] || "",
        year_built: cells[6] || "",
        source_url: "https://www.st.nmfs.noaa.gov/st1/CoastGuard/VesselByOwner.html",
      });
    }
  }

  return vessels.slice(0, 10);
}
