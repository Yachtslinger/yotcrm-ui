/**
 * Re-Verification & Deep Dive Provider (Phase 4)
 *
 * After Phase 1-3 collect initial data, this provider:
 * 1. Runs targeted searches using DISCOVERED employer, city, title
 * 2. Cross-confirms identity across multiple queries
 * 3. Discovers additional properties, relatives, professional history
 * 4. Extracts age, DOB, spouse from people-search-style results
 * 5. Finds court records, liens, judgments
 *
 * This is the "landlord background check" layer.
 */

import { addSource, logAuditEvent, getSourcesByProfile } from "../storage";

export type ReverifyResult = {
  confirmations: { field: string; original: string; confirmed: boolean; new_value?: string; source: string }[];
  additional_addresses: string[];
  additional_properties: { address: string; estimated_value?: string; type?: string }[];
  relatives: string[];
  court_records: { type: string; description: string; date?: string; court?: string; url?: string }[];
  professional_history: { title: string; company: string; years?: string }[];
  age_estimates: string[];
  error?: string;
};

export async function reverifyAndDeepDive(
  profileId: number,
  leadId: number,
  fullName: string,
  email?: string,
): Promise<ReverifyResult> {
  const result: ReverifyResult = {
    confirmations: [],
    additional_addresses: [],
    additional_properties: [],
    relatives: [],
    court_records: [],
    professional_history: [],
    age_estimates: [],
  };

  try {
    // Gather all Phase 1-3 discovered data
    const sources = getSourcesByProfile(profileId);
    const byKey = new Map<string, any[]>();
    for (const s of sources) {
      const list = byKey.get(s.data_key) || [];
      list.push(s);
      byKey.set(s.data_key, list);
    }

    const employer = byKey.get("employer")?.[0]?.data_value || "";
    const occupation = byKey.get("occupation")?.[0]?.data_value || "";
    const locationSrc = byKey.get("location")?.[0];
    let city = "", state = "", zip = "";
    if (locationSrc) {
      try { const l = JSON.parse(locationSrc.data_value); city = l.city; state = l.state; zip = l.zip; } catch {}
    }
    const webTitles = (byKey.get("web_title") || []).map(s => s.data_value);
    const webCompanies = (byKey.get("web_company") || []).map(s => s.data_value);
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts[nameParts.length - 1] || "";

    // ═══ 1. TARGETED IDENTITY CONFIRMATION SEARCHES ═══
    // Use discovered data to run very specific searches that confirm identity
    const targetedQueries: string[] = [];

    // Search with name + employer (most reliable confirmation)
    if (employer && !["SELF-EMPLOYED","RETIRED","SELF","NONE","N/A","NOT EMPLOYED"].includes(employer.toUpperCase())) {
      targetedQueries.push(`"${fullName}" "${employer}"`);
    }
    // Search with name + city
    if (city) {
      targetedQueries.push(`"${fullName}" "${city}" "${state}"`);
    }
    // Search with name + discovered title
    if (webTitles.length > 0) {
      targetedQueries.push(`"${fullName}" "${webTitles[0]}"`);
    }

    // Run targeted confirmation searches
    const confirmResults = await Promise.allSettled(
      targetedQueries.map(q => duckDuckGoSearch(q))
    );

    let allConfirmSnippets: string[] = [];
    for (const cr of confirmResults) {
      if (cr.status === "fulfilled" && cr.value) {
        for (const r of cr.value) {
          allConfirmSnippets.push(`${r.title} ${r.snippet}`);
        }
      }
    }
    const confirmText = allConfirmSnippets.join(" ");

    // Confirm employer
    if (employer) {
      const confirmed = confirmText.toLowerCase().includes(employer.toLowerCase().split(/\s+/)[0]);
      result.confirmations.push({
        field: "employer", original: employer, confirmed,
        source: confirmed ? "targeted web search" : "unconfirmed",
      });
    }
    // Confirm location
    if (city) {
      const confirmed = confirmText.toLowerCase().includes(city.toLowerCase());
      result.confirmations.push({
        field: "location", original: `${city}, ${state}`, confirmed,
        source: confirmed ? "targeted web search" : "unconfirmed",
      });
    }

    // ═══ 2. PEOPLE SEARCH — AGE, RELATIVES, ADDRESSES ═══
    const peopleQueries = [
      `"${fullName}" age address relatives`,
      `"${firstName}" "${lastName}" ${city || ""} ${state || ""} property records owner`,
    ];

    const peopleResults = await Promise.allSettled(
      peopleQueries.map(q => duckDuckGoSearch(q))
    );

    for (const pr of peopleResults) {
      if (pr.status !== "fulfilled" || !pr.value) continue;
      for (const r of pr.value) {
        const text = `${r.title} ${r.snippet}`;

        // Age extraction (multiple patterns)
        const agePatterns = [
          /(?:age|aged)\s+(\d{2,3})/i,
          /(\d{2,3})\s*(?:year|yr)s?\s*old/i,
          /\bborn\s+(?:in\s+)?(\d{4})\b/i,
          /\((\d{2,3})\)/,  // "John Smith (65)"
        ];
        for (const ap of agePatterns) {
          const am = text.match(ap);
          if (am) {
            const val = am[1];
            if (val.length === 4) {
              const birthYear = parseInt(val);
              if (birthYear > 1920 && birthYear < 2010) {
                const age = new Date().getFullYear() - birthYear;
                result.age_estimates.push(`Born ${birthYear} (age ~${age})`);
              }
            } else {
              const age = parseInt(val);
              if (age >= 18 && age <= 110) {
                result.age_estimates.push(`Age ${age}`);
              }
            }
          }
        }

        // Relatives / family members
        const relPatterns = [
          /(?:related to|relatives?|family)\s*:?\s*([A-Z][a-z]+\s+(?:[A-Z][a-z]+\s*){1,3})/gi,
          /(?:wife|husband|spouse|daughter|son|brother|sister|mother|father)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\((?:wife|husband|spouse|daughter|son)\)/gi,
        ];
        for (const rp of relPatterns) {
          let rm;
          while ((rm = rp.exec(text)) !== null) {
            const rel = rm[1]?.trim();
            if (rel && rel.length > 3 && rel.length < 40 && !result.relatives.includes(rel)) {
              result.relatives.push(rel);
            }
          }
        }

        // Additional addresses
        const addrPatterns = [
          /(\d+\s+[A-Z][a-zA-Z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Cir|Ter)[.,]?\s+[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\s*\d{5})/g,
          /(?:lives|lived|resides|resided|address)[^.]*?(?:in|at)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)/gi,
        ];
        for (const adp of addrPatterns) {
          let am;
          while ((am = adp.exec(text)) !== null) {
            const addr = am[1]?.trim();
            if (addr && addr.length > 5 && !result.additional_addresses.includes(addr)) {
              result.additional_addresses.push(addr);
            }
          }
        }
      }
    }

    // ═══ 3. COURT RECORDS & LITIGATION ═══
    const courtQueries = [
      `"${fullName}" court case lawsuit judgment`,
      `"${fullName}" bankruptcy lien foreclosure`,
      `"${lastName}" ${state || ""} court records docket`,
    ];

    const courtResults = await Promise.allSettled(
      courtQueries.map(q => duckDuckGoSearch(q))
    );

    for (const cr of courtResults) {
      if (cr.status !== "fulfilled" || !cr.value) continue;
      for (const r of cr.value) {
        const text = `${r.title} ${r.snippet}`.toLowerCase();
        const nameInResult = text.includes(lastName.toLowerCase());
        if (!nameInResult) continue;

        let recordType = "";
        if (/bankrupt/i.test(text)) recordType = "Bankruptcy";
        else if (/foreclos/i.test(text)) recordType = "Foreclosure";
        else if (/lien|tax lien/i.test(text)) recordType = "Lien";
        else if (/judgment|judgement/i.test(text)) recordType = "Judgment";
        else if (/lawsuit|sued|plaintiff|defendant/i.test(text)) recordType = "Lawsuit";
        else if (/court|docket|case\s*#|filing/i.test(text)) recordType = "Court Filing";
        else continue;

        // Extract date
        const dateMatch = r.snippet.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/);
        // Extract court name
        const courtMatch = r.snippet.match(/(?:in the|before|court of)\s+([A-Z][A-Za-z\s]+(?:Court|District|Circuit|County))/i);

        const existing = result.court_records.find(c => c.description === r.title);
        if (!existing) {
          result.court_records.push({
            type: recordType,
            description: r.title.substring(0, 200),
            date: dateMatch?.[1] || undefined,
            court: courtMatch?.[1]?.trim() || undefined,
            url: r.url,
          });
        }
      }
    }

    // ═══ 4. MULTI-PROPERTY DISCOVERY ═══
    // Search for all discovered addresses + any new ones
    const allAddresses = [...new Set([
      ...(city ? [`${city}, ${state} ${zip}`] : []),
      ...result.additional_addresses,
    ])];

    for (const addr of allAddresses.slice(0, 4)) {
      const propQuery = `"${fullName}" "${addr}" property home value`;
      const propResults = await duckDuckGoSearch(propQuery);
      for (const r of propResults) {
        const text = `${r.title} ${r.snippet}`;
        const valueMatch = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|M|k|K))?/);
        if (valueMatch) {
          const val = parseMoneyValue(valueMatch[0]);
          if (val >= 50000 && val <= 500000000) {
            const existing = result.additional_properties.find(p => p.address === addr);
            if (!existing) {
              result.additional_properties.push({
                address: addr,
                estimated_value: valueMatch[0].trim(),
                type: /condo/i.test(text) ? "Condo" : /apartment/i.test(text) ? "Apartment" : /commercial/i.test(text) ? "Commercial" : "Residential",
              });
            }
          }
        }
      }
    }

    // ═══ 5. PROFESSIONAL HISTORY ═══
    const historyQuery = `"${fullName}" "previously" OR "formerly" OR "prior to" OR "career" OR "experience" OR "resume"`;
    const historyResults = await duckDuckGoSearch(historyQuery);
    for (const r of historyResults) {
      const text = `${r.title} ${r.snippet}`;
      // "Previously CEO of X" / "Former VP at Y" / "spent 10 years at Z"
      const histPatterns = [
        /(?:previously|formerly|former|past|prior|was)\s+(\w+(?:\s+\w+)?)\s+(?:of|at|for)\s+([A-Z][A-Za-z\s&]+?)(?:\.|,|;|\s+(?:from|for|before|and|where))/gi,
        /(?:spent|worked)\s+(\d+)\s+years?\s+(?:at|with)\s+([A-Z][A-Za-z\s&]+?)(?:\.|,|;)/gi,
      ];
      for (const hp of histPatterns) {
        let hm;
        while ((hm = hp.exec(text)) !== null) {
          const title = hm[1]?.trim();
          const company = hm[2]?.trim();
          if (title && company && company.length > 2 && company.length < 60) {
            const existing = result.professional_history.find(p =>
              p.company.toLowerCase() === company.toLowerCase()
            );
            if (!existing) {
              result.professional_history.push({ title, company });
            }
          }
        }
      }
    }

    // ═══ 6. STORE ALL DISCOVERED DATA ═══
    // Confirmations
    for (const conf of result.confirmations) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `✓ ${conf.field}: ${conf.confirmed ? "CONFIRMED" : "UNCONFIRMED"} — ${conf.original}`,
        layer: "identity", data_key: "reverify_confirmation",
        data_value: JSON.stringify(conf),
        confidence: conf.confirmed ? 80 : 20,
        fetched_at: new Date().toISOString(),
      });
    }

    // Court records
    for (const cr of result.court_records.slice(0, 8)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: cr.url || "",
        source_label: `Court: ${cr.type} — ${cr.description.substring(0, 80)}`,
        layer: "risk", data_key: "court_record",
        data_value: JSON.stringify(cr),
        confidence: 50,
        fetched_at: new Date().toISOString(),
      });
    }

    // Additional properties
    for (const prop of result.additional_properties.slice(0, 5)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `Property: ${prop.address}${prop.estimated_value ? ` — Est. ${prop.estimated_value}` : ""}`,
        layer: "capital", data_key: "additional_property",
        data_value: JSON.stringify(prop),
        confidence: prop.estimated_value ? 45 : 30,
        fetched_at: new Date().toISOString(),
      });
    }

    // Relatives
    for (const rel of [...new Set(result.relatives)].slice(0, 6)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `Relative/Associate: ${rel}`,
        layer: "identity", data_key: "relative",
        data_value: rel,
        confidence: 35,
        fetched_at: new Date().toISOString(),
      });
    }

    // Age estimates (deduplicate)
    const uniqueAges = [...new Set(result.age_estimates)];
    if (uniqueAges.length > 0) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `Age: ${uniqueAges[0]}`,
        layer: "identity", data_key: "person_age",
        data_value: uniqueAges[0],
        confidence: uniqueAges.length > 1 ? 60 : 35,
        fetched_at: new Date().toISOString(),
      });
    }

    // Professional history
    for (const ph of result.professional_history.slice(0, 5)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `Career: ${ph.title} at ${ph.company}${ph.years ? ` (${ph.years})` : ""}`,
        layer: "identity", data_key: "professional_history",
        data_value: JSON.stringify(ph),
        confidence: 40,
        fetched_at: new Date().toISOString(),
      });
    }

    // Additional addresses
    for (const addr of [...new Set(result.additional_addresses)].slice(0, 5)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "reverify", source_url: "",
        source_label: `Address: ${addr}`,
        layer: "identity", data_key: "secondary_address",
        data_value: addr,
        confidence: 35,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "reverify",
      confirmations: result.confirmations.length,
      confirmed: result.confirmations.filter(c => c.confirmed).length,
      court_records: result.court_records.length,
      properties: result.additional_properties.length,
      relatives: result.relatives.length,
      addresses: result.additional_addresses.length,
      age_found: result.age_estimates.length > 0,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "reverify", error: err.message });
  }

  return result;
}

// ─── DuckDuckGo Search Helper ───────────────────────────────────────

async function duckDuckGoSearch(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: { title: string; url: string; snippet: string }[] = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
      const rawUrl = decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, ""));
      const title = match[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
      const snippet = match[3].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
      if (title && rawUrl.startsWith("http")) {
        results.push({ title, url: rawUrl, snippet });
      }
    }

    // Fallback regex
    if (results.length === 0) {
      const altRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = altRegex.exec(html)) !== null && results.length < 10) {
        const rawUrl = match[1];
        const title = match[2].replace(/<[^>]*>/g, "").trim();
        if (title && rawUrl.startsWith("http") && !rawUrl.includes("duckduckgo")) {
          results.push({ title, url: rawUrl, snippet: "" });
        }
      }
    }
    return results;
  } catch { return []; }
}

function parseMoneyValue(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[$,]/g, "").trim().toLowerCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.includes("billion") || cleaned.includes("b")) return num * 1000000000;
  if (cleaned.includes("million") || cleaned.includes("m")) return num * 1000000;
  if (cleaned.includes("k")) return num * 1000;
  return num;
}
