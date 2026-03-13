/**
 * FEC Campaign Finance Provider
 * THE GOLDMINE — Federal law requires political donors to disclose:
 *   - Full name, address (city, state, zip)
 *   - Employer name
 *   - Occupation / job title
 *
 * All public record via api.open.fec.gov (free, key required but free to get)
 * We use the bulk data endpoint that doesn't require a key.
 */

import { addSource, logAuditEvent } from "../storage";
import { type IdentityAnchors, validateFECRecord } from "../validation";

// Free FEC API key (demo key works, rate-limited)
const FEC_API_KEY = process.env.FEC_API_KEY || "DEMO_KEY";
const FEC_BASE = "https://api.open.fec.gov/v1";

export type FECResult = {
  donations: {
    contributor_name: string;
    contributor_city: string;
    contributor_state: string;
    contributor_zip: string;
    contributor_employer: string;
    contributor_occupation: string;
    contribution_amount: number;
    contribution_date: string;
    committee_name: string;
    source_url: string;
  }[];
  total_donated: number;
  employer: string;
  occupation: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  error?: string;
};

export async function searchFEC(
  profileId: number,
  leadId: number,
  fullName: string,
  anchors?: IdentityAnchors,
): Promise<FECResult> {
  const result: FECResult = {
    donations: [],
    total_donated: 0,
    employer: "",
    occupation: "",
    address_city: "",
    address_state: "",
    address_zip: "",
  };

  try {
    // Search individual contributions by name
    const nameParts = fullName.trim().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];

    // FEC API: search by contributor name
    const url = `${FEC_BASE}/schedules/schedule_a/?contributor_name=${encodeURIComponent(fullName)}&sort=-contribution_receipt_date&per_page=20&api_key=${FEC_API_KEY}`;

    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Fallback: try last name, first name format
      const altUrl = `${FEC_BASE}/schedules/schedule_a/?contributor_name=${encodeURIComponent(lastName + ", " + firstName)}&sort=-contribution_receipt_date&per_page=20&api_key=${FEC_API_KEY}`;
      const altRes = await fetch(altUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!altRes.ok) {
        result.error = `FEC API returned ${response.status}`;
        return result;
      }
      const altData = await altRes.json();
      processResults(altData, result, anchors);
    } else {
      const data = await response.json();
      processResults(data, result, anchors);
    }

    // Store discovered data as enrichment sources
    if (result.employer) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "fec", source_url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(fullName)}`,
        source_label: `FEC: Employer — ${result.employer}`,
        layer: "identity", data_key: "employer",
        data_value: result.employer, confidence: 85,
        fetched_at: new Date().toISOString(),
      });
    }
    if (result.occupation) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "fec", source_url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(fullName)}`,
        source_label: `FEC: Occupation — ${result.occupation}`,
        layer: "identity", data_key: "occupation",
        data_value: result.occupation, confidence: 85,
        fetched_at: new Date().toISOString(),
      });
    }
    if (result.address_city) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "fec", source_url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(fullName)}`,
        source_label: `FEC: Location — ${result.address_city}, ${result.address_state} ${result.address_zip}`,
        layer: "identity", data_key: "location",
        data_value: JSON.stringify({ city: result.address_city, state: result.address_state, zip: result.address_zip }),
        confidence: 85, fetched_at: new Date().toISOString(),
      });
    }
    if (result.total_donated > 0) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "fec", source_url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(fullName)}`,
        source_label: `FEC: $${result.total_donated.toLocaleString()} total political donations`,
        layer: "capital", data_key: "political_donations",
        data_value: JSON.stringify({ total: result.total_donated, count: result.donations.length }),
        confidence: 95, fetched_at: new Date().toISOString(),
      });
    }

    // Store individual top donations for detail
    for (const d of result.donations.slice(0, 5)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "fec", source_url: d.source_url,
        source_label: `FEC: $${d.contribution_amount.toLocaleString()} to ${d.committee_name} (${d.contribution_date})`,
        layer: "capital", data_key: "donation_detail",
        data_value: JSON.stringify(d), confidence: 95,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "fec",
      donations_found: result.donations.length,
      total_donated: result.total_donated,
      employer: result.employer,
      occupation: result.occupation,
      location: result.address_city ? `${result.address_city}, ${result.address_state}` : "",
      anchor_filtered: anchors ? true : false,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "fec", error: err.message });
  }

  return result;
}

// ─── Process FEC API results ────────────────────────────────────────

function processResults(data: any, result: FECResult, anchors?: IdentityAnchors) {
  const results = data?.results || [];
  if (results.length === 0) return;

  // Track most recent employer/occupation/address (most recent donation wins)
  const employerCounts = new Map<string, number>();
  const occupationCounts = new Map<string, number>();
  let rejectedCount = 0;

  for (const r of results) {
    // ── VALIDATION GATE: Filter by identity anchors ──
    if (anchors && (anchors.city || anchors.state || anchors.employer || anchors.emailDomain)) {
      const validation = validateFECRecord({
        contributor_city: r.contributor_city,
        contributor_state: r.contributor_state,
        contributor_zip: (r.contributor_zip || "").substring(0, 5),
        contributor_employer: r.contributor_employer,
      }, anchors);

      if (!validation.accepted && !validation.flagged) {
        rejectedCount++;
        continue; // Skip this record — different person
      }
    }

    const donation = {
      contributor_name: r.contributor_name || "",
      contributor_city: r.contributor_city || "",
      contributor_state: r.contributor_state || "",
      contributor_zip: (r.contributor_zip || "").substring(0, 5),
      contributor_employer: r.contributor_employer || "",
      contributor_occupation: r.contributor_occupation || "",
      contribution_amount: Math.abs(r.contribution_receipt_amount || 0),
      contribution_date: r.contribution_receipt_date || "",
      committee_name: r.committee?.name || r.committee_name || "",
      source_url: `https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(r.contributor_name || "")}`,
    };

    result.donations.push(donation);
    result.total_donated += donation.contribution_amount;

    // Count employer/occupation for most-common selection
    if (donation.contributor_employer && donation.contributor_employer !== "NONE"
        && donation.contributor_employer !== "N/A"
        && donation.contributor_employer !== "RETIRED"
        && donation.contributor_employer !== "SELF-EMPLOYED"
        && donation.contributor_employer !== "SELF") {
      employerCounts.set(donation.contributor_employer,
        (employerCounts.get(donation.contributor_employer) || 0) + 1);
    }
    // Also capture "SELF-EMPLOYED" and "RETIRED" as occupations
    const occ = donation.contributor_occupation;
    if (occ && occ !== "NONE" && occ !== "N/A" && occ !== "INFORMATION REQUESTED") {
      occupationCounts.set(occ, (occupationCounts.get(occ) || 0) + 1);
    }

    // Track special employer values too
    const emp = donation.contributor_employer;
    if (emp === "RETIRED" || emp === "SELF-EMPLOYED" || emp === "SELF") {
      occupationCounts.set(emp, (occupationCounts.get(emp) || 0) + 1);
    }
  }

  // Pick most frequent employer and occupation
  if (employerCounts.size > 0) {
    result.employer = [...employerCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (occupationCounts.size > 0) {
    result.occupation = [...occupationCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Use most recent donation for address (most current)
  const sorted = result.donations
    .filter(d => d.contributor_city)
    .sort((a, b) => b.contribution_date.localeCompare(a.contribution_date));
  if (sorted.length > 0) {
    result.address_city = sorted[0].contributor_city;
    result.address_state = sorted[0].contributor_state;
    result.address_zip = sorted[0].contributor_zip;
  }
}
