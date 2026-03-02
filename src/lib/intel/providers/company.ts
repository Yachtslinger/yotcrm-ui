/**
 * Company Intelligence Provider
 * Takes a discovered employer name and enriches with:
 *   - Revenue estimates (SEC EDGAR for public, web search for private)
 *   - Employee count
 *   - Industry/type
 *   - Founded year
 *   - Headquarters location
 *   - Website
 *   - Related people/executives
 *
 * Uses: OpenCorporates, SEC EDGAR, DuckDuckGo web search
 */

import { addSource, logAuditEvent, getSourcesByProfile } from "../storage";

export type CompanyResult = {
  companies: {
    name: string;
    role: string;
    source: string;
    revenue?: string;
    employees?: string;
    industry?: string;
    founded?: string;
    headquarters?: string;
    website?: string;
    source_url: string;
    type: "employer" | "owned" | "officer" | "associated";
  }[];
  error?: string;
};

export async function enrichCompanies(
  profileId: number,
  leadId: number,
  fullName: string,
): Promise<CompanyResult> {
  const result: CompanyResult = { companies: [] };

  try {
    const sources = getSourcesByProfile(profileId);
    const seenCompanies = new Set<string>();

    // Collect all company names from previous providers
    const companyNames: { name: string; role: string; type: CompanyResult["companies"][0]["type"] }[] = [];

    // FEC employer
    const employerSrc = sources.find(s => s.data_key === "employer" && s.source_type === "fec");
    if (employerSrc && employerSrc.data_value && !["SELF-EMPLOYED", "RETIRED", "SELF", "NONE", "N/A"].includes(employerSrc.data_value.toUpperCase())) {
      companyNames.push({ name: employerSrc.data_value, role: "Employee", type: "employer" });
    }

    // OpenCorporates businesses
    const bizSources = sources.filter(s => s.data_key === "business_ownership");
    for (const s of bizSources) {
      try {
        const biz = JSON.parse(s.data_value);
        if (biz.company && !seenCompanies.has(biz.company.toUpperCase())) {
          companyNames.push({ name: biz.company, role: "Owner/Principal", type: "owned" });
        }
      } catch { /* */ }
    }

    // Corporate roles from EDGAR/OpenCorp
    const roleSources = sources.filter(s => s.data_key === "corporate_role");
    for (const s of roleSources) {
      try {
        const role = JSON.parse(s.data_value);
        if (role.company) {
          companyNames.push({ name: role.company, role: role.title || "Officer", type: "officer" });
        }
      } catch {
        // Sometimes it's plain text "CEO at Company"
        const m = s.data_value.match(/(?:at|of|,)\s+(.+)/i);
        if (m) companyNames.push({ name: m[1].trim(), role: s.data_value.split(/\s+(?:at|of|,)/i)[0], type: "officer" });
      }
    }

    // Web-discovered companies
    const webCompanies = sources.filter(s => s.data_key === "web_company");
    for (const s of webCompanies) {
      if (s.data_value) companyNames.push({ name: s.data_value, role: "Associated", type: "associated" });
    }

    // Deduplicate and enrich top companies
    for (const co of companyNames.slice(0, 6)) {
      const upper = co.name.toUpperCase().trim();
      if (seenCompanies.has(upper) || upper.length < 2) continue;
      seenCompanies.add(upper);

      const details = await lookupCompanyDetails(co.name);
      const entry: CompanyResult["companies"][0] = {
        name: co.name,
        role: co.role,
        source: details.source || "enrichment",
        type: co.type,
        source_url: details.source_url || `https://www.google.com/search?q=${encodeURIComponent(co.name)}+company`,
        revenue: details.revenue,
        employees: details.employees,
        industry: details.industry,
        founded: details.founded,
        headquarters: details.headquarters,
        website: details.website,
      };

      result.companies.push(entry);

      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company",
        source_url: entry.source_url,
        source_label: `Company: ${co.name} (${co.role})${entry.revenue ? ` — Rev: ${entry.revenue}` : ""}${entry.employees ? ` — ${entry.employees} employees` : ""}`,
        layer: "capital", data_key: "company_profile",
        data_value: JSON.stringify(entry),
        confidence: details.source === "sec" ? 85 : details.source === "opencorp" ? 70 : 45,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "company",
      companies_enriched: result.companies.length,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "company", error: err.message });
  }

  return result;
}

// ─── Company Detail Lookup ──────────────────────────────────────────

type CompanyDetails = {
  revenue?: string;
  employees?: string;
  industry?: string;
  founded?: string;
  headquarters?: string;
  website?: string;
  source?: string;
  source_url?: string;
};

