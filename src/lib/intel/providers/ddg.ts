/**
 * DuckDuckGo Search Helper
 * 
 * Centralized DDG search with POST method (GET is blocked),
 * rate limiting, and retry logic. DDG aggressively rate-limits
 * server-side requests, so we throttle to 1 request per 2 seconds.
 */

let lastRequestTime = 0;
const MIN_DELAY_MS = 3000; // 3 seconds between requests — DDG is aggressive

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

export type DDGResult = { title: string; url: string; snippet: string };

export async function ddgSearch(query: string, maxResults = 10): Promise<DDGResult[]> {
  await throttle();

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "User-Agent": ua,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
        body: `q=${encodeURIComponent(query)}&b=&kl=&df=`,
        signal: AbortSignal.timeout(12000),
      });

      if (res.status === 202 || !res.ok) {
        // Rate limited — wait and retry
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return [];
      }

      const html = await res.text();

      // Detect captcha/anomaly block
      if (html.includes("anomaly") || html.includes("captcha")) {
        return braveSearchFallback(query, maxResults);
      }

      const results: DDGResult[] = [];

      // Primary regex: full result with snippet
      const fullRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
      let match;
      while ((match = fullRegex.exec(html)) !== null && results.length < maxResults) {
        const rawUrl = decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, ""));
        const title = stripTags(match[2]);
        const snippet = stripTags(match[3]);
        if (title && rawUrl.startsWith("http") && !rawUrl.includes("duckduckgo")) {
          results.push({ title, url: rawUrl, snippet });
        }
      }

      // Fallback regex: link-only results
      if (results.length === 0) {
        const altRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
        while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
          const rawUrl = match[1];
          const title = stripTags(match[2]);
          if (title && rawUrl.startsWith("http") && !rawUrl.includes("duckduckgo")) {
            results.push({ title, url: rawUrl, snippet: "" });
          }
        }
      }

      return results.length > 0 ? results : braveSearchFallback(query, maxResults);
    } catch {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return braveSearchFallback(query, maxResults);
    }
  }
  return braveSearchFallback(query, maxResults);
}

async function braveSearchFallback(query: string, maxResults = 10): Promise<DDGResult[]> {
  try {
    const res = await fetch("https://search.brave.com/search?q=" + encodeURIComponent(query), {
      headers: {
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: DDGResult[] = [];
    const chunks = html.split(/data-type="web"/).slice(1);
    for (const chunk of chunks) {
      if (results.length >= maxResults) break;
      const urlM = chunk.match(/href="(https?:\/\/(?!search\.brave|cdn\.search|imgs\.search)[^"]+)"/);
      const titleM = chunk.match(/class="[^"]*title[^"]*"[^>]*title="([^"]+)"/);
      const titleAlt = chunk.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/);
      const descM = chunk.match(/class="content[^"]*"[^>]*>(?:<!--[^>]*>)*\s*(?:<!--[^>]*>)*\s*([^<]+)/);
      const url = urlM?.[1] || "";
      const title = stripTags(titleM?.[1] || titleAlt?.[1] || "");
      const snippet = stripTags(descM?.[1] || "");
      if (url && title && !url.includes("brave.com")) {
        results.push({ title, url, snippet });
      }
    }
    return results;
  } catch {
    return [];
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
