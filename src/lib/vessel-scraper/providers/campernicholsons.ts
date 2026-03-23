/**
 * Camper & Nicholsons scraper
 * Site: camperandnicholsons.com/buy-a-yacht/yachts-for-sale/[slug]
 *
 * Structure: Server-rendered. Specs as alternating label/value lines.
 * No JSON-LD. Images at camperandnicholsons.com/IMAGE/[id]/...
 * Price listed as "POA" or numeric.
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, assignSpec, mineFromText, dedupeImages } from "../utils";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function scrapeCamperNicholsons(url: string): Promise<VesselData> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`C&N fetch failed: ${res.status}`);
  return parseCN(url, await res.text());
}

function parseCN(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── Name ──────────────────────────────────────────────────────────────────
  vessel.name = cleanHeadline($('meta[property="og:title"]').attr("content") || $("h1").first().text())
    .replace(/\s*[|–-]\s*(?:Luxury\s+)?(?:Motor|Sailing|Super)?\s*Yacht\s+for\s+Sale.*/i, "")
    .replace(/\s*[|–-]\s*C&N.*/i, "").trim();

  // ── Spec block — alternating label/value ─────────────────────────────────
  const rawText = $("body").text().replace(/\t/g, " ").replace(/ {3,}/g, "  ")
    .replace(/&[a-z#0-9]+;/g, " ");
  const TRIGGER = /^(?:Length|LOA|Beam|Draft)$/i;
  const SPEC = /^(?:Length|LOA|Beam|Draft|Cabins?|Guests?|Crew|Year|Builder|(?:Cruising\s+)?Speed|Range|Engines?|Generator|Flag|Class(?:ification)?|Refit|GT|Gross\s+Tonnage|Displacement|Fuel|Max(?:imum)?\s+Speed|Naval\s+Architect|Exterior|Interior|Hull)$/i;
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  let inSpec = false; let pairs = 0;
  const seen = new Set<string>();
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i]; const value = lines[i + 1];
    if (TRIGGER.test(label)) inSpec = true;
    if (inSpec && SPEC.test(label) && value.length > 1 && value.length < 200) {
      const lk = label.toLowerCase();
      if (seen.has(lk)) break;
      seen.add(lk);
      assignSpec(vessel, label, value);
      i++; pairs++;
      if (pairs > 25) break;
    }
  }

  // ── DOM fallbacks ─────────────────────────────────────────────────────────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── Year + builder from meta/title ───────────────────────────────────────
  if (!vessel.year) {
    // C&N slugs: /seanna-benetti-2011 → year=2011, builder=Benetti
    const m = url.match(/-(\d{4})(?:[-/]|$)/);
    if (m) vessel.year = parseInt(m[1]);
  }
  if (!vessel.builder) {
    // slug: /seanna-benetti-2011 → builder="Benetti"
    const m = url.match(/\/[^/]+-([a-z][a-z-]+)-\d{4}(?:[-/]|$)/i);
    if (m) vessel.builder = m[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Price ─────────────────────────────────────────────────────────────────
  if (!vessel.price) {
    const pm = rawText.match(/[Pp]rice[:\s]*(\$[\d,]+|\€[\d,]+)/);
    if (pm) vessel.price = pm[1];
    else if (/POA|Price\s+on\s+Application/i.test(rawText)) vessel.price = "Price on Application";
    else {
      const allP = [...rawText.matchAll(/\$([\d]{1,3}(?:,\d{3})+)/g)];
      for (const m of allP) {
        if (parseInt(m[1].replace(/,/g,"")) >= 1000000) { vessel.price = `$${m[1]}`; break; }
      }
    }
  }

  // ── Description ───────────────────────────────────────────────────────────
  const JUNK = /privacy|cookie|camper.nicholson|disclaimer|terms/i;
  const parts: string[] = [];
  $("p").each((_, p) => {
    const t = clean($(p).text());
    if (t.length > 80 && !JUNK.test(t) && /yacht|vessel|engine|knot|deck|stateroom|hull|guest|built/i.test(t))
      if (!parts.includes(t)) parts.push(t);
  });
  vessel.description = parts.join("\n\n").slice(0, 6000)
    || clean($('meta[property="og:description"]').attr("content") || "");

  // ── Images ────────────────────────────────────────────────────────────────
  const seenImgs = new Set<string>();
  const addImg = (src: string) => {
    if (!src) return;
    const full = src.startsWith("http") ? src : `https://camperandnicholsons.com${src.startsWith("/") ? "" : "/"}${src}`;
    if (!/^https?:\/\//i.test(full) || /logo|icon|badge|placeholder/i.test(full)) return;
    const key = full.split("?")[0];
    if (seenImgs.has(key)) return;
    seenImgs.add(key);
    vessel.images.push({ src: full, alt: vessel.name });
  };
  $("img").each((_, img) => {
    const srcset = $(img).attr("srcset") || "";
    if (srcset) { const entries = srcset.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean); addImg(entries[entries.length-1] || ""); return; }
    addImg($(img).attr("data-src") || ""); addImg($(img).attr("src") || "");
  });
  // Regex sweep for C&N IMAGE CDN
  const re = /https?:\/\/camperandnicholsons\.com\/IMAGE\/[^\s"'<>]+\.(?:jpe?g|png|webp)[^\s"'<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) addImg(m[0]);
  vessel.images = dedupeImages(vessel.images);

  if (vessel.description) mineFromText(vessel, vessel.description);
  return vessel;
}
