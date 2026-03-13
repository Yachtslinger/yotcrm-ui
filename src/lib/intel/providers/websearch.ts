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
import { type IdentityAnchors, validateAgainstAnchors, buildSmartQueries } from "../validation";
import { ddgSearch } from "./ddg";

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
    education: string[];
    clubs: string[];
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
  anchors?: IdentityAnchors,
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
      education: [],
      clubs: [],
      secondary_addresses: [],
    },
  };

  try {
    // Build smart queries using all available identity anchors
    const smartQueries = anchors ? buildSmartQueries(anchors) : [];

    // Core targeted searches — anchored to location/employer when possible
    const cityState = anchors?.city && anchors?.state ? ` "${anchors.city}" "${anchors.state}"` : "";
    // Company/employer name for disambiguation (the single best query pattern)
    const companyQ = anchors?.employer && anchors.employer.length > 3 ? ` "${anchors.employer}"` : 
                     anchors?.emailDomain ? ` "${anchors.emailDomain}"` : "";
    const queries = [
      // #1 best pattern: "Name" "Company" City — this is what works manually
      companyQ ? `"${fullName}"${companyQ}${cityState}` : null,
      // Company revenue/size query — for net worth estimation
      companyQ ? `${companyQ.replace(/"/g, '')} revenue employees` : null,
      // Smart queries (phone, email, name+city)
      ...smartQueries.slice(0, 3),
      // Then targeted topic queries, anchored to location
      `"${fullName}"${cityState} CEO OR president OR founder OR chairman OR director`,
      `"${fullName}"${cityState} yacht OR boat OR marina OR vessel`,
      `"${fullName}"${cityState} charity OR foundation OR board OR trustee`,
      `"${fullName}" wife OR husband OR spouse OR married OR age OR born${cityState}`,
    ].filter(Boolean) as string[];

    const searchPromises = queries.map(q => ddgSearch(q));
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
    // Apply validation gate — filter out results that don't match our person
    // BUT: always accept results that mention the company name or email domain
    const companyName = (anchors?.employer || anchors?.company || "").toLowerCase();
    const emailDom = (anchors?.emailDomain || "").toLowerCase();
    // Extract core company word for fuzzy match (e.g. "abel" from "abel construction")
    const companyCore = companyName.split(/\s+/)[0] || "";
    
    let validatedResults = allResults;
    if (anchors && (anchors.city || anchors.phoneDigits || anchors.emailDomain || anchors.employer)) {
      validatedResults = allResults.filter(r => {
        const text = `${r.title} ${r.snippet} ${r.url}`;
        const textLower = text.toLowerCase();
        
        // Always accept if result mentions the company name or domain
        if (companyCore.length > 3 && textLower.includes(companyCore)) return true;
        if (emailDom && textLower.includes(emailDom)) return true;
        
        // Otherwise use standard anchor validation
        const v = validateAgainstAnchors(text, anchors);
        return v.accepted || v.flagged;
      });
      // If validation filtered out everything, keep some results but mark as low confidence
      if (validatedResults.length === 0 && allResults.length > 0) {
        validatedResults = allResults.slice(0, 3); // Keep top 3 as unverified
      }
    }

    for (const r of validatedResults) {
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

      // Company revenue/employee signals → wealth indicator
      const revMatch = text.match(/\$\s*([\d,.]+)\s*(million|billion|m|b)\s*(?:in\s+)?(?:revenue|annual|sales)/i);
      if (revMatch) {
        result.extracted.net_worth_signals.push(`Company revenue: ${revMatch[0].trim()}`);
      }
      const empMatch = text.match(/(\d[\d,]+)\s*employees/i);
      if (empMatch && parseInt(empMatch[1].replace(/,/g, "")) >= 50) {
        result.extracted.net_worth_signals.push(`${empMatch[1]} employees`);
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

      // Education detection
      const eduPatterns = [
        /(?:Education|University|College|School|Alumnus|Alumna|Graduate|Graduated|Degree|MBA|B\.?A\.?|B\.?S\.?|M\.?A\.?|M\.?S\.?|Ph\.?D)[:\s]+([A-Z][A-Za-z\s&']+(?:University|College|Institute|School|Academy))/gi,
        /(?:University|College|Institute)\s+of\s+[A-Z][A-Za-z\s]+/gi,
        /([A-Z][A-Za-z\s&']+(?:University|College|Institute|School))/g,
      ];
      const snippet = r.title + " " + r.snippet;
      for (const ep of eduPatterns) {
        let em;
        while ((em = ep.exec(snippet)) !== null) {
          const edu = (em[1] || em[0]).trim();
          if (edu.length > 8 && edu.length < 60 && !result.extracted.education.includes(edu)) {
            result.extracted.education.push(edu);
          }
        }
      }

      // Club / membership detection (country clubs, yacht clubs, social clubs)
      const clubPatterns = [
        /([A-Z][A-Za-z\s']+(?:Country Club|Yacht Club|Golf Club|Tennis Club|Athletic Club|Rowing Club|Sailing Club|Beach Club|Club))/g,
      ];
      for (const cp of clubPatterns) {
        let cm;
        while ((cm = cp.exec(snippet)) !== null) {
          const club = cm[1]?.trim();
          if (club && club.length > 6 && club.length < 60 && !result.extracted.clubs.includes(club)) {
            result.extracted.clubs.push(club);
          }
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
    // Education
    for (const edu of [...new Set(extracted.education)].slice(0, 2)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Education — ${edu}`,
        layer: "identity", data_key: "education",
        data_value: edu, confidence: 40,
        fetched_at: new Date().toISOString(),
      });
    }
    // Clubs (country clubs, yacht clubs, etc.)
    for (const club of [...new Set([...extracted.clubs, ...extracted.yacht_club])].slice(0, 3)) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "websearch", source_url: "",
        source_label: `Web: Club — ${club}`,
        layer: "engagement", data_key: "yacht_club",
        data_value: club, confidence: 45,
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
}

// ─── Intelligence Extraction Helpers ────────────────────────────────

function extractTitlesAndCompanies(
  text: string,
  extracted: WebSearchResult["extracted"],
): void {
  // Title patterns: "CEO of X", "President at X", "X Director"
  const titlePats = [
    /(?:CEO|President|Chairman|Founder|Director|Partner|Managing Director|Owner)\s+(?:of|at)\s+([A-Z][A-Za-z\s&'.,-]+?)(?:\.|,|\s+and|\s+since|\s*$)/gi,
    /([A-Z][A-Za-z\s&'.]+?)\s+(?:CEO|President|Chairman|Founder|Director)/g,
  ];
  for (const p of titlePats) {
    let m;
    while ((m = p.exec(text)) !== null) {
      const val = m[1]?.trim();
      if (val && val.length > 2 && val.length < 60) {
        if (p.source.startsWith("(?:CEO")) {
          extracted.possible_companies.push(val);
        } else {
          extracted.possible_titles.push(val);
        }
      }
    }
  }
}

function extractOrgName(title: string, snippet: string): string | null {
  const text = title + " " + snippet;
  const patterns = [
    /(?:board|trustee|director)\s+(?:of|at|for)\s+(?:the\s+)?([A-Z][A-Za-z\s&']+(?:Foundation|Fund|Trust|Association|Society|Institute|Museum|Hospital|Center))/i,
    /([A-Z][A-Za-z\s&']+(?:Foundation|Fund|Trust|Association|Society|Institute|Museum|Hospital|Center))/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]?.trim().length > 5) return m[1].trim();
  }
  return null;
}

function extractYachtClub(text: string): string | null {
  const m = text.match(/([A-Z][A-Za-z\s']+(?:Yacht Club|Sailing Club|Boat Club|Marina Club))/i);
  return m ? m[1].trim() : null;
}
