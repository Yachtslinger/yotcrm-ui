/**
 * Social Media & Web Presence Discovery Provider
 * Discovers public profiles across platforms by probing known URL patterns.
 * Also searches for news mentions and web presence.
 *
 * Strategy:
 * 1. LinkedIn — probe linkedin.com/in/firstname-lastname variations
 * 2. Facebook — probe facebook.com/firstname.lastname
 * 3. Instagram — probe instagram.com/firstnamelastname variations
 * 4. Twitter/X — probe x.com/firstnamelastname variations
 * 5. News — DuckDuckGo instant answers for news mentions
 * 6. Wikipedia — check for notable person
 */

import { addSource, logAuditEvent } from "../storage";

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
): Promise<SocialResult> {
  const result: SocialResult = { profiles: [], news_mentions: [] };

  try {
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0]?.toLowerCase() || "";
    const lastName = nameParts[nameParts.length - 1]?.toLowerCase() || "";

    // Run all discovery in parallel
    const [linkedin, facebook, instagram, twitter, wiki, news] = await Promise.allSettled([
      probeLinkedIn(firstName, lastName),
      probeFacebook(firstName, lastName),
      probeInstagram(firstName, lastName),
      probeTwitter(firstName, lastName),
      checkWikipedia(fullName),
      searchNews(fullName),
    ]);

    // Collect found profiles
    const allProbes = [
      { name: "LinkedIn", result: linkedin },
      { name: "Facebook", result: facebook },
      { name: "Instagram", result: instagram },
      { name: "Twitter/X", result: twitter },
    ];

    for (const probe of allProbes) {
      if (probe.result.status === "fulfilled" && probe.result.value) {
        const p = probe.result.value;
        result.profiles.push(p);
        if (p.found) {
          addSource({
            profile_id: profileId, lead_id: leadId,
            source_type: "social", source_url: p.url,
            source_label: `${p.platform}: Profile found${p.display_name ? ` (${p.display_name})` : ""}`,
            layer: "identity", data_key: `social_${p.platform.toLowerCase().replace(/[^a-z]/g, "")}`,
            data_value: JSON.stringify({ url: p.url, display_name: p.display_name, bio: p.bio }),
            confidence: 50, // URL pattern match = moderate confidence
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
        confidence: 70, fetched_at: new Date().toISOString(),
      });
    }

    // News mentions
    if (news.status === "fulfilled" && news.value && news.value.length > 0) {
      result.news_mentions = news.value;
      for (const n of news.value.slice(0, 5)) {
        addSource({
          profile_id: profileId, lead_id: leadId,
          source_type: "social", source_url: n.url,
          source_label: `News: ${n.title.substring(0, 100)}`,
          layer: "identity", data_key: "news_mention",
          data_value: JSON.stringify({ title: n.title, source: n.source, snippet: n.snippet }),
          confidence: 40, fetched_at: new Date().toISOString(),
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

// ─── Platform Probes ────────────────────────────────────────────────

async function probeLinkedIn(first: string, last: string): Promise<SocialResult["profiles"][0]> {
  // LinkedIn public profile URL pattern
  const slugs = [
    `${first}-${last}`,
    `${first}${last}`,
    `${first}-${last}-${Math.floor(Math.random() * 1000)}`, // won't match but covers format
  ];

  for (const slug of slugs.slice(0, 2)) {
    const url = `https://www.linkedin.com/in/${slug}/`;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
      });
      // LinkedIn returns 200 for valid profiles, 404 or 999 for invalid
      if (res.ok) {
        return { platform: "LinkedIn", url, found: true };
      }
    } catch { /* continue to next slug */ }
  }

  // Always return a probable URL even if we can't verify
  return {
    platform: "LinkedIn",
    url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(first + " " + last)}`,
    found: false,
    display_name: `Search: ${first} ${last}`,
  };
}

async function probeFacebook(first: string, last: string): Promise<SocialResult["profiles"][0]> {
  const slugs = [`${first}.${last}`, `${first}${last}`];
  for (const slug of slugs) {
    const url = `https://www.facebook.com/${slug}`;
    try {
      const res = await fetch(url, {
        method: "HEAD", signal: AbortSignal.timeout(8000), redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
      });
      if (res.ok) {
        return { platform: "Facebook", url, found: true };
      }
    } catch { /* continue */ }
  }
  return {
    platform: "Facebook",
    url: `https://www.facebook.com/search/people/?q=${encodeURIComponent(first + " " + last)}`,
    found: false,
  };
}

async function probeInstagram(first: string, last: string): Promise<SocialResult["profiles"][0]> {
  const slugs = [`${first}${last}`, `${first}.${last}`, `${first}_${last}`];
  for (const slug of slugs) {
    const url = `https://www.instagram.com/${slug}/`;
    try {
      const res = await fetch(url, {
        method: "HEAD", signal: AbortSignal.timeout(8000), redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
      });
      if (res.ok) {
        return { platform: "Instagram", url, found: true };
      }
    } catch { /* continue */ }
  }
  return { platform: "Instagram", url: `https://www.instagram.com/${first}${last}/`, found: false };
}

async function probeTwitter(first: string, last: string): Promise<SocialResult["profiles"][0]> {
  const slugs = [`${first}${last}`, `${first}_${last}`];
  for (const slug of slugs) {
    const url = `https://x.com/${slug}`;
    try {
      const res = await fetch(url, {
        method: "HEAD", signal: AbortSignal.timeout(8000), redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
      });
      if (res.ok) {
        return { platform: "Twitter/X", url, found: true };
      }
    } catch { /* continue */ }
  }
  return { platform: "Twitter/X", url: `https://x.com/search?q=${encodeURIComponent(first + " " + last)}`, found: false };
}

// ─── Wikipedia ──────────────────────────────────────────────────────

async function checkWikipedia(fullName: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fullName.replace(/ /g, "_"))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    // Check it's about a person (not a disambiguation)
    if (data.type === "standard" && data.extract) {
      return data.extract.substring(0, 500);
    }
    return null;
  } catch { return null; }
}

// ─── News Search ────────────────────────────────────────────────────

async function searchNews(fullName: string): Promise<SocialResult["news_mentions"]> {
  const results: SocialResult["news_mentions"] = [];

  try {
    // Use Google News RSS (public, no API key needed)
    const rssUrl = `https://news.google.com/rss/search?q=%22${encodeURIComponent(fullName)}%22&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YotCRM/1.0)" },
    });

    if (!res.ok) return results;

    const xml = await res.text();

    // Simple XML parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < 5) {
      const item = match[1];
      const title = extractTag(item, "title");
      const link = extractTag(item, "link");
      const source = extractTag(item, "source");
      const pubDate = extractTag(item, "pubDate");

      if (title && link) {
        results.push({
          title: decodeHTMLEntities(title),
          url: link,
          source: source || "News",
          snippet: pubDate || "",
        });
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
