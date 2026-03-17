/**
 * YachtBuyer.com vessel scraper
 * Handles: yachtbuyer.com/en-us/fleet/[slug] and yachtbuyer.com/[locale]/for-sale/[id]
 *
 * HTML structure:
 *  - .min-spec-table        → Length, GT, Built / Beam, Draft, Top Speed
 *  - .specificationDetails li > strong.labelCopy + span.detail → all named specs
 *  - h4.table-heading with classes: dimensions, hull, capacities, speed, engines, accommodation
 *  - p.price                → EUR price
 *  - p.heading + p.number   → Guests, Cabins, Crew quick stats
 *  - image.yachtbuyer.com   → gallery images (prefer w0/h502 size)
 */

import * as cheerio from "cheerio";
import type { VesselData, VesselVideo } from "../types";
import { emptyVesselFull } from "../types";
import { clean, dedupeImages, cleanHeadline, dualMeasure } from "../utils";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapeYachtBuyer(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YachtBuyer fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const vessel: VesselData = emptyVesselFull(url);

  // ── Name ──────────────────────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1.h-bold-xl").first().text()) ||
    cleanHeadline($("h1").first().text()) ||
    "";
  // YachtBuyer often has "One Yacht" in h1 but "One" is the real name in spec section
  const currentName = clean($("li span.detail:contains('One')").first().text()) ||
    clean($(".specificationDetails li:has(strong:contains('Current Name')) .detail").text());
  if (currentName && currentName.length < vessel.name.length) vessel.name = currentName;

  // ── Builder / Year from subtitle line ────────────────────────────────────
  const subtitle = clean($("h1 + p, h1 ~ p").first().text());
  // e.g. "112' Van der Valk | Custom | 2024"
  const builderM = subtitle.match(/\|\s*([A-Za-z][^\|]+?)\s*\|/);
  if (builderM) vessel.builder = builderM[1].trim();
  const yearM = subtitle.match(/\b(19|20)\d{2}\b/);
  if (yearM) vessel.year = parseInt(yearM[0]);

  // ── Spec list: strong.labelCopy + span.detail ─────────────────────────────
  $(".specificationDetails li").each((_, li) => {
    const label = clean($(li).find("strong.labelCopy").text());
    const value = clean($(li).find("span.detail").text());
    if (!label || !value) return;
    mapSpec(vessel, label, value);
  });

  // ── Min-spec tables (quick header stats) ─────────────────────────────────
  $("table.min-spec-table").each((_, tbl) => {
    const rows = $(tbl).find("tr");
    if (rows.length >= 2) {
      const headers: string[] = [];
      rows.first().find("th").each((_, th) => { headers.push(clean($(th).text())); });
      const values: string[] = [];
      rows.eq(1).find("td").each((_, td) => {
        const txt = $(td).clone().find("span.measurement").remove().end().text();
        values.push(clean(txt));
      });
      headers.forEach((h, i) => {
        if (values[i]) mapSpec(vessel, h, values[i]);
      });
    }
  });

  // ── Quick stats: Guests / Cabins / Crew ───────────────────────────────────
  $(".vessel-quick-view-stat, .quick-stat, div:has(> p.heading):has(> p.number)").each((_, el) => {
    const heading = clean($(el).find("p.heading, .heading").first().text());
    const number  = clean($(el).find("p.number, .number").first().text());
    if (heading && number) mapSpec(vessel, heading, number);
  });
  // Fallback: find p.heading + p.number pairs  
  $("p.heading").each((_, el) => {
    const label = clean($(el).text());
    const val   = clean($(el).next("p.number").text());
    if (label && val) mapSpec(vessel, label, val);
  });

  // ── Price ─────────────────────────────────────────────────────────────────
  // p.price contains "€17,950,000\n($20,507,958)" — grab both parts
  $("p.price").each((_, el) => {
    if (vessel.price) return;
    const txt = clean($(el).text());
    if (txt) vessel.price = txt;
  });
  // Also check .vessel-price and currency-block areas
  if (!vessel.price) {
    const priceArea = clean($(".vessel-price, .currency-block, .on-the-market").text());
    const m = priceArea.match(/(€|EUR|USD|\$)[,\d]+(?:\s*[\(\$€][,\d]+\)?)?/);
    if (m) vessel.price = m[0];
  }

  // ── Description ───────────────────────────────────────────────────────────
  const descParts: string[] = [];
  $(".vessel-overview p, .jsReadMoreContent p, #overview p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 40) descParts.push(t);
  });
  if (descParts.length) vessel.description = descParts.join("\n\n");

  // Mine description text for specs not in the structured sections
  mineDescriptionText(vessel, vessel.description);

  // ── Images — target ONLY the gallery section, not site-wide ─────────────
  // YachtBuyer lazy-loads gallery images with data-lazy-l (full size) attributes.
  // We use regex on the raw HTML scoped to the gallery section for reliability,
  // since the cheerio ID selector can miss when the live page structure varies.
  const imgSet = new Map<string, string>(); // resource-id → best URL

  // Scope to between id="gallery" and id="video" (or end of page)
  const galleryStart = html.indexOf('id="gallery"');
  const galleryEnd   = html.indexOf('id="video"', galleryStart > 0 ? galleryStart : 0);
  const galleryHtml  = galleryStart > 0
    ? html.slice(galleryStart, galleryEnd > galleryStart ? galleryEnd : html.length)
    : "";

  if (galleryHtml) {
    // Prefer data-lazy-l (full res), then data-lazy-lm, data-lazy-m
    const lazyAttrs = ["data-lazy-l", "data-lazy-lm", "data-lazy-m", "data-lazy-sm"];
    for (const attr of lazyAttrs) {
      const pattern = new RegExp(`${attr}="(https://image\\.yachtbuyer\\.com/[^"]+)"`, "g");
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(galleryHtml)) !== null) {
        const src = m[1];
        if (/award|badge|logo|icon/i.test(src)) continue;
        const res = src.match(/\/resource\/(\d+)/);
        const key = res ? res[1] : src;
        // Only set if not already set (first attr wins — largest)
        if (!imgSet.has(key)) imgSet.set(key, src);
      }
    }
  }

  // Fallback: if gallery section not found, check JSON-LD and OG
  if (!imgSet.size) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        const nodes = Array.isArray(json) ? json : [json];
        for (const node of nodes) {
          const imgs = Array.isArray(node.image) ? node.image : (node.image ? [node.image] : []);
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string,string>)?.url || "";
            if (src?.includes("image.yachtbuyer")) {
              const res = src.match(/\/resource\/(\d+)/);
              const key = res ? res[1] : src;
              if (!imgSet.has(key)) imgSet.set(key, src);
            }
          }
        }
      } catch { /* skip */ }
    });
    const og = $('meta[property="og:image"]').attr("content");
    if (og) imgSet.set("og", og);
  }

  vessel.images = Array.from(imgSet.values()).map(src => ({ src, alt: vessel.name }));
  vessel.images = dedupeImages(vessel.images);

  // ── Videos — scrape Bunny CDN iframes and YouTube from #video section ────
  const videos: VesselVideo[] = [];
  $("#video .jsVideoOverlay, #video .jsVideoApiItem").each((_, el) => {
    const embedType = $(el).attr("data-embed-type") || "";
    const embedId   = $(el).attr("data-embed-id") || "";
    const ytId      = $(el).attr("data-yt-video-id") || "";
    // Thumbnail from background-image on parent
    const thumbStyle = $(el).closest(".jsVideoApiItem").find("[style*='background-image']").attr("style") || "";
    const thumbM = thumbStyle.match(/url\(([^)]+)\)/);
    const thumbnail = thumbM ? thumbM[1].replace(/&amp;/g, "&") : undefined;

    if (embedType === "BUNNY" && embedId) {
      // Bunny CDN format: https://iframe.mediadelivery.net/embed/{library}/{videoId}
      const libraryM = $.html().match(/mediadelivery\.net\/embed\/(\d+)\//);
      const library = libraryM ? libraryM[1] : "491116"; // fallback from known pattern
      videos.push({
        type: "bunny",
        url: `https://iframe.mediadelivery.net/embed/${library}/${embedId}?autoplay=false`,
        thumbnail,
      });
    } else if (ytId && !embedType) {
      videos.push({ type: "youtube", url: `https://www.youtube.com/embed/${ytId}`, thumbnail });
    }
  });

  // Also catch YouTube IDs stored as data-embed-id when type is not BUNNY
  $("#video [data-embed-id]").each((_, el) => {
    const embedType = $(el).attr("data-embed-type") || "";
    const embedId   = $(el).attr("data-embed-id") || "";
    if (!embedType || embedType === "YOUTUBE") {
      if (embedId && /^[A-Za-z0-9_-]{11}$/.test(embedId) && !videos.some(v => v.url.includes(embedId))) {
        videos.push({ type: "youtube", url: `https://www.youtube.com/embed/${embedId}` });
      }
    }
  });

  if (videos.length) vessel.videos = videos;

  return vessel;
}

