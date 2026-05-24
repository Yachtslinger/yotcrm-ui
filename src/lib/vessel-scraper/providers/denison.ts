/**
 * Denison Yachting / Denison Yacht Sales scraper — v2
 * Sites: denisonyachtsales.com, denisonyachting.com
 *
 * Captures: all spec fields, engine hours, generator hours,
 * navigation suite, comms, stabilisers, tender, EUR prices,
 * classification, accommodation details, safety equipment.
 */

import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function scrapeDenison(url: string): Promise<VesselData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let html: string;
  try {
    const res = await fetch(url, {
      cache: "no-store", redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Denison fetch failed (${res.status})`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }
  return parseDenison(url, html);
}

/** Decode HTML entities + sanitise control chars inside JSON string values */
function decodeEntities(s: string): string {
  const decoded = s
    .replace(/&#039;/g, "'").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&apos;/g, "'");
  const out: string[] = [];
  let inStr = false, esc = false;
  for (let i = 0; i < decoded.length; i++) {
    const ch = decoded[i];
    if (esc) { out.push(ch); esc = false; continue; }
    if (ch === "\\" && inStr) { out.push(ch); esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out.push(ch); continue; }
    if (inStr && ch.charCodeAt(0) < 32) { out.push(" "); continue; }
    out.push(ch);
  }
  return out.join("");
}

function upscaleBoatsgroup(src: string): string {
  return src
    .replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, "1200"))
    .replace(/[?&]h=\d+/g, "").replace(/[?&]format=webp/g, "")
    .replace(/[?&]exact/g, "").replace(/&&+/g, "&")
    .replace(/[?&]$/, "").replace(/\?&/, "?");
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder|language-flag|Arrow|Image-3\d\d/i.test(src);
}

/** Pull a value after a label, stopping before the next label or end of section */
function extract(text: string, pattern: RegExp, maxLen = 120): string {
  const m = text.match(pattern);
  if (!m) return "";
  const after = text.slice(m.index! + m[0].length).trim();
  // Stop at a blank line, a line that's ALL CAPS (section header), or maxLen
  const stop = after.search(/\n\s*\n|\n[A-Z][A-Z\s&\/]{4,}:/);
  return (stop > 0 ? after.slice(0, Math.min(stop, maxLen)) : after.slice(0, maxLen)).trim();
}

/** Format tank value "N x QTY|unit" → "QTY unit / QTY unit" */
function parseTank(raw: string): string {
  const m = raw.match(/^(\d+)\s*x\s*([\d,]+)\s*\|?\s*(gallon|gal|lt|litre|liter)/i);
  if (!m) return ""; // unparseable — return empty, never pass raw text through
  const total = parseInt(m[1]) * parseInt(m[2].replace(/,/g, ""));
  if (/gal/i.test(m[3])) return `${total.toLocaleString()} gal / ${Math.round(total * 3.78541).toLocaleString()} lt`;
  return `${total.toLocaleString()} lt / ${Math.round(total / 3.78541).toLocaleString()} gal`;
}

function parseDenison(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── 1. Full page text — preserve newlines for section parsing ────────────
  // We need the raw text with sections intact for machinery/nav parsing
  const bodyText = $("body").text()
    .replace(/\t/g, " ").replace(/ {3,}/g, "  ").replace(/\r\n/g, "\n");

  // Flat version for simple colon/dash extractions
  const flat = bodyText.replace(/\n/g, " ").replace(/\s{2,}/g, " ");

  // ── 2. JSON-LD ────────────────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = decodeEntities($(el).text());
    let json: Record<string, unknown>;
    try { json = JSON.parse(raw); } catch { return; }
    const nodes: Record<string, unknown>[] = Array.isArray(json)
      ? json : json["@graph"] ? (json["@graph"] as Record<string, unknown>[]) : [json];

    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const type = String(node["@type"] || "").toLowerCase();
      if (!/vehicle|product|boat/i.test(type) && !node.offers) continue;

      // Price — handle both USD and EUR
      const offers = (node.offers as Record<string, unknown>) || {};
      if (offers.price && !vessel.price) {
        const p = Number(offers.price);
        const currency = String(offers.priceCurrency || "USD");
        const sym = currency === "EUR" ? "€" : "$";
        vessel.price = !isNaN(p) ? `${sym}${p.toLocaleString("en-US")}` : String(offers.price);
      }

      // Builder
      const brand = (node.brand as Record<string, string>);
      if (brand?.name && !vessel.builder) vessel.builder = clean(brand.name);

      // Year from description
      if (!vessel.year && node.description) {
        const desc = String(node.description);
        const ym = desc.match(/\bin\s+((?:19|20)\d{2})\b/i) || desc.match(/\b((?:19|20)\d{2})\b/);
        if (ym) vessel.year = parseInt(ym[1]);
      }

      // Location
      if (!vessel.location && node.description) {
        const desc = String(node.description);
        const locm = desc.match(/located in ([A-Za-z ,]+?)(?:\.|;|and )/i);
        if (locm) vessel.location = clean(locm[1]);
      }

      // Thumb image from JSON-LD
      const ldImg = node.image as string | undefined;
      if (ldImg && /^https?:\/\//i.test(ldImg))
        vessel.images.push({ src: upscaleBoatsgroup(ldImg), alt: "" });

      // additionalProperty specs
      const props = Array.isArray(node.additionalProperty)
        ? (node.additionalProperty as { name?: string; value?: string }[]) : [];
      for (const prop of props) {
        if (prop.name && prop.value) assignSpec(vessel, prop.name, String(prop.value));
      }
    }
  });

  // ── 3. Name, description ─────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1").first().text().replace(/Yacht for Sale/i, "").trim()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content")) || "";

  // Collect ALL listing body paragraphs — Claude needs the full text to summarize well
  if (!vessel.description) {
    const paras: string[] = [];
    const JUNK = /privacy\s*policy|cookie|newsletter|inquire|fill\s*out\s*the\s*form|our\s*team|contact|disclaimer|offered\s*(as\s*a\s*convenience|subject\s*to)|denison\s*yacht\s*sales\s*offers|cannot\s*guarantee|broker/i;
    $("p").each((_, p) => {
      const t = clean($(p).text());
      if (t.length < 60) return;                          // skip short snippets
      if (JUNK.test(t)) return;                           // skip boilerplate
      if (!/\b(yacht|vessel|built|motor|sail|feet|meter|knot|cabin|stateroom|delivered|commissioned|design|interior|exterior|hull|engine|speed|range|deck|suite|guest|owner|charter|tender)\b/i.test(t)) return;
      paras.push(t);
    });
    if (paras.length) vessel.description = paras.join("\n\n").slice(0, 6000);
  }
  if (!vessel.description)
    vessel.description = clean($('meta[property="og:description"]').attr("content"));

  // ── 4. Highlights / features list ────────────────────────────────────────
  const feats: string[] = [];
  $("h2,h3,h4").filter((_, el) => /feature|highlight|key/i.test($(el).text()))
    .first().nextUntil("h2,h3,h4").find("li").each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 8 && t.length < 200) feats.push(t);
    });
  vessel.features = [...new Set(feats)].slice(0, 20);

  // ── 5. Highlights panel spec fields (Asking Price, Max Draft, etc.) ───────
  if (!vessel.price) {
    const priceEl = $('[class*="price" i], .asking-price, .yacht-price').first().text();
    if (priceEl) {
      const pm = priceEl.match(/([€$£][\d,]+(?:\.\d+)?(?:\s*M(?:illion)?)?)/i);
      if (pm) vessel.price = pm[1].trim();
    }
    // Also try meta
    if (!vessel.price) {
      const ogDesc = $('meta[property="og:description"]').attr("content") || "";
      const pm2 = ogDesc.match(/asking\s+price[:\s]+([€$£][\d,]+)/i);
      if (pm2) vessel.price = pm2[1];
    }
  }

  // ── 6. EUR price from "KOKORO HIGHLIGHTS" section ────────────────────────
  if (!vessel.price) {
    const pm = flat.match(/Asking\s+Price[:\s]+([€$£][\d,]+(?:\.\d+)?(?:\s*(?:M|Million))?)/i);
    if (pm) vessel.price = pm[1].trim();
  }

  if (!vessel.location)
    vessel.location = clean($('[class*="location" i], .location').first().text());

  // ── 7. SPECIFICATIONS block (flat colon-separated fields) ─────────────────
  const specBlock = flat.match(/SPECIFICATIONS\s+(.+?)(?:MACHINERY|GENERATORS|NAVIGATION|COMMUNICATION|SAFETY|ANCILLARY|TANK|DECK|GALLEY|ACCOMMODATION|AUDIO)/i)?.[1] || "";

  const specGet = (pattern: RegExp): string => {
    const m = specBlock.match(pattern) || flat.match(pattern);
    return m ? m[1].trim() : "";
  };

  if (!vessel.maxSpeed)    vessel.maxSpeed    = specGet(/Maximum\s+Speed[:\s]+([\d.]+\s*kn)/i);
  if (!vessel.cruiseSpeed) vessel.cruiseSpeed = specGet(/Cruising\s+Speed[:\s]+([\d.]+\s*kn)/i);
  if (!vessel.beam)        vessel.beam        = specGet(/Beam[:\s]+([\d'\s"]+(?:m|ft)?)/i);
  if (!vessel.draft)       vessel.draft       = specGet(/Max\s+Draft[:\s]+([\d'\s"]+(?:m|ft)?)/i);
  if (!vessel.hullMaterial) vessel.hullMaterial = specGet(/Hull\s+Material[:\s]+([A-Za-z]+)/i);
  if (!vessel.staterooms)  vessel.staterooms  = specGet(/Cabins[:\s]+(\d+)/i);
  if (!vessel.guests) {
    const g = specGet(/Heads[:\s]+(\d+)/i);
    // heads is not guests — skip. Use passengers field instead
    const gp = specGet(/Max\s*Passengers[:\s]+(\d+)/i);
    if (gp) vessel.guests = gp;
  }

  // Tanks
  if (!vessel.fuelTank) {
    const r = specGet(/Fuel\s*Tank:\s*(\d+\s*x\s*[\d,]+\s*\|?\s*(?:gallon|gal|litre|liter|lt)s?)/i);
    if (r) vessel.fuelTank = parseTank(r);
  }
  if (!vessel.freshWater) {
    const r = specGet(/Fresh\s*Water:\s*(\d+\s*x\s*[\d,]+\s*\|?\s*(?:gallon|gal|litre|liter|lt)s?)/i);
    if (r) vessel.freshWater = parseTank(r);
  }
  if (!vessel.holdingTank) {
    const r = specGet(/Holding:\s*(\d+\s*x\s*[\d,]+\s*\|?\s*(?:gallon|gal|litre|liter|lt)s?)/i);
    if (r) vessel.holdingTank = parseTank(r);
  }

  // ── 8. MACHINERY section — engines, engine hours, stabilisers, bow thruster
  const machSection = bodyText.match(/MACHINERY\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n|\n\n[A-Z]{3})/)?.[1] || flat;

  if (!vessel.engines || /^\d+$/.test(vessel.engines.trim())) {
    // "2x Caterpillar C32 ACERT" / "Twin Caterpillar C18" / "twin Caterpillar 3508B"
    const em = machSection.match(/(?:Diesel\s+engines?|Main\s+engines?)[:\s]+(\d+x\s*[A-Za-z][A-Za-z0-9\s]+?)(?:\.|\n|ME Port)/i) ||
               machSection.match(/(\d+\s*[Xx×]\s*[A-Z][a-zA-Z]+\s+[A-Z0-9\-]+(?:\s+[A-Z]+)?)\s+(?:diesel|engine|\d+)/i) ||
               bodyText.match(/\b((?:[Tt]win|[Tt]wo|[Tt]riple|[Tt]hree|[Qq]uad)\s+[A-Z][a-zA-Z]+\s+[A-Z0-9][A-Z0-9\-]*(?:\s+[A-Z]+)?)\s+(?:diesel|engine)/);
    if (em) vessel.engines = clean(em[1]);
  }

  if (!vessel.engineHours) {
    // "ME Port - 1819hrs | ME Stbd - 1824hrs"
    let ph = machSection.match(/ME\s+Port\s*[-–]\s*([\d,]+)\s*hrs?/i);
    let sh = machSection.match(/ME\s+St(?:ar)?bd?\s*[-–]\s*([\d,]+)\s*hrs?/i);
    // Also: "Port CAT 3508B – 9,318 hrs." / "Starboard CAT 3508B – 9,339 hrs."
    if (!ph) ph = bodyText.match(/Port\s+[A-Z][\w\s\-]*?[–-]\s*([\d,]+)\s*hrs?/i);
    if (!sh) sh = bodyText.match(/St(?:ar)?b(?:oar)?d\s+[A-Z][\w\s\-]*?[–-]\s*([\d,]+)\s*hrs?/i);
    if (ph && sh) vessel.engineHours = `Port: ${ph[1]} hrs / Stbd: ${sh[1]} hrs`;
    else if (ph) vessel.engineHours = `${ph[1]} hrs`;
    else {
      // Fallback: "Engine Hours: 1,200"
      const eh = flat.match(/Engine\s+Hours?[:\s]+([\d,]+)/i);
      if (eh) vessel.engineHours = `${eh[1]} hrs`;
    }
  }

  if (!vessel.bowThruster) {
    const bt = machSection.match(/[Bb]ow\s+thruster[:\s]+([^\n.]+)/i);
    if (bt) vessel.bowThruster = clean(bt[1]);
    else if (/hydraulic.*bow.*thruster|bow.*thruster.*hydraulic/i.test(machSection))
      vessel.bowThruster = "Hydraulic";
  }
  if (!vessel.sternThruster) {
    const st = machSection.match(/[Ss]tern\s+thruster[:\s]+([^\n.]+)/i);
    if (st) vessel.sternThruster = clean(st[1]);
  }

  if (!vessel.stabilisers) {
    const stab = machSection.match(/[Ss]tabiliz?ation[:\s]+([^\n.]+)/i) ||
                 machSection.match(/(CMC|Seakeeper|Naiad|Trac|Quantum|ABT|Sleipner)\s+[^\n.]+(?:stabiliz?er|fin|gyro)/i);
    if (stab) vessel.stabilisers = clean(stab[1] || stab[0]);
    else if (/zero.speed\s+stabiliz/i.test(machSection)) vessel.stabilisers = "Zero-speed stabilisers";
    else if (/fin\s+stabiliz/i.test(machSection)) vessel.stabilisers = "Fin stabilisers";
  }
  if (!vessel.zeroSpeedStabilisers && /zero.speed\s+stabiliz/i.test(machSection))
    vessel.zeroSpeedStabilisers = "Yes";

  if (!vessel.range) {
    const rm = machSection.match(/[Rr]ange[:\s]+([\d,]+\+?)\s*(?:nautical\s*)?(?:miles?|nm)/i)
            || bodyText.match(/([\d,]{3,}\+?)\s*(?:nautical\s*miles?|nm)\b\s*(?:range|cruising)?/i);
    if (rm) vessel.range = `${rm[1]} nm`;
  }

  // ── 9. GENERATORS section ─────────────────────────────────────────────────
  const genSection = bodyText.match(/GENERATORS?\s*(?:&[^S\n]+)?\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n)/)?.[1] || "";

  if (!vessel.gensets && genSection) {
    const gm = genSection.match(/([Tt]wo|[Oo]ne|[Tt]hree|\d+)\s+([A-Za-z]+)\s+generators?[^,\n]*/i);
    if (gm) vessel.gensets = clean(gm[0]);
  }
  if (genSection) {
    // Generator hours: "Port - 3068hrs | Stbd - 3078hrs"
    const gpH = genSection.match(/Port\s*[-–]\s*([\d,]+)\s*hrs?/i);
    const gsH = genSection.match(/St(?:ar)?bd?\s*[-–]\s*([\d,]+)\s*hrs?/i);
    if (gpH && gsH && vessel.notes !== undefined) {
      const genHrsNote = `Generator hours — Port: ${gpH[1]} hrs / Stbd: ${gsH[1]} hrs`;
      vessel.notes = vessel.notes ? `${vessel.notes}; ${genHrsNote}` : genHrsNote;
    }
  }

  // ── 10. NAVIGATION section ────────────────────────────────────────────────
  const navSection = bodyText.match(/NAVIGATION\s*(?:EQUIPM?ENT)?\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n|\nDECK\s|\nGALLEY\s|\nACCOMM)/i)?.[1] || "";
  const navSearch = navSection || flat;

  if (!vessel.radar) {
    const rm = navSearch.match(/([A-Za-z]+)\s+radar(?:\s+IMO|\s+and\s+chart)?/i);
    if (rm) vessel.radar = clean(rm[0]);
  }
  if (!vessel.chartPlotter) {
    const cm = navSearch.match(/([A-Za-z]+)\s+(?:radar\s+and\s+)?chart\s+(?:plotter|system)/i);
    if (cm) vessel.chartPlotter = clean(cm[0]);
  }
  if (!vessel.autopilot) {
    const am = navSearch.match(/([A-Za-z]+)\s+[Aa]utopilot/i);
    if (am) vessel.autopilot = clean(am[0]);
  }
  if (!vessel.aisSystem) {
    const aim = navSearch.match(/([A-Za-z]+)\s+AIS/i);
    if (aim) vessel.aisSystem = clean(aim[0]);
  }
  if (!vessel.anchoring) {
    // Windlasses
    const wm = navSearch.match(/([A-Za-z0-9\s]+windlass[^\n,.]+)/i);
    if (wm) vessel.anchoring = clean(wm[1]);
  }

  // Build navigation summary from what we found
  const navParts: string[] = [];
  if (vessel.radar)       navParts.push(vessel.radar);
  if (vessel.chartPlotter && vessel.chartPlotter !== vessel.radar) navParts.push(vessel.chartPlotter);
  if (vessel.autopilot)   navParts.push(vessel.autopilot);
  if (vessel.aisSystem)   navParts.push(vessel.aisSystem);
  const echoM = navSearch.match(/([A-Za-z]+)\s+[Ee]chosounder/i);
  if (echoM) navParts.push(clean(echoM[0]));
  const speedM = navSearch.match(/([A-Za-z]+)\s+[Dd]oppler\s+[Ss]peed\s+[Ll]og/i);
  if (speedM) navParts.push(clean(speedM[0]));
  if (!vessel.navigation && navParts.length) vessel.navigation = navParts.join(", ");

  // ── 11. COMMUNICATION section ─────────────────────────────────────────────
  const commSection = bodyText.match(/COMMUNICATION\s*(?:EQUIPM?ENT)?\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n)/i)?.[1] || "";
  const commSearch = commSection || flat;

  if (!vessel.satcom) {
    if (/Starlink/i.test(commSearch)) {
      const slCount = (commSearch.match(/Starlink/gi) || []).length;
      vessel.satcom = slCount > 1 ? `Starlink x${slCount}` : "Starlink";
    } else if (/Inmarsat/i.test(commSearch)) {
      vessel.satcom = "Inmarsat";
    } else if (/Iridium/i.test(commSearch)) {
      vessel.satcom = "Iridium";
    }
    // Inmarsat or Iridium alongside Starlink
    if (vessel.satcom && /Inmarsat|Iridium/i.test(commSearch) && /Starlink/i.test(commSearch)) {
      const ism = commSearch.match(/(Inmarsat|Iridium)/i);
      if (ism) vessel.satcom = `${vessel.satcom}, ${ism[1]} GMDSS`;
    }
  }

  // VHF count
  if (!vessel.navigation && /VHF/i.test(commSearch)) {
    const vhfM = commSearch.match(/(\d+)\s+(?:Sailor\s+)?VHF/i);
    if (vhfM) {
      const existing = vessel.navigation || "";
      const vhfStr = `${vhfM[0].trim()}`;
      vessel.navigation = existing ? `${existing}, ${vhfStr}` : vhfStr;
    }
  }

  // ── 12. SAFETY section ───────────────────────────────────────────────────
  const safetySection = bodyText.match(/SAFETY\s*(?:&\s*SECURITY)?\s*(?:EQUIPM?ENT)?\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n)/i)?.[1] || flat;

  if (!vessel.lifeRafts) {
    const lrM = safetySection.match(/(\d+)[^\n]*(?:ten|10)[^\n]*(?:person|man)[^\n]*life\s*raft/i) ||
                safetySection.match(/(\d+)\s*(?:x\s*)?\d+-person\s+life\s*raft/i) ||
                safetySection.match(/life\s*rafts?[:\s]+([^\n.]+)/i);
    if (lrM) vessel.lifeRafts = clean(lrM[0] || lrM[1]);
  }
  if (!vessel.fireSuppression) {
    const fsM = safetySection.match(/(NOVEC|FM-200|CO2|Halon)[^\n.]+(?:fire|suppression)[^\n.]*/i) ||
                safetySection.match(/fire\s+(?:suppression|extinguish)[^\n.]+/i);
    if (fsM) vessel.fireSuppression = clean(fsM[0]);
  }

  // ── 13. TENDER & WATERSPORT section ──────────────────────────────────────
  const tenderSection = bodyText.match(/TENDER[^\n]*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n|$)/i)?.[1] || flat;

  if (!vessel.tender) {
    // "Williams 565 Tender" or "6m (19.7ft) tender"
    const tm = tenderSection.match(/([A-Za-z]+\s+\d{3,4})\s+[Tt]ender/i) ||
               tenderSection.match(/(\d+[\d.]*\s*(?:m|ft)[^\n,]+tender[^\n,]*)/i);
    if (tm) vessel.tender = clean(tm[0]);
    else if (/tender\s+garage/i.test(tenderSection)) {
      const gm = tenderSection.match(/up\s+to\s+a?\s*([\d.]+\s*(?:m|ft)[^\n,]+)/i);
      if (gm) vessel.tender = `Tender garage — fits up to ${clean(gm[1])}`;
    }
  }
  if (!vessel.toys) {
    const toys: string[] = [];
    if (/jet\s*ski/i.test(tenderSection)) toys.push("Jet ski(s)");
    if (/kayak/i.test(tenderSection)) toys.push("Kayak(s)");
    if (/paddleboard|SUP/i.test(tenderSection)) toys.push("Paddleboards");
    if (/wakeboard/i.test(tenderSection)) toys.push("Wakeboard");
    if (/seabob|underwater\s*scooter/i.test(tenderSection)) toys.push("Seabob");
    if (/dive\s*equipment|scuba/i.test(tenderSection)) toys.push("Dive equipment");
    if (toys.length) vessel.toys = toys.join(", ");
  }

  // ── 14. TANK CAPACITIES section (explicit values override spec block) ─────
  const tankSection = bodyText.match(/TANK\s+CAPACITIES?\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n)/i)?.[1] || "";
  if (tankSection) {
    const fuelM = tankSection.match(/Fuel[:\s]+([\d,]+)\s*(?:litr?e?s?|lt)[^\/\n]*\/\s*([\d,]+)\s*(?:US\s*)?gal/i);
    if (fuelM) vessel.fuelTank = `${fuelM[1]} lt / ${fuelM[2]} gal`;
    const fwM = tankSection.match(/Fresh\s*water[:\s]+([\d,]+)\s*(?:litr?e?s?|lt)[^\/\n]*\/\s*([\d,]+)\s*(?:US\s*)?gal/i);
    if (fwM) vessel.freshWater = `${fwM[1]} lt / ${fwM[2]} gal`;
    const wwM = tankSection.match(/Waste\s*water[:\s]+([\d,]+)\s*(?:litr?e?s?|lt)[^\/\n]*\/\s*([\d,]+)\s*(?:US\s*)?gal/i);
    if (wwM) vessel.holdingTank = `${wwM[1]} lt / ${wwM[2]} gal`;
    const gwM = tankSection.match(/Grey\s*water[:\s]+([\d,]+)\s*(?:litr?e?s?|lt)[^\/\n]*\/\s*([\d,]+)\s*(?:US\s*)?gal/i);
    if (gwM) vessel.greyWater = `${gwM[1]} lt / ${gwM[2]} gal`;
  }

  // ── 15. ACCOMMODATION section ─────────────────────────────────────────────
  const accomSection = bodyText.match(/ACCOMMODATION\s*\n([\s\S]+?)(?:\n[A-Z][A-Z\s&\/]{4,}\n)/i)?.[1] || "";
  if (accomSection) {
    if (!vessel.staterooms) {
      // Count explicit stateroom mentions: Owner + VIP x2 + Guest x2 = 5
      const ownerM = accomSection.match(/Owner\s+Stateroom/i) ? 1 : 0;
      const vipCount = (accomSection.match(/VIP\s+Stateroom/gi) || []).length;
      // "2x VIP" or "Two VIP"
      const vipMulti = accomSection.match(/(\d+)\s*[Xx×]\s*VIP/i);
      const vipN = vipMulti ? parseInt(vipMulti[1]) : vipCount;
      const guestCount = (accomSection.match(/Guest\s+Cabin/gi) || []).length;
      const guestMulti = accomSection.match(/(\d+)\s*[Xx×]\s*Guest/i);
      const guestN = guestMulti ? parseInt(guestMulti[1]) : guestCount;
      const total = ownerM + vipN + guestN;
      if (total > 0) vessel.staterooms = String(total);
    }
    if (!vessel.crew) {
      const crewM = accomSection.match(/(\d+)\s+crew(?:\s+including\s+Captain)?/i);
      if (crewM) vessel.crew = crewM[1];
    }
    if (!vessel.crewCabins) {
      const ccM = accomSection.match(/(\d+)\s*[Xx×]?\s*Crew\s+Cabin/i);
      if (ccM) vessel.crewCabins = ccM[1];
    }
    if (!vessel.ownersCabin) {
      const ocM = accomSection.match(/Owner\s+Stateroom[:\s]+([^\n]+)/i);
      if (ocM) vessel.ownersCabin = clean(ocM[1]);
    }
  }

  // ── 16. Exterior / interior design ───────────────────────────────────────
  if (!vessel.exteriorDesign) {
    const edM = flat.match(/[Ee]xterior\s+design\s+by\s+([^,.]+)/i) ||
                flat.match(/René\s+van\s+der\s+Velden|Rene\s+van\s+der\s+Velden/i);
    if (edM) vessel.exteriorDesign = clean(edM[1] || edM[0]);
  }
  if (!vessel.interiorDesign) {
    const idM = flat.match(/[Ii]nterior\s+design\s+(?:by\s+)?([^,.]+(?:Studio|Design|Interior)[^,.]+)/i);
    if (idM) vessel.interiorDesign = clean(idM[1]);
  }
  if (!vessel.classification) {
    const clM = flat.match(/(?:built\s+to\s+|class[:\s]+)(Lloyd['']s\s+Register[^\n,;.]+)/i);
    if (clM) vessel.classification = clean(clM[1]);
  }
  if (!vessel.navClass) {
    const ncM = flat.match(/class\s+notation[:\s]+([^\n,.]+)/i);
    if (ncM) vessel.navClass = clean(ncM[1]);
  }
  if (!vessel.hullForm) {
    const hfM = flat.match(/Hull[:\s]+([^\n,]+(?:displacement|planing|semi)[^\n,]*)/i);
    if (hfM) vessel.hullForm = clean(hfM[1]);
  }

  // ── 17. dt/dd and table fallbacks ────────────────────────────────────────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── 18. Gallery — Denison CDN + boatsgroup fallback ─────────────────────
  // Denison migrated from boatsgroup to cdn.denisonyachtsales.com
  // Images appear as data-src="_x500.webp" — we upgrade to "_original.webp"
  // Also keep boatsgroup detection as fallback for older listings.
  const imgSet = new Map<string, string>(); // normalised key → best URL

  const addDenisonImg = (raw: string) => {
    if (!raw) return;
    const decoded = raw.replace(/&amp;/g, "&");
    if (isJunk(decoded)) return;
    if (!/cdn\.denisonyachtsales\.com\/images\/yachts-for-sale\//i.test(decoded)) return;
    // Upgrade thumbnail to original: _x500.webp → _original.webp
    const original = decoded.replace(/_x\d+(\.\w+)$/, "_original$1")
                             .replace(/_\d+x\d+(\.\w+)$/, "_original$1")
                             .split("?")[0];
    const key = original;
    if (!imgSet.has(key)) imgSet.set(key, original);
  };

  const addBoatsgroupImg = (raw: string) => {
    if (!raw || !/boatsgroup\.com/i.test(raw)) return;
    const decoded = raw.replace(/&amp;/g, "&");
    if (isJunk(decoded)) return;
    const fullRes = decoded
      .replace(/\/resize\/(\d+\/\d+\/\d+\/)/, "/images/$1")
      .split("?")[0];
    if (!imgSet.has(fullRes)) imgSet.set(fullRes, fullRes);
  };

  // Sweep all img tags and data-src attributes
  $("img").each((_, img) => {
    const dataSrc = $(img).attr("data-src") || "";
    const src = $(img).attr("src") || "";
    addDenisonImg(dataSrc); addDenisonImg(src);
    addBoatsgroupImg(dataSrc); addBoatsgroupImg(src);
  });

  // Regex sweep of raw HTML for both CDNs
  const denisonRe = /https:\/\/cdn\.denisonyachtsales\.com\/images\/yachts-for-sale\/[^\s"'&<>]+\.(?:webp|jpg|jpeg|png)/gi;
  const bgFullRe  = /https:\/\/images\.boatsgroup\.com\/images\/[^\s"'&<>]+\.(?:jpg|jpeg|png|webp)/gi;
  const bgRszRe   = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s"'&<>]+\.(?:jpg|jpeg|png|webp)[^\s"'&<>]*/gi;
  let mx: RegExpExecArray | null;
  while ((mx = denisonRe.exec(html)) !== null) addDenisonImg(mx[0]);
  while ((mx = bgFullRe.exec(html)) !== null)  addBoatsgroupImg(mx[0]);
  while ((mx = bgRszRe.exec(html)) !== null)   addBoatsgroupImg(mx[0]);

  // Merge into vessel.images, dedup by key
  const existingKeys = new Set(vessel.images.map(i => i.src.split("?")[0]));
  for (const [key, src] of imgSet) {
    if (!existingKeys.has(key)) vessel.images.push({ src, alt: vessel.name });
  }

  vessel.images = dedupeImages(vessel.images).filter(i => !isJunk(i.src));

  // Cap images at 80 — keeps payload reasonable while showing full gallery
  if (vessel.images.length > 80) vessel.images = vessel.images.slice(0, 80);

  // Sanitize: if any string field contains more than 2000 chars or looks like CSS/JS, wipe it
  const CSS_HINT = /\{\s*display\s*:|@media\s|\.navbar|font-family\s*:|\.menu_|<script|function\s+\w+\s*\(/;
  for (const k of Object.keys(vessel) as (keyof typeof vessel)[]) {
    const v = (vessel as Record<string, unknown>)[k as string];
    if (typeof v === "string" && (v.length > 3000 || CSS_HINT.test(v))) {
      (vessel as Record<string, unknown>)[k as string] = "";
    }
  }
  // Also cap description at 3000 chars
  if (vessel.description && vessel.description.length > 3000) {
    vessel.description = vessel.description.slice(0, 3000);
  }

  return vessel;
}
