export const runtime = "nodejs";
/**
 * scrape-show-info/route.ts
 * POST { url } -> pulls rich boat-show details from the show's website.
 * Best-first: og/meta tags + schema.org Event JSON-LD (deterministic),
 * then AI extraction over the page text, then regex, then DDG search fallback.
 * Returns: name, dates, hours, venue, city, country, address, tagline, about,
 *          highlights[], image, officialUrl, ticketUrl, edition, organizer, notes.
 * The user's manual edits always win in the final email.
 */
import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { callAI } from "@/lib/ai-client";
import { stealthFetch } from "@/lib/campaign/providers/stealthFetch";

interface ShowInfo {
  name?: string; dates?: string; hours?: string; venue?: string;
  city?: string; country?: string; address?: string;
  tagline?: string; about?: string; highlights?: string[];
  image?: string; officialUrl?: string; ticketUrl?: string;
  edition?: string; organizer?: string; notes?: string;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

function abs(base: string, u?: string): string {
  if (!u) return "";
  try { return new URL(u, base).href; } catch { return u; }
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmtISO(iso: string): { label: string; year: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return { label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, year: d.getUTCFullYear() };
}
function fmtRange(startISO?: string, endISO?: string): string {
  const a = startISO ? fmtISO(startISO) : null;
  const b = endISO ? fmtISO(endISO) : null;
  if (a && b) return a.year === b.year ? `${a.label} – ${b.label}, ${a.year}` : `${a.label}, ${a.year} – ${b.label}, ${b.year}`;
  if (a) return `${a.label}, ${a.year}`;
  return "";
}

// ── og:/meta tags (deterministic) ────────────────────────────────────────────
function extractMeta($: cheerio.CheerioAPI, base: string): ShowInfo {
  const out: ShowInfo = {};
  const img = $('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content");
  if (img) out.image = abs(base, img);
  const desc = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content");
  if (desc) out.about = desc.trim();
  const ttl = $('meta[property="og:title"]').attr("content");
  if (ttl) out.name = ttl.trim();
  const u = $('meta[property="og:url"]').attr("content") || $('link[rel="canonical"]').attr("href");
  if (u) out.officialUrl = abs(base, u);
  return out;
}

// ── schema.org Event JSON-LD (deterministic) ─────────────────────────────────
function extractJsonLd($: cheerio.CheerioAPI, base: string): ShowInfo {
  const out: ShowInfo = {};
  const candidates: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const arr = Array.isArray(parsed) ? parsed : (parsed["@graph"] ? parsed["@graph"] : [parsed]);
      for (const item of arr) candidates.push(item);
    } catch { /* ignore */ }
  });
  const ev = candidates.find(c => {
    const t = c && c["@type"];
    return t && (t === "Event" || (Array.isArray(t) && t.includes("Event")) || String(t).includes("Event"));
  });
  if (!ev) return out;
  if (ev.name) out.name = String(ev.name).trim();
  if (ev.description) out.about = String(ev.description).trim();
  const range = fmtRange(ev.startDate, ev.endDate);
  if (range) out.dates = range;
  if (ev.url) out.officialUrl = abs(base, String(ev.url));
  const img = Array.isArray(ev.image) ? ev.image[0] : (ev.image && typeof ev.image === "object" ? ev.image.url : ev.image);
  if (img) out.image = abs(base, String(img));
  if (ev.organizer) out.organizer = String(typeof ev.organizer === "object" ? ev.organizer.name : ev.organizer).trim();
  const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  if (loc) {
    if (loc.name) out.venue = String(loc.name).trim();
    const addr = loc.address;
    if (addr && typeof addr === "object") {
      if (addr.addressLocality) out.city = String(addr.addressLocality).trim();
      if (addr.addressCountry) out.country = String(typeof addr.addressCountry === "object" ? addr.addressCountry.name : addr.addressCountry).trim();
      const line = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ");
      if (line) out.address = line;
    } else if (typeof addr === "string") out.address = addr.trim();
  }
  return out;
}

