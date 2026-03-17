/**
 * Ocean King scraper — v3
 * Plain fetch() + cheerio. NO Puppeteer.
 *
 * ROOT CAUSE OF v2 BUG: body-text fallback was pairing label[n] → label[n+1]
 * instead of label[n] → value[n] because section headers (HULL, SIZE, etc.)
 * were interspersed, throwing off the consecutive-line pairing.
 *
 * FIX: State-machine parser. We know every possible spec label. When we
 * recognise a label, we hold it and wait for the NEXT line that ISN'T another
 * known label or section header — that's the value.
 *
 * Page structure (confirmed from transcript of Explorer 34M build):
 *
 *   <li>
 *     Length over all          ← text node (label)
 *     <p>34,00 m - 111,54 FT</p>  ← child element (value)
 *   </li>
 *
 * Specs appear TWICE in the DOM (tab nav + active panel). "First wins" logic
 * in assignSpec deduplicates automatically.
 */

import * as cheerio from "cheerio";
import type { VesselData, VesselImage } from "../types";
import { emptyVessel } from "../types";

const BASE_URL = "https://oceanking.it";

// ── Section headers to SKIP (they are tab names, not spec labels) ─────────
const SECTION_HEADERS = new Set([
  "hull", "size", "propulsion", "performance",
  "tank capacities", "tanks", "accommodation",
  "architecture & design", "architecture and design", "design",
]);

// ── Master spec map: every label Ocean King uses, mapped to VesselData field ─
type SpecEntry = { patterns: RegExp[]; field: keyof VesselData };

const SPEC_MAP: SpecEntry[] = [
  // Dimensions
  { patterns: [/length\s*over\s*all|l\.o\.a\b|^loa$/i],             field: "loa" },
  { patterns: [/length\s*(water\s*)?line|lwl\b/i],                   field: "lwl" },
  { patterns: [/max\s*beam|maximum\s*beam|^beam$/i],                 field: "beam" },
  { patterns: [/^draft$|^draught$/i],                                field: "draft" },
  { patterns: [/displacement/i],                                     field: "displacement" },
  { patterns: [/gross\s*tonnage|^gt$/i],                             field: "grossTonnage" },
  // Hull & Classification
  { patterns: [/classification|^class$/i],                           field: "classification" },
  { patterns: [/hull\s*type|hull\s*form/i],                         field: "hullForm" },
  { patterns: [/material\s*of\s*hull|hull\s*material/i],            field: "hullMaterial" },
  { patterns: [/material\s*of\s*super|superstructure/i],            field: "superstructure" },
  // Architecture & Design
  { patterns: [/e[sx]terior\s*design/i],                            field: "exteriorDesign" },
  { patterns: [/interior\s*design/i],                               field: "interiorDesign" },
  { patterns: [/naval\s*arch|engineering(?!\s*detail)/i],           field: "navalArchitect" },
  // Propulsion
  { patterns: [/main\s*engine|^engines?$/i],                        field: "engines" },
  { patterns: [/power\s*output|total\s*power/i],                    field: "power" },
  { patterns: [/gearbox/i],                                         field: "gearbox" },
  { patterns: [/^propulsion$/i],                                    field: "propulsion" },
  { patterns: [/propeller/i],                                       field: "propellers" },
  { patterns: [/genset|generator\s*set/i],                         field: "gensets" },
  { patterns: [/bow\s*thruster/i],                                  field: "bowThruster" },
  { patterns: [/stern\s*thruster/i],                                field: "sternThruster" },
  { patterns: [/air\s*cond|hvac|a\/c\b/i],                         field: "airCon" },
  // Performance
  { patterns: [/max\s*speed|maximum\s*speed/i],                     field: "maxSpeed" },
  { patterns: [/cruising?\s*speed/i],                               field: "cruiseSpeed" },
  { patterns: [/^range\b|range\s*@/i],                              field: "range" },
  // Tanks
  { patterns: [/fuel\s*(?:tank|cap|oil|capacity)|\bfuel\b/i],      field: "fuelTank" },
  { patterns: [/fresh\s*water|potable/i],                          field: "freshWater" },
  { patterns: [/black[\-\s]*grey|holding\s*tank|waste\s*water/i],  field: "holdingTank" },
  { patterns: [/lube\s*oil/i],                                     field: "lubeOil" },
  // Accommodation
  { patterns: [/^guest$|^guests?$/i],                              field: "guests" },
  { patterns: [/stateroom|guest\s*cabin|cabins?\s*\(n\)/i],       field: "staterooms" },
  { patterns: [/^crew$/i],                                         field: "crew" },
  { patterns: [/crew\s*cabin|crew\s*state/i],                     field: "crewCabins" },
  { patterns: [/tender|garage/i],                                  field: "tender" },
  { patterns: [/living\s*space|interior\s*area/i],                field: "livingSpace" },
  // Systems
  { patterns: [/stabilise?r/i],                                    field: "stabilisers" },
  { patterns: [/water\s*maker|watermaker/i],                       field: "waterMaker" },
  { patterns: [/flag/i],                                           field: "flagState" },
];

