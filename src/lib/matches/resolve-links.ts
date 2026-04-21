/**
 * src/lib/matches/resolve-links.ts
 *
 * Given a parsed listing, returns clickable links to:
 *   1. The BoatWizard PSP listing page
 *   2. The matching Denison Yachting listing page (if it exists)
 *
 * Both links carry a confidence label and a one-line reason.
 * No links are hallucinated — if we can't verify, we say so.
 */

import { lookupDenisonUrl } from "./denison-lookup";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BwConfidence = "exact" | "probable" | "none";
export type DenisonConfidence = "exact" | "not_listed" | "no_id" | "error";

export type ResolvedLinks = {
  vessel: {
    year: string;
    builder: string;
    model: string;
    loa: string;
    price: string;
    location: string;
  };
  boatwizard: {
    url: string | null;
    confidence: BwConfidence;
    reason: string;
  };
  denison: {
    url: string | null;
    confidence: DenisonConfidence;
    reason: string;
    bwId: string | null;
  };
  resolvedAt: string;
};

export type ListingInput = {
  listing_url?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  loa?: string | null;
  asking_price?: string | null;
  location?: string | null;
};

// ─── Normalization Helpers ────────────────────────────────────────────────────

const BUILDER_ALIASES: Record<string, string> = {
  "o/a":               "ocean alexander",
  "oa":                "ocean alexander",
  "sl":                "san lorenzo",
  "sanlorenzo":        "san lorenzo",
  "fairline squadron": "fairline",
  "princess v":        "princess",
  "pershing gt":       "pershing",
  "monte carlo yachts":"monte carlo",
  "mcy":               "monte carlo",
};

export function normalizeBuilder(raw: string): string {
  const lower = raw.trim().toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return BUILDER_ALIASES[lower] ?? lower;
}

export function normalizeModel(raw: string): string {
  return raw
    .replace(/\bFB\b/gi, "Flybridge")
    .replace(/\bFly\b(?!\s*bridge)/gi, "Flybridge")
    .replace(/['′]?\s*(?:ft|feet)?\s*$/i, "")
    .trim();
}

export function normalizeLoa(raw: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2,3})/);
  return m ? parseInt(m[1], 10) : null;
}

export function normalizePrice(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/[$,\s]/g, "").toLowerCase();
  const mM = s.match(/^(\d+(?:\.\d+)?)[m]$/);
  if (mM) return parseFloat(mM[1]) * 1_000_000;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n < 1_000 ? n * 1_000_000 : n;
}

// ─── BoatWizard Link Builder ──────────────────────────────────────────────────

/**
 * PSP URL present → exact confidence (came directly from source email).
 * No URL → construct a BW search URL as a clickable fallback (probable confidence).
 */
export function buildBoatWizardLink(listing: ListingInput): ResolvedLinks["boatwizard"] {
  const url = listing.listing_url?.trim();

  if (url && /psp\.boatwizard\.com\/boat/i.test(url)) {
    return { url, confidence: "exact", reason: "Direct PSP URL from alert email" };
  }

  if (url && url.startsWith("http")) {
    return { url, confidence: "probable", reason: "Listing URL present but not a PSP URL — verify manually" };
  }

  // Construct a fallback BW search URL when no direct URL
  const make = listing.make?.trim();
  const year = listing.year?.trim();
  if (make && year) {
    const params = new URLSearchParams({ make, year });
    return {
      url: `https://psp.boatwizard.com/boats?${params.toString()}`,
      confidence: "probable",
      reason: `No direct URL — constructed BW search for ${year} ${make}`,
    };
  }

  return { url: null, confidence: "none", reason: "No URL or identifiable fields to construct a search link" };
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

export async function resolveListingLinks(listing: ListingInput): Promise<ResolvedLinks> {
  const vessel = {
    year:     listing.year          ?? "",
    builder:  listing.make          ?? "",
    model:    listing.model         ?? "",
    loa:      listing.loa           ?? "",
    price:    listing.asking_price  ?? "",
    location: listing.location      ?? "",
  };

  // Step 1: BW link — synchronous, no network call
  const boatwizard = buildBoatWizardLink(listing);

  // Step 2: Denison lookup — async, calls Denison's search API
  let denison: ResolvedLinks["denison"];

  try {
    const result = await lookupDenisonUrl({
      listing_url: listing.listing_url,
      make:  listing.make,
      model: listing.model,
      year:  listing.year,
      loa:   listing.loa,
    });

    if (result.method === "direct_match") {
      denison = { url: result.url, confidence: "exact",
        reason: `Matched Denison card by BoatWizard vessel ID ${result.bwId}`, bwId: result.bwId };
    } else if (result.method === "not_found") {
      denison = { url: null, confidence: "not_listed",
        reason: "Vessel is not currently listed on Denison Yachting", bwId: result.bwId };
    } else if (result.method === "no_id") {
      denison = { url: null, confidence: "no_id",
        reason: "No BoatWizard vessel ID found — cannot match to Denison", bwId: null };
    } else {
      denison = { url: null, confidence: "error",
        reason: "Denison lookup failed — check network or retry", bwId: null };
    }
  } catch (err) {
    denison = { url: null, confidence: "error",
      reason: `Denison lookup threw: ${String(err).slice(0, 100)}`, bwId: null };
  }

  return { vessel, boatwizard, denison, resolvedAt: new Date().toISOString() };
}
