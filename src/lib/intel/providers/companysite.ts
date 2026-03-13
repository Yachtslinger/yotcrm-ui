/**
 * Company Website Scraper Provider
 * 
 * The single richest data source for business-email leads.
 * Fetches the actual company website (About, History, Team, Leadership pages)
 * and extracts structured data that no search engine snippet can match.
 * 
 * Extracts:
 * - Leadership names & titles (CEO, President, VP, etc.)
 * - Family connections (spouse, children mentioned on company pages)
 * - Company size signals (employee count, revenue, office locations)
 * - Subsidiaries and related businesses
 * - Year founded / company history
 * - Charity/community involvement
 */

import { addSource, logAuditEvent } from "../storage";
import { type IdentityAnchors, validateAgainstAnchors } from "../validation";

export type CompanySiteResult = {
  domain: string;
  pages_fetched: number;
  leadership: { name: string; title: string; relation?: string }[];
  company_info: {
    name?: string;
    founded?: string;
    employees?: string;
    revenue?: string;
    headquarters?: string;
    offices: string[];
    subsidiaries: string[];
  };
  family_members: string[];
  community: string[];
  error?: string;
};

const PAGES_TO_TRY = [
  "/", "/about", "/about-us", "/about-abel-construction/history",
  "/team", "/our-team", "/leadership", "/about/team",
  "/about-abel-construction", "/about/leadership", "/about/history",
  "/history", "/company", "/who-we-are",
];

// Fetch a page with timeout, return text or null
async function fetchPage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const text = await resp.text();
    return text.length > 500 ? text : null; // skip tiny error pages
  } catch { return null; }
}

// Strip HTML tags, collapse whitespace
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    // Keep footer — it often has address/location data
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Extract leadership names and titles from page text
function extractLeadership(text: string, leadLastName: string): { name: string; title: string; relation?: string }[] {
  const results: { name: string; title: string; relation?: string }[] = [];
  const seen = new Set<string>();

  // Pattern: "Title Name" or "Name, Title" or "Name Title"
  const titleWords = [
    "CEO", "President", "Chairman", "Chairwoman", "Vice President",
    "VP", "CFO", "COO", "CTO", "Director", "Owner", "Founder",
    "Managing Partner", "Principal", "General Manager", "Team Manager",
    "Chief Executive", "Chief Financial", "Chief Operating",
  ];

  for (const title of titleWords) {
    // "Bill Abel, CEO" or "CEO: Bill Abel" patterns
    // Require first+last name (not title words as names)
    const titleEsc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`([A-Z][a-z]{2,12}(?:\\s+[A-Z]\\.?)?\\s+[A-Z][a-z]{2,15}(?:,?\\s+(?:Jr|Sr|III|IV)\\.?)?)\\s*[,\\-–—]?\\s*${titleEsc}(?:\\b|$)`, "g"),
      new RegExp(`${titleEsc}\\s*[,:\\-–—]?\\s*([A-Z][a-z]{2,12}(?:\\s+[A-Z]\\.?)?\\s+[A-Z][a-z]{2,15}(?:,?\\s+(?:Jr|Sr|III|IV)\\.?)?)`, "g"),
    ];
    const titleLower = title.toLowerCase();
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const name = m[1]?.trim();
        // Filter out names that are actually title words
        if (name && name.length > 4 && name.length < 40 && !seen.has(name.toLowerCase())
            && !name.toLowerCase().includes("vice") && !name.toLowerCase().includes("president")
            && !name.toLowerCase().includes("director") && !name.toLowerCase().includes("executive")
            && !name.toLowerCase().includes("market") && !name.toLowerCase().includes("construction")) {
          seen.add(name.toLowerCase());
          const relation = name.toLowerCase().includes(leadLastName.toLowerCase()) ? "family" : undefined;
          results.push({ name, title, relation });
        }
      }
    }
  }
  return results;
}

