/**
 * SEC EDGAR Provider
 * Searches SEC's free EDGAR full-text search for corporate filings.
 * Identifies executive roles, company affiliations, and public company connections.
 * API docs: https://efts.sec.gov/LATEST/search-index?q=...
 */

import { addSource, logAuditEvent } from "../storage";

const EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_COMPANY_URL = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_USER_AGENT = "YotCRM/1.0 (wn@denisonyachting.com)"; // SEC requires User-Agent

export type EDGARResult = {
  filings: {
    company: string;
    cik: string;
    form_type: string;     // "10-K", "DEF 14A", "SC 13D", etc.
    filed_date: string;
    description: string;
    url: string;
  }[];
  roles_detected: {
    company: string;
    role: string;
    source_url: string;
  }[];
  error?: string;
};

export async function searchEDGAR(
  profileId: number,
  leadId: number,
  fullName: string,
  companyName?: string
): Promise<EDGARResult> {
  const result: EDGARResult = { filings: [], roles_detected: [] };

  try {
    // Search by person name in full-text search
    const personHits = await queryEDGAR(fullName);
    result.filings.push(...personHits);

    // Search by company name if provided
    if (companyName) {
      const companyHits = await queryEDGARCompany(companyName);
      result.filings.push(...companyHits);
    }

    // Detect executive roles from proxy statements and insider filings
    for (const filing of result.filings) {
      const formLower = filing.form_type.toUpperCase();
      if (["DEF 14A", "DEFA14A", "SC 13D", "SC 13G", "3", "4", "5"].includes(formLower)) {
        result.roles_detected.push({
          company: filing.company,
          role: detectRoleFromForm(formLower),
          source_url: filing.url,
        });
      }
    }

    // Store enrichment sources
    for (const role of result.roles_detected) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "sec_edgar",
        source_url: role.source_url,
        source_label: `SEC: ${role.role} at ${role.company}`,
        layer: "identity",
        data_key: "corporate_role",
        data_value: `${role.role} — ${role.company}`,
        confidence: 85,
        fetched_at: new Date().toISOString(),
      });
    }

    // If company filings found, that's a business ownership signal
    if (companyName && result.filings.some(f => f.company.toLowerCase().includes(companyName.toLowerCase().slice(0, 10)))) {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "sec_edgar",
        source_url: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=&dateb=&owner=include&count=10&search_text=&action=getcompany`,
        source_label: `SEC: ${companyName} has SEC filings`,
        layer: "identity",
        data_key: "business_ownership",
        data_value: JSON.stringify({ company: companyName, sec_registered: true }),
        confidence: 90,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "sec_edgar",
      filings_found: result.filings.length,
      roles_detected: result.roles_detected.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "sec_edgar", error: err.message,
    });
  }

  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function queryEDGAR(personName: string): Promise<EDGARResult["filings"]> {
  if (!personName || personName.trim().length < 3) return [];

  try {
    // EDGAR full-text search API
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(personName.trim())}%22&dateRange=custom&startdt=2010-01-01&forms=DEF+14A,SC+13D,SC+13G,3,4,5&hits.hits.total.value=true`;
    const response = await fetch(url, {
      headers: { "User-Agent": EDGAR_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Try the EDGAR full-text search v2
      return await queryEDGARFullText(personName);
    }

    const data = await response.json();
    const hits = data?.hits?.hits || [];

    return hits.slice(0, 10).map((hit: any) => ({
      company: hit._source?.display_names?.[0] || hit._source?.entity_name || "Unknown",
      cik: hit._source?.entity_id || "",
      form_type: hit._source?.form_type || "",
      filed_date: hit._source?.file_date || "",
      description: hit._source?.display_description || "",
      url: `https://www.sec.gov/Archives/edgar/data/${hit._source?.entity_id || ""}/${hit._id || ""}`,
    }));
  } catch {
    return await queryEDGARFullText(personName);
  }
}

async function queryEDGARFullText(personName: string): Promise<EDGARResult["filings"]> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(personName)}%22&from=0&size=10`;
    const response = await fetch(url, {
      headers: { "User-Agent": EDGAR_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const hits = data?.hits?.hits || [];
    return hits.slice(0, 10).map((hit: any) => ({
      company: hit._source?.display_names?.[0] || hit._source?.entity_name || "Unknown",
      cik: hit._source?.entity_id || "",
      form_type: hit._source?.form_type || "",
      filed_date: hit._source?.file_date || "",
      description: hit._source?.display_description || "",
      url: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${hit._source?.entity_id || ""}&type=&dateb=&owner=include&count=10`,
    }));
  } catch {
    return [];
  }
}

async function queryEDGARCompany(companyName: string): Promise<EDGARResult["filings"]> {
  if (!companyName || companyName.trim().length < 3) return [];

  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName.trim())}%22&from=0&size=5`;
    const response = await fetch(url, {
      headers: { "User-Agent": EDGAR_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const hits = data?.hits?.hits || [];
    return hits.slice(0, 5).map((hit: any) => ({
      company: hit._source?.display_names?.[0] || companyName,
      cik: hit._source?.entity_id || "",
      form_type: hit._source?.form_type || "",
      filed_date: hit._source?.file_date || "",
      description: hit._source?.display_description || "",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=&dateb=&owner=include&count=10&search_text=&action=getcompany`,
    }));
  } catch {
    return [];
  }
}

function detectRoleFromForm(formType: string): string {
  switch (formType) {
    case "DEF 14A":
    case "DEFA14A":
      return "Executive/Director (Proxy Statement)";
    case "SC 13D":
      return "Beneficial Owner >5% (Active Investor)";
    case "SC 13G":
      return "Beneficial Owner >5% (Passive)";
    case "3":
      return "Initial Insider Filing (Officer/Director)";
    case "4":
      return "Insider Transaction (Officer/Director)";
    case "5":
      return "Annual Insider Filing";
    default:
      return "SEC Filer";
  }
}