async function lookupCompanyDetails(companyName: string): Promise<CompanyDetails> {
  const details: CompanyDetails = {};

  // Try multiple sources in parallel
  const [secResult, ocResult, webResult] = await Promise.allSettled([
    searchSECForCompany(companyName),
    searchOpenCorpForCompany(companyName),
    searchWebForCompany(companyName),
  ]);

  // SEC EDGAR — most authoritative for public companies
  if (secResult.status === "fulfilled" && secResult.value) {
    Object.assign(details, secResult.value);
    details.source = "sec";
  }

  // OpenCorporates — fills in gaps
  if (ocResult.status === "fulfilled" && ocResult.value) {
    if (!details.headquarters) details.headquarters = ocResult.value.headquarters;
    if (!details.industry) details.industry = ocResult.value.industry;
    if (!details.source_url) details.source_url = ocResult.value.source_url;
    if (!details.source) details.source = "opencorp";
  }

  // Web search — catches everything else
  if (webResult.status === "fulfilled" && webResult.value) {
    if (!details.revenue) details.revenue = webResult.value.revenue;
    if (!details.employees) details.employees = webResult.value.employees;
    if (!details.industry) details.industry = webResult.value.industry;
    if (!details.founded) details.founded = webResult.value.founded;
    if (!details.website) details.website = webResult.value.website;
    if (!details.headquarters) details.headquarters = webResult.value.headquarters;
    if (!details.source) details.source = "web";
    if (!details.source_url) details.source_url = webResult.value.source_url;
  }

  return details;
}

async function searchSECForCompany(name: string): Promise<CompanyDetails | null> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(name)}%22&dateRange=custom&startdt=2020-01-01&forms=10-K,10-Q&from=0&size=3`;
    const res = await fetch(url, {
      headers: { "User-Agent": "YotCRM/1.0 (yacht brokerage CRM)", "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data.hits?.hits || [];
    if (hits.length === 0) return null;

    const filing = hits[0]._source || {};
    return {
      source_url: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(name)}&CIK=&type=10-K&dateb=&owner=include&count=10&search_text=&action=getcompany`,
    };
  } catch { return null; }
}

async function searchOpenCorpForCompany(name: string): Promise<CompanyDetails | null> {
  try {
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(name)}&per_page=3`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const companies = data.results?.companies || [];
    if (companies.length === 0) return null;

    const co = companies[0].company;
    return {
      headquarters: [co.registered_address_in_full, co.jurisdiction_code].filter(Boolean).join(", "),
      industry: co.industry_codes?.[0]?.description,
      source_url: co.opencorporates_url || `https://opencorporates.com/companies?q=${encodeURIComponent(name)}`,
    };
  } catch { return null; }
}

async function searchWebForCompany(name: string): Promise<CompanyDetails | null> {
  try {
    const query = `"${name}" company revenue employees founded`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const details: CompanyDetails = {};

    // Extract snippets
    const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/a>/gs;
    let match;
    const allText: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      allText.push(match[1].replace(/<[^>]*>/g, ""));
    }
    const text = allText.join(" ").toLowerCase();

    // Revenue patterns
    const revMatch = text.match(/revenue[^.]*?\$[\d,.]+\s*(?:billion|million|B|M)/i)
      || text.match(/\$[\d,.]+\s*(?:billion|million|B|M)[^.]*?revenue/i);
    if (revMatch) details.revenue = revMatch[0].trim().substring(0, 60);

    // Employee count
    const empMatch = text.match(/(\d[\d,]+)\s*(?:\+\s*)?employees/i)
      || text.match(/(?:employs?|workforce|staff|team)[^.]*?(\d[\d,]+)/i);
    if (empMatch) details.employees = empMatch[1].replace(/,/g, "");

    // Founded year
    const foundedMatch = text.match(/founded\s*(?:in\s*)?(\d{4})/i)
      || text.match(/(?:established|est\.?|since)\s*(\d{4})/i);
    if (foundedMatch) details.founded = foundedMatch[1];

    // Industry
    const indMatch = text.match(/(?:is a|is an|leading)\s+([a-zA-Z\s]+?)\s+(?:company|firm|corporation|agency|group)/i);
    if (indMatch) details.industry = indMatch[1].trim().substring(0, 40);

    // Website from results
    const urlMatch = html.match(/href="([^"]*)"[^>]*class="result__url"/);
    if (urlMatch) details.website = urlMatch[1];

    // Headquarters
    const hqMatch = text.match(/(?:headquartered|based|hq)\s+(?:in|at)\s+([A-Z][a-zA-Z\s]+?,\s*[A-Z]{2})/);
    if (hqMatch) details.headquarters = hqMatch[1];

    details.source_url = `https://duckduckgo.com/?q=${encodeURIComponent(name + " company")}`;
    return details;
  } catch { return null; }
}