// Extract family/relationship mentions
function extractFamily(text: string, leadName: string, leadLastName: string): string[] {
  const family: string[] = [];
  const seen = new Set<string>();

  const relWords = ["wife", "husband", "spouse", "son", "daughter", "brother",
    "sister", "father", "mother", "children", "family"];

  for (const rel of relWords) {
    // "his wife Amy" / "wife, Amy Abel" / "son Jacob Abel"
    const patterns = [
      new RegExp(`(?:his|her)\\s+${rel}\\s+([A-Z][a-z]{2,12}(?:\\s+[A-Z][a-z]{2,15})?)`, "gi"),
      new RegExp(`${rel}[,:]?\\s+([A-Z][a-z]{2,12}\\s+[A-Z][a-z]{2,15})`, "gi"),
    ];
    // Common words that look like names but aren't
    const notNames = new Set(["the","this","that","with","from","into","about","after","before",
      "their","they","these","those","been","also","will","each","both","such","than","then",
      "our","your","his","her","its","one","all","any","some","new","old","big","great",
      "construction","company","business","family","president","vice","director","manager",
      "inc","llc","corp","senior","junior","services","today","video","news","contact",
      "hiring","build","training","management","manufacturing","estimating","contracting",
      "scheduling","commitment","bringing","greater","located","founded","building"]);
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const name = m[1]?.trim();
        if (name && name.length > 4 && name.length < 35 && !seen.has(name.toLowerCase())
            && name.toLowerCase() !== leadName.toLowerCase()
            && !notNames.has(name.split(" ")[0].toLowerCase())
            && !notNames.has((name.split(" ")[1] || "").toLowerCase())) {
          // Extra check: if second word is a verb/common word, take only first word
          const parts = name.split(/\s+/);
          const verbWords = new Set(["joined","started","worked","proved","moved","founded",
            "turned","followed","increased","continued","made","earned","built","began",
            "set","added","took","became","serves","leads","manages","oversees"]);
          let cleanName = name;
          if (parts.length === 2 && verbWords.has(parts[1].toLowerCase())) {
            continue; // Skip — single word isn't enough for a name
          }
          seen.add(cleanName.toLowerCase());
          family.push(`${name} (${rel})`);
        }
      }
    }
  }

  // Also look for people with same last name — require first name to be a real name
  const sameNamePat = new RegExp(`([A-Z][a-z]{2,12})\\s+${leadLastName}(?:[,\\s]|$)`, "g");
  const commonWords = new Set(["About","Today","History","Contact","News","Services","Build",
    "Construction","Hire","Training","Management","Estimating","Manufacturing","For","Our",
    "The","One","And","Contracting","Scheduling","Commitment","Bringing","Hiring","Video",
    "Solutions","Greater","Located","Founded","Building","Safety","Design","Careers",
    "Projects","Portfolio","Awards","Brochure","Facilities","Maintenance","General",
    "Real","Estate","Development","Commercial","Industrial","Healthcare","Technology"]);
  let m;
  while ((m = sameNamePat.exec(text)) !== null) {
    const first = m[1]?.trim();
    const full = `${first} ${leadLastName}`;
    if (first && first.length > 2 && !seen.has(full.toLowerCase())
        && full.toLowerCase() !== leadName.toLowerCase()
        && !commonWords.has(first)) {
      seen.add(full.toLowerCase());
      family.push(`${full} (same surname)`);
    }
  }

  return family;
}

