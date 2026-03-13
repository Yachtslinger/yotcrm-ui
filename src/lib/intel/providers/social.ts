/**
 * Social Media & Web Presence Discovery Provider (v2)
 * 
 * v1 used blind URL probing (linkedin.com/in/john-smith) which
 * matched any John Smith. v2 uses DuckDuckGo site-specific searches
 * with identity anchors for disambiguation.
 *
 * Strategy:
 * 1. Search "Name" + city/employer + site:linkedin.com
 * 2. Search "Name" + city/employer + site:facebook.com
 * 3. News search with anchor validation
 * 4. Wikipedia with content validation
 */

import { addSource, logAuditEvent } from "../storage";
import { type IdentityAnchors, validateAgainstAnchors } from "../validation";
import { ddgSearch } from "./ddg";

export type SocialResult = {
  profiles: {
    platform: string;
    url: string;
    found: boolean;
    display_name?: string;
    bio?: string;
  }[];
  news_mentions: {
    title: string;
    url: string;
    source: string;
    snippet: string;
  }[];
  wikipedia_summary?: string;
  error?: string;
};

export async function discoverSocial(
  profileId: number,
  leadId: number,
  fullName: string,
  email?: string,
  anchors?: IdentityAnchors,
): Promise<SocialResult> {
  const result: SocialResult = { profiles: [], news_mentions: [] };

  try {
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0]?.toLowerCase() || "";
    const lastName = nameParts[nameParts.length - 1]?.toLowerCase() || "";

    // Build location qualifier for searches
    const locQ = anchors?.city && anchors?.state
      ? `"${anchors.city}" "${anchors.state}"`
      : anchors?.city ? `"${anchors.city}"` : "";
    // For social platforms, use employer NAME not email domain (LinkedIn shows company names)
    const empName = anchors?.employer
      ? anchors.employer.split(/[-–—|,]/).map(s => s.trim()).filter(s => s.length > 3)[0] || ""
      : "";
    const empQ = empName ? `"${empName}"` : (anchors?.emailDomain ? `"${anchors.emailDomain}"` : "");
    const qualifier = locQ || empQ || "";

    // Site-specific searches with identity context
    // Note: DDG POST blocks "site:" operator, so we use domain as keyword instead
    const [linkedin, facebook, wiki, news] = await Promise.allSettled([
      searchSiteDDG(`"${fullName}" ${qualifier} linkedin.com`, "LinkedIn", anchors)
        .then(r => r.found ? r : searchSiteDDG(`"${fullName}" linkedin.com`, "LinkedIn", anchors)),
      searchSiteDDG(`"${fullName}" ${qualifier} facebook.com`, "Facebook", anchors),
      checkWikipedia(fullName, anchors),
      searchNews(fullName, anchors),
    ]);

    // Collect found profiles
    const probes = [
      { result: linkedin },
      { result: facebook },
    ];

    for (const probe of probes) {
      if (probe.result.status === "fulfilled" && probe.result.value) {
        const p = probe.result.value;
        result.profiles.push(p);
        if (p.found) {
          // Confidence based on whether anchors matched
          const conf = p.bio?.includes("✓anchor") ? 65 : 30;
          addSource({
            profile_id: profileId, lead_id: leadId,
            source_type: "social", source_url: p.url,
            source_label: `${p.platform}: ${p.display_name || "Profile found"}`,
            layer: "identity",
            data_key: `social_${p.platform.toLowerCase().replace(/[^a-z]/g, "")}`,
            data_value: JSON.stringify({ url: p.url, display_name: p.display_name }),
            confidence: conf,
            fetched_at: new Date().toISOString(),
          });
        }
      }
    }

    // Wikipedia
    if (wiki.status === "fulfilled" && wiki.value) {
      result.wikipedia_summary = wiki.value;
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "social",
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(fullName.replace(/ /g, "_"))}`,
        source_label: `Wikipedia: Notable person`,
        layer: "identity", data_key: "wikipedia",
        data_value: wiki.value.substring(0, 500),
        confidence: 60, fetched_at: new Date().toISOString(),
      });
    }

    // News mentions — validated against anchors
    if (news.status === "fulfilled" && news.value && news.value.length > 0) {
      result.news_mentions = news.value;
      // Company core word for fuzzy match (e.g. "abel" from "abel construction")
      const newsCompanyCore = (anchors?.employer || anchors?.company || "").toLowerCase().split(/\s+/)[0] || "";
      const newsEmailDom = (anchors?.emailDomain || "").toLowerCase();
      
      for (const n of news.value.slice(0, 5)) {
        // Validate news result against anchors
        let conf = 15; // low default — news often matches wrong person
        const newsText = `${n.title} ${n.snippet} ${n.source}`.toLowerCase();
        
        // Accept if mentions company name or domain (Abel Motorsports IS Bill's company)
        if (newsCompanyCore.length > 3 && newsText.includes(newsCompanyCore)) {
          conf = 55;
        } else if (newsEmailDom && newsText.includes(newsEmailDom)) {
          conf = 55;
        } else if (anchors) {
          const v = validateAgainstAnchors(`${n.title} ${n.snippet} ${n.source}`, anchors);
          if (v.accepted) conf = 55;
          else if (v.flagged) conf = 15;
          else conf = 5; // no anchor match → probably wrong person
        }
        addSource({
          profile_id: profileId, lead_id: leadId,
          source_type: "social", source_url: n.url,
          source_label: `News: ${n.title.substring(0, 100)}`,
          layer: "identity", data_key: "news_mention",
          data_value: JSON.stringify({ title: n.title, source: n.source, snippet: n.snippet }),
          confidence: conf, fetched_at: new Date().toISOString(),
        });
      }
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "social",
      profiles_found: result.profiles.filter(p => p.found).length,
      news_mentions: result.news_mentions.length,
      has_wikipedia: !!result.wikipedia_summary,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "social", error: err.message });
  }

  return result;
}

// ─── DuckDuckGo Site-Specific Search ────────────────────────────────

async function searchSiteDDG(
  query: string,
  platform: string,
  anchors?: IdentityAnchors,
): Promise<SocialResult["profiles"][0]> {
  try {
    const results = await ddgSearch(query, 5);
    const platformDomain = platform.toLowerCase().replace(/[^a-z]/g, "") + ".com";

    for (const r of results) {
      if (r.url.includes(platformDomain) || r.url.includes(platform.toLowerCase())) {
        let anchorMatch = false;
        if (anchors) {
          const profText = `${r.title} ${r.snippet}`.toLowerCase();
          // Use multi-word employer match to avoid false positives
          // e.g. "abel" matches the NAME "Bill Abel" but "abel construction" is specific
          const empFull = (anchors.employer || anchors.company || "").toLowerCase();
          const empWords = empFull.split(/\s+/).filter(w => w.length > 3);
          if (empWords.length >= 2 && empWords.every(w => profText.includes(w))) {
            anchorMatch = true;
          } else if (empWords.length === 1 && empWords[0].length > 5 && profText.includes(empWords[0])) {
            anchorMatch = true;
          } else if (anchors.emailDomain && profText.includes(anchors.emailDomain)) {
            anchorMatch = true;
          } else {
            const v = validateAgainstAnchors(`${r.title} ${r.snippet}`, anchors);
            anchorMatch = v.accepted;
          }
        }
        return {
          platform,
          url: r.url,
          found: true,
          display_name: r.title.substring(0, 100),
          bio: anchorMatch ? "✓anchor" : undefined,
        };
      }
    }
  } catch { /* search failed */ }

  return { platform, url: "", found: false };
}

// ─── Wikipedia ──────────────────────────────────────────────────────

async function checkWikipedia(
  fullName: string,
  anchors?: IdentityAnchors,
): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fullName.replace(/ /g, "_"))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === "standard" && data.extract) {
      // Validate: does the Wikipedia article match our person?
      if (anchors) {
        const v = validateAgainstAnchors(data.extract, anchors);
        if (!v.accepted && !v.flagged) return null; // Wrong person
      }
      return data.extract.substring(0, 500);
    }
    return null;
  } catch { return null; }
}

// ─── News Search ────────────────────────────────────────────────────

async function searchNews(
  fullName: string,
  anchors?: IdentityAnchors,
): Promise<SocialResult["news_mentions"]> {
  const results: SocialResult["news_mentions"] = [];
  try {
    const rssUrl = `https://news.google.com/rss/search?q=%22${encodeURIComponent(fullName)}%22&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
    });
    if (!res.ok) return results;
    const xml = await res.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;
    while ((match = itemRegex.exec(xml)) !== null && count < 8) {
      const item = match[1];
      const title = extractTag(item, "title");
      const link = extractTag(item, "link");
      const source = extractTag(item, "source");
      const pubDate = extractTag(item, "pubDate");
      if (title && link) {
        const decoded = decodeHTMLEntities(title);
        // If we have anchors, pre-filter news results
        if (anchors) {
          // Obituaries for different people/locations are common false positives
          const lowerTitle = decoded.toLowerCase();
          if (lowerTitle.includes("obituary") || lowerTitle.includes("visitation") || lowerTitle.includes("funeral")) {
            // Only keep obituary if it has strong anchor match (city/employer)
            const v = validateAgainstAnchors(`${decoded} ${source || ""}`, anchors);
            if (!v.accepted) continue;
          }
          const v = validateAgainstAnchors(`${decoded} ${source || ""}`, anchors);
          if (!v.accepted && !v.flagged) continue; // Skip wrong-person news
        }
        results.push({ title: decoded, url: link, source: source || "News", snippet: pubDate || "" });
        count++;
      }
    }
  } catch { /* news search is best-effort */ }
  return results;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "s");
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

function decodeHTMLEntities(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
}
