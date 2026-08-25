export const runtime = "nodejs";
/**
 * scrape-show-info/route.ts
 * POST { url } -> pulls boat-show details from the show's website.
 * Strategy (best-first):
 *   1. schema.org Event JSON-LD (name / startDate / endDate / location)
 *   2. AI extraction over the visible page text (callAI, cheap tier)
 *   3. Regex extraction over page text
 *   4. DuckDuckGo search fallback if the site blocks us
 * Returns full fields; the user's manual edits always win in the final email.
 */
import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { callAI } from "@/lib/ai-client";

interface ShowInfo {
  name?: string; dates?: string; hours?: string; venue?: string;
  city?: string; country?: string; notes?: string;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmtISO(iso: string): { label: string; year: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return { label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, year: d.getUTCFullYear() };
}
function fmtRange(startISO?: string, endISO?: string): string {
  const a = startISO ? fmtISO(startISO) : null;
  const b = endISO ? fmtISO(endISO) : null;
  if (a && b) {
    if (a.year === b.year) return `${a.label} – ${b.label}, ${a.year}`;
    return `${a.label}, ${a.year} – ${b.label}, ${b.year}`;
  }
  if (a) return `${a.label}, ${a.year}`;
  return "";
}

// ── 1. schema.org Event JSON-LD ──────────────────────────────────────────────
function extractJsonLd($: cheerio.CheerioAPI): ShowInfo {
  const out: ShowInfo = {};
  const blocks = $('script[type="application/ld+json"]');
  const candidates: any[] = [];
  blocks.each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const arr = Array.isArray(parsed) ? parsed : (parsed["@graph"] ? parsed["@graph"] : [parsed]);
      for (const item of arr) candidates.push(item);
    } catch { /* ignore malformed json-ld */ }
  });
  const ev = candidates.find(c => {
    const t = c && c["@type"];
    return t && (t === "Event" || (Array.isArray(t) && t.includes("Event")) || String(t).includes("Event"));
  });
  if (!ev) return out;
  if (ev.name) out.name = String(ev.name).trim();
  const range = fmtRange(ev.startDate, ev.endDate);
  if (range) out.dates = range;
  const loc = ev.location;
  const locObj = Array.isArray(loc) ? loc[0] : loc;
  if (locObj) {
    if (locObj.name) out.venue = String(locObj.name).trim();
    const addr = locObj.address;
    if (addr && typeof addr === "object") {
      if (addr.addressLocality) out.city = String(addr.addressLocality).trim();
      if (addr.addressCountry) out.country = String(typeof addr.addressCountry === "object" ? addr.addressCountry.name : addr.addressCountry).trim();
    } else if (typeof addr === "string") {
      out.city = addr.trim();
    }
  }
  return out;
}

// ── 2. AI extraction ─────────────────────────────────────────────────────────
async function aiExtract(bodyText: string): Promise<ShowInfo> {
  const text = bodyText.slice(0, 6000);
  const prompt = `You are extracting details about a boat show / yacht show from webpage text.
Return ONLY a JSON object (no prose, no markdown) with these string keys:
"name","dates","hours","venue","city","country","notes".
Rules:
- "dates": the show's date range INCLUDING the year, human readable, e.g. "September 9 – 14, 2026". Use ONLY dates explicitly present in the text. If none, "".
- "hours": daily opening hours if stated, e.g. "10:00 AM – 7:00 PM", else "".
- "venue": the venue / marina / port name.
- "city","country": location if present.
- "notes": one short sentence on anything notable (e.g. superyacht area, new feature), else "".
Do NOT invent or guess any value. Use "" when it is not clearly present in the text.

TEXT:
${text}`;
  try {
    const raw = await callAI(prompt, 400, { tier: "cheap" });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const j = JSON.parse(m[0]);
    const clean = (v: any) => (typeof v === "string" ? v.trim() : "");
    return {
      name: clean(j.name), dates: clean(j.dates), hours: clean(j.hours),
      venue: clean(j.venue), city: clean(j.city), country: clean(j.country), notes: clean(j.notes),
    };
  } catch { return {}; }
}

// ── 3. Regex extraction (fallback) ───────────────────────────────────────────
function regexExtract(bodyText: string): ShowInfo {
  const info: ShowInfo = {};
  const thisYear = new Date().getFullYear();
  const datePatterns = [
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}[\s–\-–]+(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{1,2},?\s+\d{4}/gi,
    /\d{1,2}\s*[–\-–]\s*\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/gi,
  ];
  const allMatches: { text: string; year: number }[] = [];
  for (const pat of datePatterns) {
    const re = new RegExp(pat.source, pat.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyText)) !== null) {
      const y = m[0].match(/\d{4}/);
      if (y) allMatches.push({ text: m[0].trim(), year: parseInt(y[0]) });
    }
  }
  if (allMatches.length) {
    const future = allMatches.filter(m => m.year >= thisYear).sort((a, b) => a.year - b.year);
    info.dates = (future.length ? future[0] : allMatches.sort((a, b) => b.year - a.year)[0]).text;
  }
  const hoursMatch = bodyText.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:[–\-–]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
  if (hoursMatch) info.hours = hoursMatch[0].trim();
  return info;
}

// ── 4. DuckDuckGo fallback when a site blocks us ─────────────────────────────
async function searchDDG(showName: string): Promise<string> {
  const y = new Date().getFullYear();
  const q = encodeURIComponent(`"${showName}" ${y} OR ${y + 1} dates schedule venue hours`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { ...BROWSER_HEADERS, "Referer": "https://duckduckgo.com/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const $ = cheerio.load(await res.text());
    return $(".result__snippet, .result__title").map((_, el) => $(el).text()).get().join(" ");
  } catch { return ""; }
}

function merge(...parts: ShowInfo[]): ShowInfo {
  const out: ShowInfo = {};
  for (const p of parts) for (const k of Object.keys(p) as (keyof ShowInfo)[]) {
    if (!out[k] && p[k]) out[k] = p[k];
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  }

  let source = "direct";
  let bodyText = "";
  let jsonld: ShowInfo = {};
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const $ = cheerio.load(await res.text());
      jsonld = extractJsonLd($);
      $("script, style, nav, footer, header, noscript, iframe").remove();
      bodyText = $("body").text().replace(/\s+/g, " ").trim();
    }
  } catch { /* fall through to search */ }

  if (bodyText.length < 400) {
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, "").replace(/\.[a-z.]+$/i, "").replace(/[^a-z]/gi, " ").trim(); } catch { return ""; } })();
    const searchText = await searchDDG(host);
    if (searchText) { bodyText = searchText; source = "search"; }
  }

  const ai = bodyText ? await aiExtract(bodyText) : {};
  const rx = bodyText ? regexExtract(bodyText) : {};
  const info = merge(jsonld, ai, rx);

  return NextResponse.json({
    ok: true,
    name: info.name || "",
    dates: info.dates || "",
    hours: info.hours || "",
    venue: info.venue || "",
    city: info.city || "",
    country: info.country || "",
    notes: info.notes || "",
    _source: source,
    _sawText: bodyText.length > 0,
  });
}