// Extract company info: founded year, employees, revenue, offices
function extractCompanyInfo(text: string, domain: string): CompanySiteResult["company_info"] {
  const info: CompanySiteResult["company_info"] = { offices: [], subsidiaries: [] };

  // Founded year — broader patterns
  const foundedPats = [
    /(?:founded|established|since|est\.?|history)\s*(?:in\s+)?(\d{4})/i,
    /(\d{4})\s*[-–—]\s*(?:present|today|now)/i,
    /(?:over|more than)\s+(\d+)\s+(?:years|decades)/i,
  ];
  for (const p of foundedPats) {
    const m = text.match(p);
    if (m) {
      if (m[1].length === 4 && parseInt(m[1]) > 1800 && parseInt(m[1]) < 2020) {
        info.founded = m[1]; break;
      }
    }
  }

  // Employees
  const empPats = [
    /(\d[\d,]+)\s*(?:employees|team members|staff|people)/i,
    /(?:employs?|team of)\s*(\d[\d,]+)/i,
  ];
  for (const p of empPats) {
    const m = text.match(p);
    if (m) { info.employees = m[1].replace(/,/g, ""); break; }
  }

  // Revenue
  const revPats = [
    /\$\s*([\d,.]+)\s*(million|billion|M|B)/i,
    /revenue[:\s]+\$?\s*([\d,.]+)\s*(million|billion|M|B)/i,
  ];
  for (const p of revPats) {
    const m = text.match(p);
    if (m) { info.revenue = `$${m[1]} ${m[2]}`; break; }
  }

  // Offices/locations — multiple patterns
  // Pattern 1: "office in City, ST" 
  const officePat = /(?:office|location|headquarter|based)\w*\s+(?:in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|[A-Z][a-z]+))/gi;
  let om;
  while ((om = officePat.exec(text)) !== null) {
    const loc = om[1]?.trim();
    if (loc && !info.offices.includes(loc)) info.offices.push(loc);
  }
  // Pattern 2: "City, ST" with zip code (address format)
  const addrPat = /([A-Z][a-z]{2,15}(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})\s+\d{5}/g;
  while ((om = addrPat.exec(text)) !== null) {
    const loc = om[1]?.trim();
    if (loc && !info.offices.includes(loc) && loc.length > 4) info.offices.push(loc);
  }
  // Pattern 3: listed locations like "Louisville, KY Lexington, KY Indianapolis, IN"
  const listedPat = /([A-Z][a-z]{2,15},\s*[A-Z]{2})\b/g;
  const listedCandidates: string[] = [];
  while ((om = listedPat.exec(text)) !== null) {
    const loc = om[1]?.trim();
    if (loc && !listedCandidates.includes(loc)) listedCandidates.push(loc);
  }
  // Only add listed locations if there are 2+ (indicates a location list, not random text)
  if (listedCandidates.length >= 2) {
    for (const loc of listedCandidates) {
      if (!info.offices.includes(loc)) info.offices.push(loc);
    }
  }

  // HQ — look for explicit HQ mention, then address with street+zip, then first office
  const hqPat = /(?:headquartered?|corporate\s+headquarters?|main\s+office)\s+(?:in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z]{2}|[A-Z][a-z]+))/i;
  const hqM = text.match(hqPat);
  if (hqM) {
    info.headquarters = hqM[1]?.trim();
  } else {
    // Prefer location with full street address (street number + city + zip = main office)
    const fullAddrPat = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Parkway|Pkwy|Lane|Ln|Way|Circle|Ct)\b[^,]*,?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*(?:[A-Z][a-z]+|[A-Z]{2})\s*\d{5}/i;
    const fullM = text.match(fullAddrPat);
    if (fullM) {
      // Find matching office entry
      const city = fullM[1]?.trim();
      const match = info.offices.find(o => o.toLowerCase().includes(city.toLowerCase()));
      info.headquarters = match || info.offices[0];
    } else if (info.offices.length > 0) {
      info.headquarters = info.offices[0];
    }
  }

  return info;
}

