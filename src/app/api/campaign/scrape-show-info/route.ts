export const runtime = "nodejs";
/**
 * route.ts
 * Drop into: src/app/api/campaign/scrape-show-info/route.ts
 *
 * Lightweight scrape of a boat show info page.
 * Looks for dates, venue, hours, and any notable notes.
 * Returns a JSON object — used by BoatShowSelector as a reference panel.
 * User's manually entered fields always override this in the final email.
 */

import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface ShowInfo {
  dates?:  string;
  venue?:  string;
  hours?:  string;
  notes?:  string;
}

// Full browser headers — most sites block anything that looks like a bot
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// DuckDuckGo HTML search fallback — if direct scrape fails, search for dates
async function searchDDG(showName: string): Promise<ShowInfo> {
  const thisYear = new Date().getFullYear();
  const nextYear = thisYear + 1;
  // Search for upcoming/current year dates — not hardcoded to 2025
  const query = encodeURIComponent(`"${showName}" ${thisYear} OR ${nextYear} dates schedule`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, "Referer": "https://duckduckgo.com/" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return {};
  const html = await res.text();
  const $ = cheerio.load(html);
  const bodyText = $(".result__snippet, .result__title").map((_,el) => $(el).text()).get().join(" ");
  return extractShowInfo(bodyText);
}

function extractShowInfo(bodyText: string): ShowInfo {
  const info: ShowInfo = {};
  const thisYear = new Date().getFullYear();

  // Date patterns — find ALL matches, then pick the one with the most future year >= thisYear
  const datePatterns = [
    // "March 25-29, 2026" / "October 30 – November 3, 2026"
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}[\s\u2013\-–]+(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{1,2},?\s+\d{4}/gi,
    // "25–29 March 2026"
    /\d{1,2}\s*[\u2013\-–]\s*\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}/gi,
    // "March 25 to 29, 2026" compact
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\s*(?:to|-)\s*\d{1,2},?\s+\d{4}/gi,
  ];

  // Collect all matches with their year
  const allMatches: { text: string; year: number }[] = [];
  for (const pat of datePatterns) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pat.source, pat.flags);
    while ((m = re.exec(bodyText)) !== null) {
      const yearMatch = m[0].match(/\d{4}/);
      if (yearMatch) {
        allMatches.push({ text: m[0].trim(), year: parseInt(yearMatch[0]) });
      }
    }
  }

  if (allMatches.length > 0) {
    // Prefer the match with year >= thisYear, closest to thisYear first
    const future = allMatches.filter(m => m.year >= thisYear).sort((a, b) => a.year - b.year);
    const best = future.length > 0 ? future[0] : allMatches.sort((a, b) => b.year - a.year)[0];
    info.dates = best.text;
  }

  // Hours
  const hoursMatch = bodyText.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:[\u2013\-–]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i);
  if (hoursMatch) info.hours = hoursMatch[0].trim();

  // Venue — look near "venue", "location", "held at", "Flagler Drive", marina names
  const venueMatch = bodyText.match(/(?:venue|location|held at|takes place at|at the|along|waterfront)[:\s]+([A-Z][^.!?\n]{10,100})/i);
  if (venueMatch) info.venue = venueMatch[1].trim().replace(/\s+/g, " ");

  // Notes
  const notesMatch = bodyText.match(/(?:superyacht|new\s+this\s+year|new\s+for\s+\d{4}|this\s+year)[^.!?]{5,120}[.!?]/i);
  if (notesMatch) info.notes = notesMatch[0].trim();

  return info;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let bodyText = "";
  let usedFallback = false;

  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!res.ok) {
      // Site blocked us — fall back to DDG search using the URL hostname as show name hint
      usedFallback = true;
      const hostname = new URL(url).hostname.replace(/^www\./, "").replace(/\.(com|org|net).*/, "");
      const showName = hostname.replace(/[^a-z]/gi, " ").trim();
      const info = await searchDDG(showName);
      return NextResponse.json({ ...info, _source: "search" });
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript, iframe").remove();
    bodyText = $("body").text().replace(/\s+/g, " ").trim();
  } catch {
    usedFallback = true;
    // Network failure — try DDG fallback
    const hostname = new URL(url).hostname.replace(/^www\./, "").replace(/\.(com|org|net).*/, "");
    const info = await searchDDG(hostname.replace(/[^a-z]/gi, " ").trim());
    return NextResponse.json({ ...info, _source: "search" });
  }

  const info = extractShowInfo(bodyText);
  return NextResponse.json({ ...info, _source: usedFallback ? "search" : "direct" });
}

