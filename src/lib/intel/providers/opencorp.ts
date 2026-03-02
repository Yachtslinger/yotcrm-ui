/**
 * OpenCorporates Provider
 * Searches the world's largest open database of companies.
 * Free tier: 50 requests/day, no API key required.
 * API docs: https://api.opencorporates.com/documentation
 */

import { addSource, logAuditEvent } from "../storage";

const OC_BASE = "https://api.opencorporates.com/v0.4";

export type OpenCorpResult = {
  companies: {
    name: string;
    jurisdiction: string;
    status: string;          // "Active", "Dissolved", etc.
    incorporation_date: string;
    company_number: string;
    registered_address: string;
    officers: { name: string; role: string; }[];
    url: string;
  }[];
  officer_matches: {
    name: string;
    role: string;
    company_name: string;
    url: string;
  }[];
  error?: string;
};

export async function searchOpenCorporates(
  profileId: number,
  leadId: number,
  fullName: string,
  companyName?: string
): Promise<OpenCorpResult> {
  const result: OpenCorpResult = { companies: [], officer_matches: [] };

  try {
    // Search officers by name
    const officers = await searchOfficers(fullName);
    result.officer_matches.push(...officers);

    // Search companies by name if provided
    if (companyName) {
      const companies = await searchCompanies(companyName);
      result.companies.push(...companies);
    }

    // Store officer role matches
    for (const officer of result.officer_matches) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "opencorporates",
        source_url: officer.url,
        source_label: `OpenCorp: ${officer.role} at ${officer.company_name}`,
        layer: "identity",
        data_key: "corporate_role",
        data_value: `${officer.role} — ${officer.company_name}`,
        confidence: 70,
        fetched_at: new Date().toISOString(),
      });
    }

    // Store company ownership signals
    for (const company of result.companies) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "opencorporates",
        source_url: company.url,
        source_label: `OpenCorp: ${company.name} (${company.jurisdiction})`,
        layer: "identity",
        data_key: "business_ownership",
        data_value: JSON.stringify({
          company: company.name,
          jurisdiction: company.jurisdiction,
          status: company.status,
          incorporated: company.incorporation_date,
        }),
        confidence: 75,
        fetched_at: new Date().toISOString(),
      });
    }

    // Calculate years active from oldest incorporation
    if (result.companies.length > 0) {
      const oldest = result.companies
        .filter(c => c.incorporation_date)
        .sort((a, b) => a.incorporation_date.localeCompare(b.incorporation_date))[0];
      if (oldest) {
        const years = Math.floor(
          (Date.now() - new Date(oldest.incorporation_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );
        if (years > 0) {
          addSource({
            profile_id: profileId,
            lead_id: leadId,
            source_type: "opencorporates",
            source_url: oldest.url,
            source_label: `Business history: ${years}+ years`,
            layer: "identity",
            data_key: "years_active",
            data_value: String(years),
            confidence: 70,
            fetched_at: new Date().toISOString(),
          });
        }
      }
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "opencorporates",
      companies_found: result.companies.length,
      officers_found: result.officer_matches.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "opencorporates", error: err.message,
    });
  }

  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function searchOfficers(name: string): Promise<OpenCorpResult["officer_matches"]> {
  if (!name || name.trim().length < 3) return [];

  try {
    const url = `${OC_BASE}/officers/search?q=${encodeURIComponent(name.trim())}&per_page=10`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const officers = data?.results?.officers || [];

    return officers.slice(0, 10).map((entry: any) => {
      const o = entry.officer;
      return {
        name: o.name || name,
        role: o.position || "Officer",
        company_name: o.company?.name || "Unknown",
        url: `https://opencorporates.com${o.opencorporates_url || ""}`,
      };
    });
  } catch {
    return [];
  }
}

async function searchCompanies(companyName: string): Promise<OpenCorpResult["companies"]> {
  if (!companyName || companyName.trim().length < 3) return [];

  try {
    const url = `${OC_BASE}/companies/search?q=${encodeURIComponent(companyName.trim())}&per_page=5`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const companies = data?.results?.companies || [];

    return companies.slice(0, 5).map((entry: any) => {
      const c = entry.company;
      return {
        name: c.name || companyName,
        jurisdiction: c.jurisdiction_code || "",
        status: c.current_status || "Unknown",
        incorporation_date: c.incorporation_date || "",
        company_number: c.company_number || "",
        registered_address: c.registered_address_in_full || "",
        officers: [],
        url: `https://opencorporates.com${c.opencorporates_url || ""}`,
      };
    });
  } catch {
    return [];
  }
}
