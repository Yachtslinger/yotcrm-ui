// src/app/api/scrape/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

type Mode = "auto" | "vessel";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const clean = (s?: string | null) =>
  (s ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

const num = (s?: string | null) => {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
};

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.google.com/",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${res.statusText}`);
  return await res.text();
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function collectImages($: cheerio.CheerioAPI, limit = 24) {
  const set = new Set<string>();
  const og = $('meta[property="og:image"]').attr("content");
  if (og && /^https?:\/\//i.test(og)) set.add(og);

  $("img").each((_, el) => {
    const src = ($(el).attr("src") || "").trim();
    const low = src.toLowerCase();
    if (!/^https?:\/\//i.test(src)) return;
    if (/\.svg$/i.test(src) || /^data:/i.test(src)) return;
    // filter obvious noise
    if (
      low.includes("flag-") ||
      low.includes("language-flag") ||
      low.includes("icon") ||
      low.includes("arrow") ||
      low.includes("favicon") ||
      low.includes("profile-headshot") ||
      low.includes("logo")
    ) {
      return;
    }
    // prefer BoatsGroup and main uploads
    if (low.includes("images.boatsgroup.com") || low.includes("/wp-content/uploads/")) {
      set.add(src);
    }
  });

  // fallback: if nothing, accept any non-svg imgs
  if (set.size === 0) {
    $("img").each((_, el) => {
      const src = ($(el).attr("src") || "").trim();
      if (/^https?:\/\//i.test(src) && !/\.svg$/i.test(src)) set.add(src);
    });
  }

  return Array.from(set).slice(0, limit);
}

function parseModelFromTitle($: cheerio.CheerioAPI) {
  const t =
    clean($("h1").first().text()) ||
    clean($(".listing-title").first().text()) ||
    clean($('meta[property="og:title"]').attr("content")) ||
    clean($("title").first().text());

  // Strip “Yacht for Sale …”
  return clean(t.replace(/yacht\s+for\s+sale.*$/i, ""));
}

function parseBuilderFromSlug(url: string) {
  try {
    const u = new URL(url);
    const slug = u.pathname.split("/").filter(Boolean).pop() || ""; // e.g. ducale-120-120-ocean-king-I
    const toks = slug.split("-").filter(Boolean);
    // Denison slugs often: <model>-<loa>-<builder words>-<maybe letter or hull id>
    // Heuristic: find last index of “ocean” then include following token “king” => “Ocean King”
    const idxOcean = toks.lastIndexOf("ocean");
    if (idxOcean >= 0 && toks[idxOcean + 1] === "king") {
      return "Ocean King";
    }
    // Otherwise: take last 2 tokens unless the last is a single letter/roman digit
    const last = toks[toks.length - 1] || "";
    const isTailToken = last.length <= 2 && /^[ivx]+$/i.test(last); // roman-ish
    const start = Math.max(0, toks.length - (isTailToken ? 3 : 2));
    const cand = toks.slice(start).join(" ");
    return titleCase(cand);
  } catch {
    return "";
  }
}

function findColonValue($: cheerio.CheerioAPI, re: RegExp) {
  // scan all text nodes that look like "Label: value" and return the value part
  let found = "";
  $("li, td, th, p, div, span").each((_, el) => {
    const txt = clean($(el).text());
    const low = txt.toLowerCase();
    if (re.test(low) && txt.includes(":")) {
      const after = clean(txt.split(":").slice(1).join(":"));
      if (after) {
        found = after;
        return false;
      }
    }
  });
  return found;
}

function nextValueOfLabel($: cheerio.CheerioAPI, re: RegExp) {
  // table/list fallback: find a label cell/item and take its next sibling item
  const pools = $("table, ul, ol").find("td,th,li");
  for (let i = 0; i < pools.length; i++) {
    const el = pools[i];
    const txt = clean($(el).text()).toLowerCase();
    if (re.test(txt)) {
      const td = $(el);
      let candidate = "";
      if (el.tagName === "td" || el.tagName === "th") {
        candidate = clean(td.next().text());
      } else {
        candidate = clean(td.next("li").text());
      }
      if (candidate) return candidate;
    }
  }
  return "";
}

function parseSpeedKn(raw: string) {
  const v = clean(raw);
  const m = v.match(/(\d+(?:\.\d+)?)\s*(kts?|knots?)/i);
  return m ? Number(m[1]) : num(v);
}

function parseRangeNm(raw: string) {
  const v = clean(raw);
  const m = v.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(nm|nautical miles?)/i);
  return m ? Number(m[1].replace(/,/g, "")) : num(v);
}

/** robust Denison vessel parse */
function parseDenisonVessel($: cheerio.CheerioAPI, url: string) {
  const modelFromTitle = parseModelFromTitle($);
  const builderFromSlug = parseBuilderFromSlug(url);

  // year & LOA from title, if present
  const year = num(modelFromTitle.match(/\b(19|20)\d{2}\b/)?.[0] || "");
  const loaFt =
    num(modelFromTitle.match(/(\d{2,3})\s*['′]/)?.[1] || "") ||
    num(nextValueOfLabel($, /\b(length|loa)\b/));

  // prefer colon forms “Hull Material: …”
  const hullMat =
    findColonValue($, /\bhull\s*material\b/) ||
    findColonValue($, /\bconstruction\b/) ||
    nextValueOfLabel($, /\bhull\s*material|construction\b/);

  const guestsRaw =
    findColonValue($, /\bguests?\b/) || nextValueOfLabel($, /\bguests?\b/);
  const cabinsRaw =
    findColonValue($, /\bcabins?\b/) || nextValueOfLabel($, /\bcabins?\b/);

  const speedRaw =
    findColonValue($, /(max|top)\s*speed|cruising\s*speed|\bspeed\b/) ||
    nextValueOfLabel($, /(max|top)\s*speed|cruising\s*speed|\bspeed\b/);

  const rangeRaw =
    findColonValue($, /\b(range|cruising\s*range)\b/) ||
    nextValueOfLabel($, /\b(range|cruising\s*range)\b/);

  let location =
    findColonValue($, /\blocation\b/) ||
    clean($(".listing-location").first().text());
  if (/^engines?:/i.test(location)) location = ""; // drop bad pick

  const priceRaw =
    findColonValue($, /\b(price|asking)\b/) ||
    nextValueOfLabel($, /\b(price|asking)\b/);

  const photos = collectImages($);

  return {
    name: modelFromTitle || "",
    builder: builderFromSlug || (modelFromTitle.includes("Ocean King") ? "Ocean King" : ""),
    model: modelFromTitle || "",
    year: year || undefined,
    loaFt: loaFt || undefined,
    material: hullMat || undefined,
    guests: num(guestsRaw),
    cabins: num(cabinsRaw),
    speedKn: parseSpeedKn(speedRaw),
    rangeNm: parseRangeNm(rangeRaw),
    priceUSD: num(priceRaw),
    location: location || undefined,
    status: "Active",
    listingUrl: url,
    photos,
    notes: "",
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "");
    const mode = (body?.mode || "auto") as Mode;

    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Missing or invalid url" }, { status: 400 });
    }

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    if (mode === "vessel") {
      if (url.includes("denisonyachtsales.com")) {
        const data = parseDenisonVessel($, url);
        return NextResponse.json({ ok: true, ...data });
      }
      // generic fallback
      const title = clean($("h1").first().text()) || clean($('meta[property="og:title"]').attr("content"));
      const photos = collectImages($);
      return NextResponse.json({
        ok: true,
        name: title || "",
        builder: "",
        model: "",
        listingUrl: url,
        photos,
        status: "Active",
      });
    }

    // generic page scrape (campaign builder)
    const title =
      clean($("h1").first().text()) ||
      clean($(".listing-title").first().text()) ||
      clean($('meta[property="og:title"]').attr("content")) ||
      clean($("title").first().text());
    const desc =
      clean($('meta[property="og:description"]').attr("content")) ||
      clean($(".intro, .description, .content p, article p").first().text());
    const heroUrl = $('meta[property="og:image"]').attr("content") || "";
    const gallery = collectImages($, 10);

    return NextResponse.json({
      ok: true,
      subject: title,
      preheader: desc?.slice(0, 140) || "",
      heroUrl,
      galleryUrls: gallery,
      listingUrl: url,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, detail: "Use POST" }, { status: 405 });
}