// ── Spec mapping ─────────────────────────────────────────────────────────────

function mapSpec(vessel: VesselData, rawLabel: string, rawValue: string): void {
  const label = rawLabel.toLowerCase().trim();
  const rawVal = clean(rawValue);
  if (!rawVal || rawVal === "—" || rawVal === "-" || rawVal === "n/a") return;

  // Fields that should show dual metric/imperial
  const DUAL_FIELDS = new Set(["length","length waterline","beam","draft","fuel capacity","freshwater capacity","water capacity"]);
  const value = DUAL_FIELDS.has(label) ? dualMeasure(rawVal) : rawVal;

  const set = (field: keyof VesselData) => {
    if (!(vessel as Record<string, unknown>)[field as string]) (vessel as unknown as Record<string, unknown>)[field as string] = value;
  };
  const setNum = (field: keyof VesselData) => {
    if (!(vessel as Record<string, unknown>)[field as string]) {
      const m = value.replace(/,/g, "").match(/[\d.]+/);
      if (m) (vessel as unknown as Record<string, unknown>)[field as string] = parseFloat(m[0]);
    }
  };

  if (label.includes("builder") || label.includes("shipyard"))     { if (!vessel.builder) vessel.builder = value; }
  else if (label === "built" || label === "year" || label.startsWith("year")) { setNum("year"); }
  else if (label.includes("current name"))                          { if (!vessel.name) vessel.name = value; }
  else if (label.includes("flag"))                                  { set("flagState"); }
  else if (label.includes("naval arch"))                            { set("navalArchitect"); }
  else if (label.includes("exterior design"))                       { set("exteriorDesign"); }
  else if (label.includes("interior design"))                       { set("interiorDesign"); }
  else if (label === "length" || label === "loa" || label.includes("length overall")) {
    if (!vessel.loa) vessel.loa = value;
  }
  else if (label.includes("waterline"))                             { set("lwl"); }
  else if (label === "beam" || label === "breadth")                  { set("beam"); }
  else if (label === "draft" || label === "draught")                 { set("draft"); }
  else if (label === "gt" || label.includes("gross ton"))           { set("grossTonnage"); }
  else if (label.includes("displacement"))                          { set("displacement"); }
  else if (label.includes("hull type") || label.includes("hull form")) { set("hullForm"); }
  else if (label.includes("hull material") || label.includes("hull construction")) { set("hullMaterial"); }
  else if (label === "superstructure")                              { set("superstructure"); }
  else if (label.includes("deck material"))                         { set("deckMaterial"); }
  else if (label === "decks" || label.includes("number of deck"))   { set("deckCount"); }
  else if (label.includes("fuel capacity") || label.includes("fuel tank")) { set("fuelTank"); }
  else if (label.includes("freshwater") || label.includes("fresh water")) { set("freshWater"); }
  else if (label.includes("max speed") || label.includes("top speed") || label.includes("maximum speed")) { set("maxSpeed"); }
  else if (label.includes("cruise") || label.includes("service speed")) { set("cruiseSpeed"); }
  else if (label === "range" || label.includes("range"))             { set("range"); }
  else if (label === "engine" || label.includes("engine "))          { set("engines"); }
  else if (label === "type" && !vessel.engines)                     { /* skip ambiguous */ }
  else if (label.includes("total power"))                           { set("power"); }
  else if (label === "power" && !vessel.power)                      { set("power"); }
  else if (label.includes("propulsion"))                            { set("propulsion"); }
  else if (label.includes("guests") || label.includes("passengers")) {
    if (!vessel.guests) vessel.guests = value;
  }
  else if (label.includes("cabins") || label.includes("staterooms")) {
    if (!vessel.staterooms) vessel.staterooms = value;
  }
  else if (label === "crew" || label.includes("crew capacity"))     { set("crew"); }
  else if (label.includes("price") || label === "asking price")     { set("price"); }
  else if (label.includes("classification"))                        { set("classification"); }
  else if (label.includes("location") || label.includes("lying"))   { set("location"); }
}

