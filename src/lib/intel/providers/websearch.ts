/**
 * Web Search Intelligence Provider
 * Scrapes public search results to find:
 *   - Company bios and about pages
 *   - Press releases and media mentions
 *   - Board memberships and affiliations
 *   - Yacht club memberships
 *   - Charity and nonprofit involvement
 *   - Professional profiles beyond social media
 *   - Real estate mentions
 *
 * Uses DuckDuckGo HTML search (no API key required)
 */

import { addSource, logAuditEvent } from "../storage";

export type WebSearchResult = {
  results: {
    title: string;
    url: string;
    snippet: string;
    category: string; // "bio", "press", "board", "yacht", "charity", "realestate", "other"
  }[];
  extracted: {
    possible_titles: string[];
    possible_companies: string[];
    possible_locations: string[];
    yacht_club: string[];
    charity_boards: string[];
    net_worth_signals: string[];
    spouse_name?: string;
    age?: string;
    birth_year?: string;
    date_of_birth?: string;
    secondary_addresses: string[];
  };
  error?: string;
};

export async function searchWeb(
  profileId: number,
  leadId: number,
  fullName: string,
  email?: string,
): Promise<WebSearchResult> {
  const result: WebSearchResult = {
    results: [],
    extracted: {
      possible_titles: [],
      possible_companies: [],
      possible_locations: [],
      yacht_club: [],
      charity_boards: [],
      net_worth_signals: [],
      secondary_addresses: [],
    },
  };

  try {
    // Run multiple targeted searches in parallel
    const queries = [
      `"${fullName}"`,                           // Exact name match
      `"${fullName}" CEO OR president OR founder OR chairman OR director`,  // Executive roles
      `"${fullName}" yacht OR boat OR marina OR vessel`,    // Yacht/boating connections
      `"${fullName}" charity OR foundation OR board OR trustee`, // Philanthropy
      `"${fullName}" real estate OR property OR home`,      // Property signals
      `"${fullName}" wife OR husband OR spouse OR married OR age OR born`,  // Personal details
    ];

    const searchPromises = queries.map(q => duckDuckGoSearch(q));
    const searchResults = await Promise.allSettled(searchPromises);

    const allResults: { title: string; url: string; snippet: string }[] = [];
    const seenUrls = new Set<string>();

    for (const sr of searchResults) {
      if (sr.status === "fulfilled" && sr.value) {
        for (const r of sr.value) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            allResults.push(r);
          }
        }
      }
    }

    // Categorize and extract intelligence from results
    for (const r of allResults) {
      const text = `${r.title} ${r.snippet}`.toLowerCase();
      let category = "other";

      if (/ceo|president|founder|chairman|managing director|partner|cfo|cto|coo|executive/.test(text)) {
        category = "bio";
        extractTitlesAndCompanies(r.title + " " + r.snippet, result.extracted);
      } else if (/press release|announces|appointed|named|joins/.test(text)) {
        category = "press";
        extractTitlesAndCompanies(r.title + " " + r.snippet, result.extracted);
      } else if (/board|trustee|director|advisory|committee/.test(text)) {
        category = "board";
        if (/charit|foundation|nonprofit|non-profit/.test(text)) {
          const org = extractOrgName(r.title, r.snippet);
          if (org) result.extracted.charity_boards.push(org);
        }
      } else if (/yacht|boat|marina|vessel|sailing|regatta/.test(text)) {
        category = "yacht";
        const club = extractYachtClub(text);
        if (club) result.extracted.yacht_club.push(club);
      } else if (/charit|foundation|philanthrop|donor|gala/.test(text)) {
        category = "charity";
      } else if (/real estate|property|home|mansion|penthouse|acre/.test(text)) {
        category = "realestate";
        if (/\$[\d,.]+\s*(million|m|billion|b)/i.test(text)) {
          const match = text.match(/\$[\d,.]+\s*(million|m|billion|b)/i);
          if (match) result.extracted.net_worth_signals.push(match[0]);
        }
      }

      // Net worth / wealth signals from any category
      if (/net worth|fortune|wealth|billionaire|millionaire|\$\d+\s*(million|billion)/.test(text)) {
        const wMatch = text.match(/(?:net worth|fortune|wealth)[^.]*?\$[\d,.]+\s*(?:million|billion|m|b)/i);
        if (wMatch) result.extracted.net_worth_signals.push(wMatch[0]);
      }

      // Location extraction
      const locMatch = r.snippet.match(/(?:based in|located in|lives in|from|of)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
      if (locMatch) result.extracted.possible_locations.push(locMatch[1]);

      // Personal details extraction
      const nameParts = fullName.split(/\s+/);
      const lastName = nameParts[nameParts.length - 1] || "";

      // Spouse detection
      const spousePatterns = [
        new RegExp(`${lastName}[^.]{0,50}(?:wife|husband|spouse|married to|partner)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, "i"),
        new RegExp(`(?:wife|husband|spouse|married to)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)[^.]{0,30}${lastName}`, "i"),
        new RegExp(`(?:his wife|her husband|his spouse|her spouse|married to)\\s+([A-Z][a-z]+(?:\\s+(?:[A-Z][a-z]+|${lastName}))?)`, "i"),
      ];
      for (const sp of spousePatterns) {
        const sm = r.snippet.match(sp);
        if (sm && sm[1].length > 2 && sm[1].length < 40) {
          if (!result.extracted.spouse_name) result.extracted.spouse_name = sm[1].trim();
          break;
        }
      }

      // Age / born year detection
      const agePatterns = [
        /(?:age|aged)\s+(\d{2,3})/i,
        /(\d{2,3})[- ]year[- ]old/i,
        /\bborn\s+(?:in\s+)?(\d{4})\b/i,
        /\b(?:born|b\.)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      ];
      for (const ap of agePatterns) {
        const am = r.snippet.match(ap);
        if (am) {
          const val = am[1];
          if (val.length === 4 && parseInt(val) > 1920 && parseInt(val) < 2010) {
            if (!result.extracted.birth_year) result.extracted.birth_year = val;
          } else if (val.length <= 3 && parseInt(val) > 18 && parseInt(val) < 110) {
            if (!result.extracted.age) result.extracted.age = val;
          } else if (val.includes(",") || val.match(/[A-Z]/)) {
            if (!result.extracted.date_of_birth) result.extracted.date_of_birth = val;
          }
          break;
        }
      }

      // Secondary address / second home detection
      const addrPatterns = [
        /(?:also (?:lives|resides)|second home|vacation home|winter home|summer home)[^.]*?(?:in|at)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i,
        /(?:homes? in)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})\s+and\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i,
      ];
      for (const adp of addrPatterns) {
        const adm = r.snippet.match(adp);
        if (adm) {
          if (adm[1]) result.extracted.secondary_addresses.push(adm[1].trim());
          if (adm[2]) result.extracted.secondary_addresses.push(adm[2].trim());
        }
      }

      result.results.push({ ...r, category });
    }

    // Store extracted intelligence as enrichment sources
    const { extracted } = result;

    // Store executive titles/companies found
    for (const title of [...new Set(extracted.possible_titles)].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: result.results[0]?.url || "",
        source_label: `Web: Title — ${title}`,
        layer: "identity", data_key: "web_title",
        data_value: title, confidence: 45,
        fetched_at: new Date().toISOString(),
      });
    }
    for (const company of [...new Set(extracted.possible_companies)].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: result.results[0]?.url || "",
        source_label: `Web: Company — ${company}`,
        layer: "identity", data_key: "web_company",
        data_value: company, confidence: 40,
        fetched_at: new Date().toISOString(),
      });
    }
    // Yacht club memberships
    for (const club of [...new Set(extracted.yacht_club)].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Yacht Club — ${club}`,
        layer: "engagement", data_key: "yacht_club",
        data_value: club, confidence: 50,
        fetched_at: new Date().toISOString(),
      });
    }
    // Charity board memberships
    for (const board of [...new Set(extracted.charity_boards)].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Board Member — ${board}`,
        layer: "capital", data_key: "charity_board",
        data_value: board, confidence: 45,
        fetched_at: new Date().toISOString(),
      });
    }
    // Net worth / wealth signals
    for (const signal of [...new Set(extracted.net_worth_signals)].slice(0, 2)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Wealth Signal — ${signal}`,
        layer: "capital", data_key: "wealth_signal",
        data_value: signal, confidence: 35,
        fetched_at: new Date().toISOString(),
      });
    }
    // Store top search results as general web presence
    for (const r of result.results.filter(r => r.category !== "other").slice(0, 8)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: r.url,
        source_label: `Web: ${r.title.substring(0, 100)}`,
        layer: "identity", data_key: "web_mention",
        data_value: JSON.stringify({ title: r.title, snippet: r.snippet, category: r.category }),
        confidence: 40, fetched_at: new Date().toISOString(),
      });
    }

    // Personal details found via web search
    if (extracted.spouse_name) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Spouse — ${extracted.spouse_name}`,
        layer: "identity", data_key: "spouse_name",
        data_value: extracted.spouse_name, confidence: 35,
        fetched_at: new Date().toISOString(),
      });
    }
    if (extracted.age) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Age — ${extracted.age}`,
        layer: "identity", data_key: "person_age",
        data_value: extracted.age, confidence: 30,
        fetched_at: new Date().toISOString(),
      });
    }
    if (extracted.birth_year) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Born — ${extracted.birth_year}`,
        layer: "identity", data_key: "date_of_birth",
        data_value: extracted.birth_year, confidence: 30,
        fetched_at: new Date().toISOString(),
      });
    }
    if (extracted.date_of_birth) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: DOB — ${extracted.date_of_birth}`,
        layer: "identity", data_key: "date_of_birth",
        data_value: extracted.date_of_birth, confidence: 35,
        fetched_at: new Date().toISOString(),
      });
    }
    for (const addr of [...new Set(extracted.secondary_addresses)].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Address — ${addr}`,
        layer: "identity", data_key: "secondary_address",
        data_value: addr, confidence: 30,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "websearch",
      total_results: result.results.length,
      categories: Object.fromEntries(
        ["bio", "press", "board", "yacht", "charity", "realestate"]
          .map(c => [c, result.results.filter(r => r.category === c).length])
      ),
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "websearch", error: err.message });
  }

  return result;
}

// ─── DuckDuckGo HTML Search ─────────────────────────────────────────

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
    // Parse DuckDuckGo HTML results
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
      const rawUrl = decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, ""));
      const title = stripHtml(match[2]);
      const snippet = stripHtml(match[3]);
      if (title && rawUrl.startsWith("http")) {
        results.push({ title, url: rawUrl, snippet });
      }
    }

    // Fallback: simpler regex pattern
    if (results.length === 0) {
      const altRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = altRegex.exec(html)) !== null && results.length < 10) {
        const rawUrl = match[1];
        const title = stripHtml(match[2]);
        if (title && rawUrl.startsWith("http") && !rawUrl.includes("duckduckgo")) {
          results.push({ title, url: rawUrl, snippet: "" });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
}

// ─── Intelligence Extraction Helpers ────────────────────────────────

function extractTitlesAndCompanies(text: string, extracted: WebSearchResult["extracted"]) {
  // Extract titles like "CEO of X", "President at Y", "Founder, Z"
  const titlePatterns = [
    /\b(CEO|CFO|CTO|COO|President|Chairman|Founder|Partner|Managing Director|Director|VP|Vice President|Principal|Owner)\s+(?:of|at|,)\s+([A-Z][A-Za-z\s&.,]+?)(?:\.|,|\s-\s|$)/gi,
    /\b([A-Z][A-Za-z\s&.,]+?)\s+(?:CEO|CFO|CTO|COO|President|Chairman|Founder|Partner)\b/gi,
  ];

  for (const pattern of titlePatterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const title = m[1].trim();
      const company = (m[2] || "").trim().replace(/[.,]+$/, "");
      if (title.length > 2 && title.length < 40) extracted.possible_titles.push(title);
      if (company.length > 2 && company.length < 60) extracted.possible_companies.push(company);
    }
  }
}

function extractOrgName(title: string, snippet: string): string | null {
  const text = title + " " + snippet;
  const m = text.match(/(?:board (?:of|member)|trustee|director)[^.]*?(?:of|at|for)\s+(?:the\s+)?([A-Z][A-Za-z\s&]+?)(?:\.|,|$)/i);
  return m ? m[1].trim().substring(0, 60) : null;
}

function extractYachtClub(text: string): string | null {
  const m = text.match(/([A-Z][A-Za-z\s]+(?:yacht|sailing|boat|marina|nautical)[A-Za-z\s]*(?:club|association|society))/i);
  return m ? m[1].trim().substring(0, 60) : null;
}