// ── AI extraction ────────────────────────────────────────────────────────────
async function aiExtract(bodyText: string): Promise<ShowInfo> {
  const prompt = `You are extracting details about a major boat show / yacht show from webpage text.
Return ONLY a JSON object (no prose, no markdown) with these keys:
"name","dates","hours","venue","city","country","address","tagline","about","highlights","ticketUrl","officialUrl","edition","organizer".
Rules:
- "dates": date range INCLUDING the year, human readable e.g. "September 9 – 14, 2026". Only dates explicitly in the text. Else "".
- "hours": daily opening hours if stated e.g. "10:00 AM – 7:00 PM", else "".
- "venue": venue / marina / port name. "address": full street address if present.
- "tagline": a punchy one-line descriptor (<= 90 chars), else "".
- "about": a 1–2 sentence description of the show, else "".
- "highlights": array of up to 4 SHORT bullet strings of notable facts (e.g. "560+ boats on display", "Dedicated superyacht extension"), else [].
- "edition": e.g. "33rd edition" if stated, else "". "organizer": if stated, else "".
- "ticketUrl","officialUrl": absolute URLs if clearly present, else "".
Do NOT invent or guess. Use "" (or [] for highlights) when not clearly present.

TEXT:
${bodyText.slice(0, 7000)}`;
  try {
    const raw = await callAI(prompt, 600, { tier: "cheap" });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const j = JSON.parse(m[0]);
    const str = (v: any) => (typeof v === "string" ? v.trim() : "");
    const arr = (v: any) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 4) : [];
    return {
      name: str(j.name), dates: str(j.dates), hours: str(j.hours), venue: str(j.venue),
      city: str(j.city), country: str(j.country), address: str(j.address),
      tagline: str(j.tagline), about: str(j.about), highlights: arr(j.highlights),
      ticketUrl: str(j.ticketUrl), officialUrl: str(j.officialUrl),
      edition: str(j.edition), organizer: str(j.organizer),
    };
  } catch { return {}; }
}

// ── regex date/hours fallback ────────────────────────────────────────────────
const MONTHS_ABBR: Record<string, string> = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June",
  jul: "July", aug: "August", sep: "September", sept: "September", oct: "October", nov: "November", dec: "December",
};
function monthFull(m: string): string {
  const k = m.toLowerCase().replace(/\.$/, "");
  return MONTHS_ABBR[k] || MONTHS_ABBR[k.slice(0, 4)] || MONTHS_ABBR[k.slice(0, 3)] || (m.charAt(0).toUpperCase() + m.slice(1));
}

function regexExtract(bodyText: string): ShowInfo {
  const info: ShowInfo = {};
  const monthTok = "(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z\\u00e9\\u00fb\\u00e0]*\\.?";
  // "8 -13 sept. 2026"  |  "8-13 September 2026"  (day-day month year)
  let m = bodyText.match(new RegExp("\\b(\\d{1,2})\\s*[\\u2013\\u2014\\-]\\s*(\\d{1,2})\\s+(" + monthTok + ")\\s+(\\d{4})", "i"));
  if (m) info.dates = monthFull(m[3]) + " " + parseInt(m[1]) + " to " + parseInt(m[2]) + ", " + m[4];
  // "September 8 - 13, 2026"  |  "October 30 - November 3, 2026"  (month first)
  if (!info.dates) {
    m = bodyText.match(new RegExp("\\b(" + monthTok + ")\\s+(\\d{1,2})\\s*[\\u2013\\u2014\\-]\\s*(?:(" + monthTok + ")\\s+)?(\\d{1,2}),?\\s+(\\d{4})", "i"));
    if (m) info.dates = monthFull(m[1]) + " " + parseInt(m[2]) + " to " + (m[3] ? monthFull(m[3]) + " " : "") + parseInt(m[4]) + ", " + m[5];
  }
  const h = bodyText.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:[–—\-]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
  if (h) info.hours = h[0].trim();
  return info;
}