/** Mine the free-text description for specs like engines, range, fuel */
function mineDescriptionText(vessel: VesselData, text: string): void {
  if (!text) return;

  // Engines: "twin diesel Volvo Penta (D16-MH) 750hp"
  if (!vessel.engines) {
    const m = text.match(/Powered by ([^,\.]+?engines?[^,\.]*)/i) ||
              text.match(/(\d+\s*x\s*[\w\s\-\(\)]+?(?:hp|kw)[\w\s\-\(\)]*(?:engines?|motors?))/i);
    if (m) vessel.engines = clean(m[1]);
  }

  // Power
  if (!vessel.power) {
    const m = text.match(/(\d[\d,]+\s*hp)/i);
    if (m) vessel.power = m[1];
  }

  // Cruise speed: "cruises at 13 knots"
  if (!vessel.cruiseSpeed) {
    const m = text.match(/cruise[sd]? at (\d+(?:\.\d+)?\s*knots?)/i) ||
              text.match(/cruising speed.*?(\d+(?:\.\d+)?\s*knots?)/i);
    if (m) vessel.cruiseSpeed = m[1];
  }

  // Max speed: "top speed of 14 knots"
  if (!vessel.maxSpeed) {
    const m = text.match(/top speed of (\d+(?:\.\d+)?\s*knots?)/i) ||
              text.match(/max(?:imum)? speed.*?(\d+(?:\.\d+)?\s*knots?)/i);
    if (m) vessel.maxSpeed = m[1];
  }

  // Range: "3,500 nautical miles at 10 knots"
  if (!vessel.range) {
    const m = text.match(/([\d,]+)\s*(?:nautical miles?|nm)[^\.]*(?:at|@)\s*(\d+)/i);
    if (m) vessel.range = `${m[1]}nm @ ${m[2]} knots`;
  }

  // Fuel tank: "24,620 litre fuel tanks"
  if (!vessel.fuelTank) {
    const m = text.match(/([\d,]+)\s*(?:litre|liter|gallon)/i);
    if (m) vessel.fuelTank = clean(m[0]);
  }

  // Guests/staterooms from accommodation text
  if (!vessel.guests) {
    const m = text.match(/accommodation for up to (\d+) guests?/i);
    if (m) vessel.guests = m[1];
  }
  if (!vessel.staterooms) {
    const m = text.match(/(\d+) suites?|(\d+) staterooms?|(\d+) cabins?/i);
    if (m) vessel.staterooms = (m[1] || m[2] || m[3]);
  }
  if (!vessel.crew) {
    const m = text.match(/up to (\d+) crew/i);
    if (m) vessel.crew = m[1];
  }
}
