/**
 * Nonprofit & Philanthropy Provider
 * Uses ProPublica Nonprofit Explorer API (free, no key required)
 * IRS 990 filings are public and reveal:
 *   - Executive compensation at nonprofits
 *   - Board memberships
 *   - Organization involvement
 *   - Signals of wealth (high-comp nonprofit execs, board seats at major foundations)
 */

import { addSource, logAuditEvent } from "../storage";

export type NonprofitResult = {
  organizations: {
    name: string;
    ein: string;
    city: string;
    state: string;
    role: string;  // "officer", "director", "trustee", "key_employee"
    compensation: number;
    org_revenue: number;
    source_url: string;
  }[];
  total_compensation: number;
  error?: string;
};

export async function searchNonprofits(
  profileId: number,
  leadId: number,
  fullName: string,
): Promise<NonprofitResult> {
  const result: NonprofitResult = { organizations: [], total_compensation: 0 };

  try {
    const nameParts = fullName.trim().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];

    // Search ProPublica for organizations matching name
    // First search by full name, then by last name for broader matches
    const searches = [fullName, `${lastName} ${firstName}`];
    const seenEins = new Set<string>();

    for (const query of searches) {
      const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(query)}`;
      try {
        const res = await fetch(url, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const orgs = data.organizations || [];

        // For each org found, fetch details to check officers
        for (const org of orgs.slice(0, 5)) {
          if (seenEins.has(org.ein)) continue;
          seenEins.add(org.ein);
          await checkOrgOfficers(org.ein, org.name, fullName, profileId, leadId, result);
        }
      } catch { /* continue to next search */ }
    }

    // Also do a broader search: fetch IRS 990 officer data
    // ProPublica doesn't have a direct "search by person" API,
    // so we search orgs and check their officers
    if (result.organizations.length === 0) {
      // Try searching with just last name + common org types
      const orgUrl = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(lastName)}&state=&ntee=0&c_code=3`;
      try {
        const res = await fetch(orgUrl, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          for (const org of (data.organizations || []).slice(0, 3)) {
            if (seenEins.has(org.ein)) continue;
            seenEins.add(org.ein);
            await checkOrgOfficers(org.ein, org.name, fullName, profileId, leadId, result);
          }
        }
      } catch { /* best effort */ }
    }

    result.total_compensation = result.organizations.reduce((sum, o) => sum + o.compensation, 0);

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "nonprofit",
      orgs_found: result.organizations.length,
      total_compensation: result.total_compensation,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "nonprofit", error: err.message });
  }

  return result;
}

// ─── Check org officers against lead name ───────────────────────────

async function checkOrgOfficers(
  ein: string, orgName: string, fullName: string,
  profileId: number, leadId: number, result: NonprofitResult,
) {
  try {
    const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const org = data.organization || {};
    const filings = data.filings_with_data || [];

    if (filings.length === 0) return;

    // Check most recent filing for officers
    const latest = filings[0];
    const people = latest.officers || latest.people || [];
    const nameLower = fullName.toLowerCase();
    const nameParts = fullName.toLowerCase().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];

    for (const person of people) {
      const pName = (person.name || "").toLowerCase();
      // Match: full name, or "LAST, FIRST" format
      const isMatch = pName.includes(nameLower)
        || pName.includes(`${lastName}, ${firstName}`)
        || pName.includes(`${lastName} ${firstName}`)
        || (pName.includes(lastName) && pName.includes(firstName));

      if (isMatch) {
        const entry = {
          name: orgName,
          ein,
          city: org.city || "",
          state: org.state || "",
          role: person.title || "Officer",
          compensation: person.compensation || 0,
          org_revenue: org.revenue_amount || latest.totrevenue || 0,
          source_url: `https://projects.propublica.org/nonprofits/organizations/${ein}`,
        };
        result.organizations.push(entry);

        addSource({
          profile_id: profileId, lead_id: leadId,
          source_type: "nonprofit", source_url: entry.source_url,
          source_label: `IRS 990: ${entry.role} at ${orgName}${entry.compensation ? ` ($${entry.compensation.toLocaleString()}/yr)` : ""}`,
          layer: "capital", data_key: "nonprofit_role",
          data_value: JSON.stringify(entry), confidence: 75,
          fetched_at: new Date().toISOString(),
        });
        break; // One match per org is enough
      }
    }
  } catch { /* API call failed, skip */ }
}