async function searchDDG(showName: string): Promise<string> {
  const y = new Date().getFullYear();
  const q = encodeURIComponent(`"${showName}" ${y} OR ${y + 1} dates venue hours`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, { headers: { ...BROWSER_HEADERS, Referer: "https://duckduckgo.com/" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const $ = cheerio.load(await res.text());
    return $(".result__snippet, .result__title").map((_, el) => $(el).text()).get().join(" ");
  } catch { return ""; }
}

function pick(...vals: (string | undefined)[]): string { for (const v of vals) if (v && v.trim()) return v.trim(); return ""; }

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || typeof url !== "string") return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });

  let source = "direct", bodyText = "", meta: ShowInfo = {}, jsonld: ShowInfo = {};
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      meta = extractMeta($, url);
      jsonld = extractJsonLd($, url);
      $("script, style, nav, footer, header, noscript, iframe, svg").remove();
      bodyText = $("body").text().replace(/\s+/g, " ").trim();
    }
  } catch { /* fall through */ }

  // If the static HTML gave us no usable dates (JS-rendered or bot-blocked),
  // render the page in a real browser and re-parse.
  if (!jsonld.dates && !regexExtract(bodyText).dates) {
    try {
      const rendered = await stealthFetch(url);
      if (rendered && rendered.length > 500) {
        const $$ = cheerio.load(rendered);
        jsonld = { ...extractJsonLd($$, url), ...jsonld };
        meta = { ...extractMeta($$, url), ...meta };
        $$("script, style, nav, footer, header, noscript, iframe, svg").remove();
        const bt2 = $$("body").text().replace(/\s+/g, " ").trim();
        if (bt2.length > bodyText.length) { bodyText = bt2; source = "rendered"; }
      }
    } catch { /* stealth optional */ }
  }

  if (bodyText.length < 400) {
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, "").replace(/\.[a-z.]+$/i, "").replace(/[^a-z]/gi, " ").trim(); } catch { return ""; } })();
    const t = await searchDDG(host);
    if (t) { bodyText = t; source = "search"; }
  }

  const ai = bodyText ? await aiExtract(bodyText) : {};
  const rx = bodyText ? regexExtract(bodyText) : {};

  // Targeted fallback: many show sites render dates via JavaScript, so a direct
  // read misses them. If we still have no dates, search the web for them by name.
  let searchDates = "";
  let searchHours = "";
  if (!pick(jsonld.dates, ai.dates, rx.dates)) {
    const nm = pick(jsonld.name, ai.name, meta.name) || (() => { try { return new URL(url).hostname.replace(/^www\./, "").replace(/\.[a-z.]+$/i, "").replace(/[^a-z]/gi, " ").trim(); } catch { return ""; } })();
    if (nm) {
      const t = await searchDDG(nm);
      if (t) { const r = regexExtract(t); searchDates = r.dates || ""; searchHours = r.hours || ""; }
    }
  }

  const out = {
    ok: true,
    name: pick(jsonld.name, ai.name, meta.name),
    dates: pick(jsonld.dates, ai.dates, rx.dates, searchDates),
    hours: pick(ai.hours, rx.hours, searchHours),
    venue: pick(jsonld.venue, ai.venue),
    city: pick(jsonld.city, ai.city),
    country: pick(jsonld.country, ai.country),
    address: pick(jsonld.address, ai.address),
    tagline: pick(ai.tagline),
    about: pick(ai.about, jsonld.about, meta.about),
    highlights: (ai.highlights && ai.highlights.length ? ai.highlights : []),
    image: pick(jsonld.image, meta.image),
    officialUrl: pick(jsonld.officialUrl, ai.officialUrl, meta.officialUrl, url),
    ticketUrl: pick(ai.ticketUrl),
    edition: pick(ai.edition),
    organizer: pick(jsonld.organizer, ai.organizer),
    _source: source,
    _sawText: bodyText.length > 0,
  };
  return NextResponse.json(out);
}
