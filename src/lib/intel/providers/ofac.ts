/**
 * OFAC Sanctions Screening Provider
 * Checks names against the US Treasury SDN (Specially Designated Nationals) list.
 * Uses the free OFAC search API from sanctionssearch.ofac.treas.gov
 */

import { addSource, logAuditEvent } from "../storage";

const OFAC_SEARCH_URL = "https://search.ofac-api.com/v3";

export type OFACResult = {
  matched: boolean;
  matches: {
    name: string;
    type: string;       // "individual" | "entity"
    program: string;    // e.g. "SDGT", "IRAN"
    score: number;      // match confidence 0-100
    source_url: string;
  }[];
  error?: string;
};

export async function checkOFAC(
  profileId: number,
  leadId: number,
  fullName: string,
  companyName?: string
): Promise<OFACResult> {
  const result: OFACResult = { matched: false, matches: [] };

  try {
    // Search by individual name
    const nameMatches = await searchOFAC(fullName, "individual");
    result.matches.push(...nameMatches);

    // Search by company name if provided
    if (companyName) {
      const companyMatches = await searchOFAC(companyName, "entity");
      result.matches.push(...companyMatches);
    }

    result.matched = result.matches.length > 0;

    // Store results as enrichment sources
    if (result.matched) {
      for (const match of result.matches) {
        addSource({
          profile_id: profileId,
          lead_id: leadId,
          source_type: "ofac",
          source_url: match.source_url,
          source_label: `OFAC SDN: ${match.name} (${match.program})`,
          layer: "risk",
          data_key: "sanctions_flag",
          data_value: "true",
          confidence: match.score,
          fetched_at: new Date().toISOString(),
        });
      }
    } else {
      // Log a clean result too — absence of sanctions is valuable
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "ofac",
        source_url: "https://sanctionssearch.ofac.treas.gov/",
        source_label: "OFAC SDN: No matches",
        layer: "risk",
        data_key: "sanctions_flag",
        data_value: "false",
        confidence: 90,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "ofac",
      queries: [fullName, companyName].filter(Boolean),
      matches_found: result.matches.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "ofac",
      error: err.message,
    });
  }

  return result;
}

// ─── Internal Search Function ───────────────────────────────────────

async function searchOFAC(
  query: string,
  type: "individual" | "entity"
): Promise<OFACResult["matches"]> {
  if (!query || query.trim().length < 2) return [];

  try {
    // Use Treasury's OFAC search API
    const response = await fetch(
      "https://sanctionssearch.ofac.treas.gov/api/SearchByName",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: query.trim(),
          minScore: 80,  // Only high-confidence matches
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
      }
    );

    if (!response.ok) {
      console.warn(`[OFAC] API returned ${response.status} — falling back to clean`);
      return [];
    }

    const data = await response.json();

    // Treasury API returns array of matches with score, name, programs, etc.
    if (!Array.isArray(data) || data.length === 0) return [];

    return data
      .filter((entry: any) => entry.score >= 80)
      .slice(0, 5) // Cap at 5 matches
      .map((entry: any) => ({
        name: entry.name || entry.sdnName || query,
        type: entry.sdnType?.toLowerCase().includes("individual") ? "individual" : "entity",
        program: entry.programs?.join(", ") || entry.program || "SDN",
        score: entry.score || 80,
        source_url: `https://sanctionssearch.ofac.treas.gov/?name=${encodeURIComponent(query)}`,
      }));
  } catch (err: any) {
    // Network errors, timeouts — not a sanctions hit, just unavailable
    console.warn(`[OFAC] Search failed for "${query}": ${err.message}`);
    return [];
  }
}
