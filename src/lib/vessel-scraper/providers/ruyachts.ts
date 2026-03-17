/**
 * RUYachts scraper (ruyachts.com)
 * Site renders server-side — plain fetch works fine.
 * Spec layout: definition-list style with label/value pairs,
 * grouped into "Machinery", "Capacities", "Class/type" sections.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

export async function scrapeRUYachts(url: string): Promise<VesselData> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ruyachts fetch ${res.status}`);
  const html = await res.text();
  return parseRUYachts(url, html);
}

function parseRUYachts(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── Name: h1 or page title ───────────────────────────────────────────────
  vessel.name = cleanHeadline(
    $("h1").first().text() ||
    $('meta[property="og:title"]').attr("content") ||
    $("title").text()
  );
  // Strip site suffix
  vessel.name = vessel.name.replace(/\s*[|\-–]\s*Romeo United Yachts.*$/i, "").trim();
  vessel.name = vessel.name.replace(/\s+for sale\s*/i, " ").trim();
  vessel.name = vessel.name.replace(/\s+Yacht\s*$/i, "").trim();

  // ── Description ──────────────────────────────────────────────────────────
  const descEl = $(".description, [class*='overview'], [class*='about'], article p").first();
  if (descEl.length) vessel.description = clean(descEl.text());

  // ── Spec tables — ruyachts uses a grid of label+value divs/cells ─────────
  // Strategy 1: Find all elements that look like spec rows
  // They render as: <div class="spec-row"> or <tr><th>Label</th><td>Value</td></tr>
  // or <dl><dt>Label</dt><dd>Value</dd></dl>

  // DT/DD pairs
  $("dt").each((_, el) => {
    const label = clean($(el).text());
    const value = clean($(el).next("dd").text());
    if (label && value) assignSpec(vessel, label, value);
  });

  // Table th/td rows
  $("table tr, [class*='spec'] tr, [class*='table'] tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) {
      assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
    }
  });

  // ── RUYachts specific: adjacent div pairs (label then value sibling) ──────
  // Their spec grid uses alternating divs: label div followed by value div
  $("[class*='spec'], [class*='detail'], [class*='characteristic']").each((_, container) => {
    const children = $(container).children().toArray();
    for (let i = 0; i < children.length - 1; i++) {
      const label = clean($(children[i]).text());
      const value = clean($(children[i + 1]).text());
      if (label && value && label.length < 60 && value.length < 200) {
        assignSpec(vessel, label, value);
      }
    }
  });

  // ── Paragraph-based specs (strong + text pattern) ─────────────────────────
  $("p, li").each((_, el) => {
    const text = clean($(el).text());
    // "Label: Value" pattern
    const colonMatch = text.match(/^([^:]{2,50}):\s*(.+)$/);
    if (colonMatch) assignSpec(vessel, colonMatch[1], colonMatch[2]);
  });

  // ── Direct text parsing from rendered HTML ─────────────────────────────────
  // ruyachts.com puts specs in structured rows visible in HTML source
  const bodyText = $("body").text();

  // Extract specs from text using label: value pattern anywhere in body
  const specPatterns: [RegExp, string][] = [
    [/Model\n([^\n]+)/, "model"],
    [/Builder\n([^\n]+)/, "builder"],
    [/Delivery\n(\d{4})/, "year"],
    [/Length,\s*m\n([\d.]+)/, "loa"],
    [/Beam,\s*m\n([\d.]+)/, "beam"],
    [/Draught,\s*m\n([\d.]+)/, "draft"],
    [/Range,\s*nm\n([\d,]+)/, "range"],
    [/Top speed,\s*knots\n([\d.]+)/, "maxSpeed"],
    [/Cruising speed,\s*knots\n([\d.]+)/, "cruiseSpeed"],
    [/Displacement,\s*tons\n([\d,]+)/, "displacement"],
    [/Fuel,\s*l\n([\d,]+)/, "fuelTank"],
    [/Fresh water,\s*l\n([\d,]+)/, "freshWater"],
    [/Gross tonnage,\s*grt\n([\d,]+)/, "grossTonnage"],
    [/Cabins\n(\d+)/, "staterooms"],
    [/Guests\n(\d+)/, "guests"],
    [/Crew\n(\d+)/, "crew"],
    [/Crew cabins\n(\d+)/, "crewCabins"],
    [/Propulsion type\n([^\n]+)/, "propulsion"],
    [/Engines\n([^\n]+)/, "engines"],
    [/Engine power,\s*hp\n([^\n]+)/, "power"],
    [/Interior design\n([^\n]+)/, "interiorDesign"],
    [/Exterior design\n([^\n]+)/, "exteriorDesign"],
    [/Hull material\n([^\n]+)/, "hullMaterial"],
    [/Hull type\n([^\n]+)/, "hullForm"],
    [/Superstructure\n([^\n]+)/, "superstructure"],
  ];

  for (const [regex, field] of specPatterns) {
    const m = bodyText.match(regex);
    if (m && m[1]) {
      const val = clean(m[1]);
      if (val && !(vessel as Record<string,unknown>)[field]) {
        assignSpec(vessel, field.replace(/([A-Z])/g, ' $1').trim(), val);
      }
    }
  }

  // ── Images ────────────────────────────────────────────────────────────────
  $("img[src], img[data-src]").each((_, img) => {
    const src =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("src") || "";
    const alt = clean($(img).attr("alt") || "");
    // Exclude logos, placeholders, no-photo images
    if (!src || /logo|icon|sprite|no-photo|placeholder|\.svg/i.test(src)) return;
    if (!/^https?:\/\//i.test(src)) {
      // Relative URL — make absolute
      try {
        const base = new URL(url);
        const abs = new URL(src, base).href;
        vessel.images.push({ src: abs, alt });
      } catch { /* skip */ }
      return;
    }
    vessel.images.push({ src, alt });
  });

  vessel.images = dedupeImages(vessel.images);

  // ── OG image as hero fallback ─────────────────────────────────────────────
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && vessel.images.length === 0) {
    vessel.images.push({ src: ogImg, alt: vessel.name });
  }

  // ── Price / location DOM fallbacks ────────────────────────────────────────
  if (!vessel.price) vessel.price = clean($('[class*="price" i]').first().text());
  if (!vessel.location) vessel.location = clean($('[class*="location" i], [class*="lying" i]').first().text());

  return vessel;
}
