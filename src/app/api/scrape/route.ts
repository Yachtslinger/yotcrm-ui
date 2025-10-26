import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

/** JSON shape this route returns on success */
type SpecKey = "LENGTH" | "BEAM" | "DRAFT" | "STATEROOMS" | "ENGINES" | "CAT" | "HORSE POWER";

type ScrapeSuccess = {
  ok: true;
  source: string;
  domain: string;
  headline: string | null;
  preheader: string | null;
  price: string | null;
  location: string | null;
  hero: string | null;
  gallery: string[];
  specs: Partial<Record<SpecKey, string>>;
  rawText: string; // for debugging / fallback parsing on the client
};

/** JSON shape on failure */
type ScrapeError = { ok: false; error: string };

type ScrapeResponse = ScrapeSuccess | ScrapeError;

/* -------------------------- helpers -------------------------- */

function clean(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isHttpUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

/** Try to coerce odd user input into a valid absolute http(s) URL */
function normalizeInputUrl(raw: string): string | null {
  let u = clean(raw);
  if (!u) return null;
  // Encode if it has odd characters
  if (!isHttpUrl(u)) {
    try {
      u = encodeURI(u);
    } catch {
      return null;
    }
  }
  if (!isHttpUrl(u)) return null;
  return u;
}

/** Safely absolutize an <img src> with respect to base URL */
function absolutize(src: string | null | undefined, baseUrl: string): string | null {
  try {
    const s = clean(src);
    if (!s) return null;
    if (/^(data:|javascript:|about:|mailto:)/i.test(s)) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) {
      const b = new URL(baseUrl);
      return `${b.protocol}${s}`;
    }
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Extract first non-empty sentences as a preheader-like string */
function firstSentence(text: string): string | null {
  const t = clean(text);
  if (!t) return null;
  const m = t.match(/(.+?[.!?])(\s|$)/);
  return clean(m?.[1] || t.slice(0, 160));
}

/** Price finder like $1,234,567 or USD variants */
function findPrice(text: string): string | null {
  const m = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\bUSD\s?\d[\d,\.]*/i);
  return m ? clean(m[0]) : null;
}

/** Location finder: "Fort Lauderdale, FL" or "Location: ..." */
function findLocation(text: string): string | null {
  const m =
    text.match(/Location[:\s-]*([A-Za-z\s]+,\s*[A-Za-z\.]+)/i) ||
    text.match(/\b([A-Z][a-z]+(?:\s[A-Za-z]+){0,2},\s?[A-Z]{2,})\b/);
  return m ? clean(m[1] || m[0]) : null;
}

const SPEC_KEY_MATCHERS: Array<{ key: SpecKey; regex: RegExp }> = [
  { key: "LENGTH", regex: /^LENGTH\b/i },
  { key: "BEAM", regex: /^BEAM\b/i },
  { key: "DRAFT", regex: /^DRAFT\b/i },
  { key: "STATEROOMS", regex: /^STATEROOMS?\b/i },
  { key: "ENGINES", regex: /^ENGINES?\b/i },
  { key: "CAT", regex: /^CAT(?:EGORY)?\b/i },
  { key: "HORSE POWER", regex: /\bHORSE\s*POWER\b|\bHORSEPOWER\b|^POWER\b|\bHP\b/i },
];

function detectSpecKey(label: string): SpecKey | null {
  const normalized = clean(label).toUpperCase();
  if (!normalized) return null;
  for (const matcher of SPEC_KEY_MATCHERS) {
    if (matcher.regex.test(normalized)) return matcher.key;
  }
  return null;
}

/** Pull common specs (case-insensitive) from dt/dd, li, table, or inline "Label: Value" */
function extractSpecs($: cheerio.CheerioAPI): Partial<Record<SpecKey, string>> {
  const specMap: Partial<Record<SpecKey, string>> = {};

  const assignSpec = (label: string, value: string) => {
    const key = detectSpecKey(label);
    if (!key || !value) return;
    specMap[key] = clean(value);
  };

  // 1) dt/dd or th/td style
  $("dt, th").each((_, el) => {
    const kRaw = clean($(el).text());
    const vRaw = clean($(el).next("dd, td").text());
    if (!kRaw || !vRaw) return;
    assignSpec(kRaw, vRaw);
  });

  // 2) li text: "Length: 120'"
  $("li").each((_, el) => {
    const t = clean($(el).text());
    const m = t.match(/^([^:]+)\s*[:\-–]\s*(.+)$/);
    if (m) {
      assignSpec(m[1], m[2]);
    }
  });

  // 3) table rows: "Length" in first cell
  $("tr").each((_, tr) => {
    const first = clean($(tr).find("th,td").first().text());
    const second = clean($(tr).find("th,td").eq(1).text());
    if (!first || !second) return;
    assignSpec(first, second);
  });

  return specMap;
}

/** Collect image candidates with preference for common gallery containers */
function collectImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const out = new Set<string>();

  // Prefer gallery-like containers
  const selectors = [
    ".gallery img[src]",
    ".carousel img[src]",
    ".wp-block-gallery img[src]",
    ".wp-block-image img[src]",
    "figure img[src]",
    "img[src]",
  ];

  selectors.forEach((sel) => {
    $(sel).each((_, img) => {
      const abs = absolutize($(img).attr("src") || "", baseUrl);
      if (!abs) return;
      // Filter out tiny icons/logos
      if (/\b(icon|logo|avatar|badge|spinner)\b/i.test(abs)) return;
      out.add(abs);
    });
  });

  return Array.from(out);
}

/* ---------------------- Denison-specific scrape ---------------------- */

async function scrapeDenison(url: string): Promise<ScrapeSuccess> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status})`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Headline
  const headline =
    clean($('meta[property="og:title"]').attr("content")) ||
    clean($("h1").first().text()) ||
    clean($("title").first().text()) ||
    null;

  // Preheader
  const preheader =
    clean($('meta[name="description"]').attr("content")) ||
    clean($('meta[property="og:description"]').attr("content")) ||
    firstSentence($("p").first().text()) ||
    null;

  const rawText = clean($("body").text());

  // Price & location
  const price = findPrice(rawText);
  const location = findLocation(rawText);

  // Images
  const gallery = collectImages($, url);
  const hero =
    clean($('meta[property="og:image"]').attr("content")) && isHttpUrl(String($('meta[property="og:image"]').attr("content")))
      ? String($('meta[property="og:image"]').attr("content"))
      : gallery[0] || null;

  // Specs
  const specs = extractSpecs($);

  return {
    ok: true,
    source: url,
    domain: new URL(url).hostname,
    headline,
    preheader,
    price: price || null,
    location: location || null,
    hero,
    gallery,
    specs,
    rawText,
  };
}

/* ------------------------------ route ------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse<ScrapeResponse>> {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Use JSON body: { url: string }" }, { status: 400 });
    }

    const body = await req.json();
    const normalized = normalizeInputUrl(String(body?.url || ""));
    if (!normalized) {
      return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    const host = new URL(normalized).hostname.toLowerCase();
    const allowed = ["denisonyachting.com", "www.denisonyachting.com", "denisonyachtsales.com", "www.denisonyachtsales.com"];
    if (!allowed.some((h) => host.endsWith(h))) {
      return NextResponse.json(
        { ok: false, error: `Unsupported domain: ${host}. Only Denison Yachting URLs are allowed.` },
        { status: 400 }
      );
    }

    const result = await scrapeDenison(normalized);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