function findField(label: string): keyof VesselData | null {
  const l = label.trim().toLowerCase().replace(/\s+/g, " ");
  for (const { patterns, field } of SPEC_MAP) {
    if (patterns.some(p => p.test(l))) return field;
  }
  return null;
}

function isKnownLabel(text: string): boolean {
  return findField(text) !== null;
}

function isSectionHeader(text: string): boolean {
  return SECTION_HEADERS.has(text.trim().toLowerCase());
}

function assignSpec(vessel: VesselData, label: string, value: string) {
  const v = value.trim().replace(/\s+/g, " ");
  if (!v || v === "—" || v === "-" || v.length < 1) return;

  const field = findField(label);
  if (!field) return;

  if (field === "year") {
    if (!vessel.year) {
      const y = parseInt(v.replace(/\D/g, "").slice(0, 4));
      if (y > 1990 && y <= new Date().getFullYear() + 10) vessel.year = y;
    }
    return;
  }

  const current = vessel[field];
  if (typeof current === "string" && current === "") {
    (vessel as unknown as Record<string, unknown>)[field] = v;
  }
}

// ── Main scraper ─────────────────────────────────────────────────────────
export async function scrapeOceanKing(url: string): Promise<VesselData> {
  const vessel = emptyVessel(url);
  vessel.builder = "Ocean King Yachts";

  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // ── Name ──────────────────────────────────────────────────────────────
  const h1 = $("h1").first().text().trim();
  if (h1 && h1.length < 100) vessel.name = h1;

  if (!vessel.name) {
    vessel.name = $("title").text()
      .replace(/[-|–].*ocean king.*/i, "")
      .replace(/ocean king\s*/i, "")
      .trim();
  }

  // ── Description ───────────────────────────────────────────────────────
  // Ocean King uses <h6> for tagline paragraphs (confirmed in transcript)
  const descParts: string[] = [];
  $("h6").each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 20 && !/©|cookie|privacy|range|fleet|doge|ducale|explorer|custom/i.test(t)) {
      descParts.push(t);
    }
  });
  // Fallback to <p> intro text
  if (descParts.length === 0) {
    $("p").each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 60 && !/©|p\.iva|all rights|cookie/i.test(t) && descParts.length < 4) {
        descParts.push(t);
      }
    });
  }
  vessel.description = [...new Set(descParts)].slice(0, 4).join("\n\n");

  // ── Specifications: Method 1 — parse <li> elements ───────────────────
  //
  // Ocean King confirmed structure (from Explorer 34M transcript):
  // Each <li> can contain MULTIPLE label/value pairs:
  //
  //   <li>
  //     Hull type                          ← label text node
  //     <p>Full displacement with Bow Bulb</p>   ← value
  //     Material of Hull                   ← next label text node
  //     <p>AH36 HIGH STRENGTH STEEL</p>    ← next value
  //     ...
  //   </li>
  //
  // Strategy: strip all tags from innerHTML, split on newlines,
  // then run the state machine on all resulting lines.
  $("li").each((_, li) => {
    const $li = $(li);

    const raw = ($li.html() || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|span|li|h[1-6]|strong|em|b)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();

    const lines = raw.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);

    // State-machine over all lines in this <li>
    let pending: string | null = null;
    for (const line of lines) {
      if (isSectionHeader(line)) { pending = null; continue; }
      if (isKnownLabel(line)) {
        pending = line;
        continue;
      }
      if (pending && line !== pending && line.length > 0 && line.length < 200) {
        assignSpec(vessel, pending, line);
        pending = null;
      }
    }
  });

  // ── Specifications: Method 2 — state-machine body text sweep ─────────
  // For any fields still missing. Walks text lines and holds a "pending label"
  // until a VALUE line (not another label, not a section header) is found.
  //
  // This fixes the v2 bug: we no longer blindly pair i → i+1.
  // Instead: when we see a KNOWN LABEL, we set pendingLabel.
  // The NEXT line that is NOT a known label and NOT a section header = value.
  if (!vessel.loa || !vessel.beam || !vessel.draft) {
    const textLines = collectTextLines($);

    let pendingLabel: string | null = null;

    for (const line of textLines) {
      const clean = line.trim().replace(/\s+/g, " ");
      if (!clean || clean.length < 1) continue;

      // Skip nav junk
      if (/^(home|range|fleet|company|news|contacts?|about|back|menu|english|italiano|deutsch|français|©|\+39)/i.test(clean)) continue;

      // Is this a section header? Clear pending, move on.
      if (isSectionHeader(clean)) {
        pendingLabel = null;
        continue;
      }

      // Is this a known spec label?
      if (isKnownLabel(clean)) {
        pendingLabel = clean;
        continue;
      }

      // If we have a pending label and this line looks like a value → assign
      if (pendingLabel) {
        // Value heuristics: has a digit, or is a proper noun / material name
        const looksLikeValue =
          /\d/.test(clean) ||                        // has a number
          /\b(steel|alloy|shaft|direct|rina|vyd|hydro|burdiss|innave|ginton|alumin|light|full\s*disp|displacement)/i.test(clean) ||
          clean.length > 3;                          // non-trivial text

        if (looksLikeValue && clean.length < 200) {
          assignSpec(vessel, pendingLabel, clean);
          pendingLabel = null;
        }
      }
    }
  }

  // ── Images ────────────────────────────────────────────────────────────
  const seen = new Set<string>();
  const images: VesselImage[] = [];

  function addImg(src: string, alt = "") {
    if (!src) return;
    const full = src.startsWith("http")
      ? src
      : `${BASE_URL}${src.startsWith("/") ? "" : "/"}${src}`;
    if (!/\/media\/images\//i.test(full)) return;
    if (/logo|icon|flag|sprite|placeholder|menu-bg/i.test(full)) return;
    if (seen.has(full)) return;
    seen.add(full);
    images.push({ src: full, alt: alt.trim() });
  }

  // <img> — src and data-src (lazy loaded)
  $("img").each((_, el) => {
    addImg(
      $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "",
      $(el).attr("alt") || ""
    );
  });

  // <a href> pointing at image files (lightbox full-res)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/\.(png|jpe?g|webp)/i.test(href)) addImg(href, "");
  });

  vessel.images = images;

  return vessel;
}

// ── Collect text lines from the DOM, preserving rough order ──────────────
function collectTextLines($: ReturnType<typeof cheerio.load>): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  $("body *").each((_, el) => {
    const tag = (el as unknown as { tagName?: string }).tagName?.toLowerCase() || "";
    if (["script", "style", "noscript", "nav", "header", "footer", "meta", "link"].includes(tag)) return;

    const $el = $(el);
    // Only process leaf-ish nodes to avoid double-counting parent+child text
    if ($el.children("p,div,section,article,ul,ol,table,li").length > 0) return;

    const t = $el.text().trim().replace(/\s+/g, " ");
    if (t && t.length >= 2 && t.length <= 200 && !seen.has(t)) {
      seen.add(t);
      lines.push(t);
    }
  });

  return lines;
}

// ── HTTP fetch with browser headers ──────────────────────────────────────
async function fetchPage(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
  };

  const candidates = url.endsWith("/") ? [url, url.slice(0, -1)] : [url, url + "/"];
  let lastErr: unknown;

  for (const u of candidates) {
    try {
      const res = await fetch(u, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
      const html = await res.text();
      if (html.length < 500) throw new Error(`Response too short (${html.length} bytes)`);
      return html;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error(`Failed to fetch ${url}`);
}