// Extract community/charity mentions
function extractCommunity(text: string): string[] {
  const items: string[] = [];
  const pats = [
    /(?:partner(?:ship|ed)?|support|sponsor|volunteer|donate|community)\w*\s+(?:with\s+)?([A-Z][A-Za-z\s']+(?:Hospital|Foundation|Home|School|Club|Society|Association|Center|Museum|Institute))/gi,
  ];
  for (const p of pats) {
    let m;
    while ((m = p.exec(text)) !== null) {
      const name = m[1]?.trim();
      if (name && name.length > 5 && name.length < 80 && !items.includes(name)) {
        items.push(name);
      }
    }
  }
  return items;
}

// ─── Main Export ─────────────────────────────────────────────────────

export async function scrapeCompanySite(
  profileId: number,
  leadId: number,
  fullName: string,
  domain: string,
  anchors?: IdentityAnchors,
): Promise<CompanySiteResult> {
  const result: CompanySiteResult = {
    domain,
    pages_fetched: 0,
    leadership: [],
    company_info: { offices: [], subsidiaries: [] },
    family_members: [],
    community: [],
  };

  if (!domain) return result;
  const lastName = fullName.split(" ").pop() || "";

  // Build dynamic team page URL from lead name
  const nameSlug = fullName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "");
  const dynamicPages = nameSlug ? [`/team/${nameSlug}`, `/staff/${nameSlug}`, `/people/${nameSlug}`] : [];

  try {
    // Fetch multiple pages in parallel (max 5 at a time)
    const urls = [...PAGES_TO_TRY, ...dynamicPages].map(p => `https://${domain}${p}`);
    const allText: string[] = [];
    const seenContent = new Set<string>();

    // Batch fetch in groups of 5
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5);
      const pages = await Promise.allSettled(batch.map(u => fetchPage(u)));
      for (let j = 0; j < pages.length; j++) {
        if (pages[j].status === "fulfilled" && (pages[j] as any).value) {
          const html = (pages[j] as any).value as string;
          const text = stripHtml(html);
          // Deduplicate (some /about and /about-us are the same page)
          const sig = text.substring(0, 200);
          if (!seenContent.has(sig)) {
            seenContent.add(sig);
            allText.push(text);
            result.pages_fetched++;
          }
        }
      }
    }

    if (allText.length === 0) {
      result.error = "No pages fetched";
      return result;
    }

    const combined = allText.join(" \n ");

    // Extract all data
    result.leadership = extractLeadership(combined, lastName);
    result.family_members = extractFamily(combined, fullName, lastName);
    result.company_info = extractCompanyInfo(combined, domain);
    result.community = extractCommunity(combined);

    // Try to get company name from title tag of homepage
    const homeHtml = await fetchPage(`https://${domain}`);
    if (homeHtml) {
      const titleMatch = homeHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) result.company_info.name = titleMatch[1].trim().substring(0, 100);
    }

    // ── Store enrichment sources ──

    // Leadership (high confidence — from the company's own website)
    for (const leader of result.leadership) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company_website", source_url: `https://${domain}`,
        source_label: `✓ ${leader.title}: ${leader.name}${leader.relation ? ` (${leader.relation})` : ""}`,
        layer: "identity", data_key: "web_title",
        data_value: JSON.stringify(leader),
        confidence: leader.name.toLowerCase().includes(lastName.toLowerCase()) ? 80 : 60,
        fetched_at: new Date().toISOString(),
      });
    }

    // Family members
    for (const fam of result.family_members) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company_website", source_url: `https://${domain}`,
        source_label: `✓ Family: ${fam}`,
        layer: "identity", data_key: "relative",
        data_value: fam,
        confidence: 75, // company's own site = high trust
        fetched_at: new Date().toISOString(),
      });
    }

    // Company info
    if (result.company_info.founded) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company_website", source_url: `https://${domain}`,
        source_label: `✓ Founded: ${result.company_info.founded}`,
        layer: "identity", data_key: "years_active",
        data_value: JSON.stringify({ founded: result.company_info.founded,
          years: new Date().getFullYear() - parseInt(result.company_info.founded) }),
        confidence: 85,
        fetched_at: new Date().toISOString(),
      });
    }

    // Office locations
    for (const office of result.company_info.offices) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company_website", source_url: `https://${domain}`,
        source_label: `✓ Office: ${office}`,
        layer: "identity", data_key: "secondary_address",
        data_value: office,
        confidence: 70,
        fetched_at: new Date().toISOString(),
      });
    }

    // Community involvement
    for (const item of result.community) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "company_website", source_url: `https://${domain}`,
        source_label: `✓ Community: ${item}`,
        layer: "capital", data_key: "charity_board",
        data_value: item,
        confidence: 65,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "company_website", domain,
      pages_fetched: result.pages_fetched,
      leadership_found: result.leadership.length,
      family_found: result.family_members.length,
    });

  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "company_website", domain, error: err.message,
    });
  }

  return result;
}
