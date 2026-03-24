/**
 * src/lib/matches/denison-lookup.ts
 * BoatWizard PSP URL → Denison Yachting public listing URL
 *
 * Confirmed approach (via Puppeteer research + endpoint probing):
 *   - Denison's listing data comes from POST /yachts-for-sale/get-boats/
 *   - Response is JSON: { body: "<HTML fragment>" }
 *   - Each card: <div class="inn_filter_box" data-id="VESSEL_ID">
 *   - Real URL: href="/yachts-for-sale/SLUG" inside that card
 *   - Brand filter: brand[]=NUMERIC_ID (extracted from page HTML)
 *   - Supports page=N pagination (30 results per page)
 *
 * Flow:
 *   1. Extract vessel ID from PSP URL
 *   2. Look up numeric brand ID for the make (cached in-process)
 *   3. Page through get-boats results filtered by brand
 *   4. Return the listing URL when data-id matches
 *   5. Return null if not found (boat sold, not on Denison, different ID)
 */

const DENISON_HOST = "https://www.denisonyachtsales.com";
const SEARCH_PAGE  = `${DENISON_HOST}/yachts-for-sale/`;
const GET_BOATS    = `${DENISON_HOST}/yachts-for-sale/get-boats/`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type DenisonLookupResult = {
  url: string | null;
  method: "direct_match" | "not_found" | "no_id" | "error";
  verified: boolean;
  bwId: string | null;
};

// ── Brand ID cache (in-process, rebuilt if empty) ─────────────────────────
// Maps lowercase first-word of make → Denison numeric brand ID
// e.g. "azimut" → "439", "bertram" → "288"
const brandCache = new Map<string, string>();
let brandCacheBuilt = false;

async function fetchText(url: string, opts: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Referer": SEARCH_PAGE, ...opts.headers },
    signal: AbortSignal.timeout(20000),
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function buildBrandCache(): Promise<void> {
  if (brandCacheBuilt) return;
  const html = await fetchText(SEARCH_PAGE);
  // Labels: <div class="checkbox-item brand-item">...<span>MAKE NAME</span>...<input value="NNN">
  // Also: brand text in <label> with adjacent input value
  const re = /class="checkbox-item brand-item"[^>]*>[\s\S]*?<(?:span|label)[^>]*>([^<]{2,40})<\/(?:span|label)>[\s\S]*?value="(\d+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name  = m[1].trim().toLowerCase();
    const value = m[2];
    if (name && value) brandCache.set(name, value);
    // Also store first word (e.g. "bertram 700" → "bertram")
    const first = name.split(/\s+/)[0];
    if (first && !brandCache.has(first)) brandCache.set(first, value);
  }
  brandCacheBuilt = true;
  console.log(`[denison-lookup] brand cache built: ${brandCache.size} entries`);
}

function extractBwId(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id") || u.searchParams.get("psid");
    return id && /^\d{6,12}$/.test(id) ? id : null;
  } catch { return null; }
}

function makeToBrandId(make: string): string | null {
  const lower = make.trim().toLowerCase();
  // Try full make name first, then first word
  return brandCache.get(lower) ?? brandCache.get(lower.split(/\s+/)[0]) ?? null;
}

// ── Search get-boats with brand filter, paginate, match by data-id ─────────

async function findListingUrl(bwId: string, brandId: string): Promise<string | null> {
  const MAX_PAGES = 15;  // 30 results/page × 15 = 450 boats max per brand

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = new URLSearchParams({
      language: "en",
      "brand[]": brandId,
      page: String(page),
    });

    const res = await fetch(GET_BOATS, {
      method: "POST",
      headers: {
        "User-Agent":    UA,
        "Referer":       SEARCH_PAGE,
        "Content-Type":  "application/x-www-form-urlencoded",
        "Accept":        "*/*",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) break;

    const json = await res.json() as { body?: string };
    const html = json.body ?? "";
    if (!html || !html.includes("data-id")) break;  // no more results

    // Check if target ID appears in this page
    if (!html.includes(`data-id="${bwId}"`)) continue;

    // Found — extract the listing URL from this card
    const cardStart = html.indexOf(`data-id="${bwId}"`);
    const snippet   = html.slice(Math.max(0, cardStart - 100), cardStart + 800);

    // Match href to a real listing slug (not save/compare/# links)
    const urlRe = /href="(https:\/\/www\.denisonyachtsales\.com\/yachts-for-sale\/([^"#/?]+))"/g;
    let match: RegExpExecArray | null;
    while ((match = urlRe.exec(snippet)) !== null) {
      const href = match[1];
      const slug = match[2];
      // Skip utility paths
      if (["my-dashboard","get-page-views","save-search","get-boats"].includes(slug)) continue;
      if (slug.length < 4) continue;
      return href;
    }
  }

  return null;
}

// ── Search without brand filter (fallback for unknown makes) ───────────────
async function findListingUrlUnfiltered(bwId: string): Promise<string | null> {
  // Page through unfiltered results — only practical for very unique IDs
  // Cap at 5 pages (~150 boats) to avoid long timeouts
  const MAX_PAGES = 5;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = new URLSearchParams({ language: "en", page: String(page) });
    const res = await fetch(GET_BOATS, {
      method: "POST",
      headers: {
        "User-Agent":   UA,
        "Referer":      SEARCH_PAGE,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "*/*",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;
    const json = await res.json() as { body?: string };
    const html = json.body ?? "";
    if (!html || !html.includes("data-id")) break;
    if (!html.includes(`data-id="${bwId}"`)) continue;

    const cardStart = html.indexOf(`data-id="${bwId}"`);
    const snippet   = html.slice(Math.max(0, cardStart - 100), cardStart + 800);
    const urlRe = /href="(https:\/\/www\.denisonyachtsales\.com\/yachts-for-sale\/([^"#/?]+))"/g;
    let match: RegExpExecArray | null;
    while ((match = urlRe.exec(snippet)) !== null) {
      const slug = match[2];
      if (["my-dashboard","get-page-views","save-search","get-boats"].includes(slug)) continue;
      if (slug.length < 4) continue;
      return match[1];
    }
  }
  return null;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function lookupDenisonUrl(listing: {
  listing_url?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  loa?: string | null;
}): Promise<DenisonLookupResult> {

  const bwId = listing.listing_url ? extractBwId(listing.listing_url) : null;
  if (!bwId) {
    return { url: null, method: "no_id", verified: false, bwId: null };
  }

  try {
    // Build brand cache if not yet loaded
    await buildBrandCache();

    const make = (listing.make || "").trim();
    const brandId = make ? makeToBrandId(make) : null;

    let url: string | null = null;

    if (brandId) {
      // Fast path: filter by brand, paginate
      url = await findListingUrl(bwId, brandId);
    }

    if (!url) {
      // Fallback: scan unfiltered first 5 pages (~150 most recent listings)
      // Covers boats whose make doesn't match a brand or brand cache miss
      url = await findListingUrlUnfiltered(bwId);
    }

    if (url) {
      return { url, method: "direct_match", verified: true, bwId };
    }

    // Not found — boat is not currently listed on Denison's website
    // (sold, different brokerage, or ID mismatch between MLS and Denison's DB)
    return { url: null, method: "not_found", verified: false, bwId };

  } catch (err) {
    console.error("[denison-lookup] error:", err);
    return { url: null, method: "error", verified: false, bwId };
  }
}
