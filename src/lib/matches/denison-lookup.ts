/**
 * BoatWizard → Denison Yachting URL Bridge
 *
 * BoatsGroup (the platform powering both psp.boatwizard.com and
 * denisonyachtsales.com) uses the SAME vessel ID across all surfaces.
 *
 * Strategy (in order):
 *   1. Extract the numeric vessel ID from the PSP BoatWizard URL
 *   2. Try several Denison URL slug patterns that embed that ID
 *   3. Verify via HEAD request (fast, no full scrape)
 *   4. Fall back to a filtered Denison search URL (make + year ± 1 + loa ± 5)
 *
 * The returned URL is ALWAYS Denison-branded — no YachtWorld/external links.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DENISON_HOST = "https://www.denisonyachtsales.com";

// ── helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractBwId(url: string): string | null {
  try {
    const u = new URL(url);
    // psp.boatwizard.com/boat?id=XXXXXXXX
    const id = u.searchParams.get("id") || u.searchParams.get("psid");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    return res.ok; // 200-299
  } catch {
    return false;
  }
}

// ── types ─────────────────────────────────────────────────────────────────────

export type DenisonLookupResult = {
  /** Final Denison URL — either a specific listing or a filtered search */
  url: string;
  /** How confident we are this is the exact listing */
  method: "direct_id" | "filtered_search" | "generic_search";
  /** true = HEAD-verified as a real page, false = constructed but not checked */
  verified: boolean;
  /** The BoatWizard numeric vessel ID extracted from the listing URL */
  bwId: string | null;
};

// ── main export ───────────────────────────────────────────────────────────────

export async function lookupDenisonUrl(listing: {
  listing_url?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  loa?: string | null;
}): Promise<DenisonLookupResult> {
  const bwId = listing.listing_url ? extractBwId(listing.listing_url) : null;
  const make  = (listing.make  || "").trim();
  const model = (listing.model || "").trim();
  const year  = (listing.year  || "").trim();
  const loa   = (listing.loa   || "").replace(/[^0-9]/g, ""); // numeric feet only

  // ── Strategy 1: direct ID-based URL candidates ────────────────────────────
  if (bwId) {
    const candidates: string[] = [];

    if (make && model && year && loa) {
      candidates.push(
        `${DENISON_HOST}/boat-for-sale/${year}-${slugify(make)}-${slugify(model)}-${loa}ft-${bwId}/`
      );
    }
    if (make && year && loa) {
      candidates.push(
        `${DENISON_HOST}/boat-for-sale/${year}-${slugify(make)}-${loa}ft-${bwId}/`
      );
    }
    if (make && year) {
      candidates.push(
        `${DENISON_HOST}/boat-for-sale/${year}-${slugify(make)}-${bwId}/`
      );
    }
    // bare ID slug (some BoatsGroup sites route on just the ID)
    candidates.push(`${DENISON_HOST}/boat-for-sale/${bwId}/`);

    // Try each candidate — return the first that HEAD-resolves
    for (const url of candidates) {
      if (await headOk(url)) {
        return { url, method: "direct_id", verified: true, bwId };
      }
    }
  }

  // ── Strategy 2: filtered search URL (make + year ± 1 + loa ± 5) ──────────
  const params = new URLSearchParams();
  if (make)  params.set("make", make);
  if (year && !isNaN(Number(year))) {
    const y = Number(year);
    params.set("year_min", String(y - 1));
    params.set("year_max", String(y + 1));
  }
  if (loa && !isNaN(Number(loa))) {
    const l = Number(loa);
    params.set("length_min", String(Math.max(0, l - 5)));
    params.set("length_max", String(l + 5));
  }

  if (params.toString()) {
    const url = `${DENISON_HOST}/yachts-for-sale/?${params.toString()}`;
    return { url, method: "filtered_search", verified: false, bwId };
  }

  // ── Strategy 3: generic Denison search (last resort) ──────────────────────
  return {
    url: `${DENISON_HOST}/yachts-for-sale/`,
    method: "generic_search",
    verified: false,
    bwId,
  };
}
