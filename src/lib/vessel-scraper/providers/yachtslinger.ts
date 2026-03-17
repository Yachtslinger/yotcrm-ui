/**
 * YachtSlinger scraper
 * Site: yachtslinger.com
 * Rendering: Likely WordPress/Webflow — tries plain fetch first, Puppeteer fallback
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";
import { stealthFetch } from "../../campaign/providers/stealthFetch";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function scrapeYachtSlinger(url: string): Promise<VesselData> {
  let html: string;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    html = await res.text();
  } catch {
    // Fall back to Puppeteer if blocked or JS-rendered
    html = await stealthFetch(url);
  }
  return parseYachtSlinger(url, html);
}

function parseYachtSlinger(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── Name ─────────────────────────────────────────────────────────────────
  vessel.name =
    cleanHeadline($("h1").first().text()) ||
    cleanHeadline($('meta[property="og:title"]').attr("content")) ||
    "";

  // ── Description ──────────────────────────────────────────────────────────
  if (!vessel.description) {
    vessel.description = clean($('meta[property="og:description"]').attr("content"));
  }
  if (!vessel.description) {
    const paras: string[] = [];
    $("article p, main p, .entry-content p").each((_, el) => {
      const t = clean($(el).text());
      if (t.length > 80 && !/copyright|©|rights reserved|cookie|privacy/i.test(t)) paras.push(t);
    });
    vessel.description = paras.slice(0, 3).join("\n\n");
  }

  // ── JSON-LD ───────────────────────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes: Record<string, unknown>[] = Array.isArray(json)
        ? json : json["@graph"] ? json["@graph"] : [json];
      for (const node of nodes) {
        if (!node) continue;
        if (node.name && !vessel.name) vessel.name = cleanHeadline(String(node.name)) || "";
        if (node.description && !vessel.description) vessel.description = clean(String(node.description));
        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string, string>)?.url || "";
            if (src && /^https?:\/\//i.test(src)) vessel.images.push({ src, alt: "" });
          }
        }
        const props = Array.isArray(node.additionalProperty)
          ? (node.additionalProperty as { name?: string; value?: string }[])
          : [];
        for (const p of props) {
          if (p.name && p.value) assignSpec(vessel, p.name, String(p.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── DOM specs ─────────────────────────────────────────────────────────────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });
  $("li, p").each((_, el) => {
    const text = clean($(el).text());
    const m = text.match(/^([A-Z][^:]{2,50}):\s*(.{1,200})$/);
    if (m) assignSpec(vessel, m[1], m[2]);
  });

  if (!vessel.price) vessel.price = clean($('[class*="price" i]').first().text());
  if (!vessel.location) vessel.location = clean($('[class*="location" i]').first().text());

  // ── Gallery ──────────────────────────────────────────────────────────────
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg) vessel.images.unshift({ src: ogImg, alt: vessel.name });

  $(".gallery img, .swiper-slide img, .yacht-photos img, figure img, main img").each((_, img) => {
    const src = $(img).attr("data-src") || $(img).attr("src") || "";
    if (src && /\.(jpe?g|png|webp)/i.test(src) && !isJunk(src)) {
      vessel.images.push({ src: toAbs(src, url), alt: clean($(img).attr("alt")) });
    }
  });

  vessel.images = dedupeImages(vessel.images);

  // ── Features ─────────────────────────────────────────────────────────────
  const feats: string[] = [];
  $("main ul li, article ul li").each((_, li) => {
    const t = clean($(li).text());
    if (t.length > 8 && t.length < 200 && !isNav(t)) feats.push(t);
  });
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}

function toAbs(src: string, base: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  try { return new URL(src, base).href; } catch { return src; }
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder/i.test(src);
}

function isNav(t: string): boolean {
  return /^(home|about|contact|menu|search|login|privacy|terms|cookie)$/i.test(t.trim());
}
