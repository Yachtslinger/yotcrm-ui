/**
 * Denison Yachting / Denison Yacht Sales scraper
 * Sites: denisonyachtsales.com, denisonyachting.com
 * Rendering: Server-side rendered — plain fetch + cheerio works
 * Advantage: Rich JSON-LD, structured spec tables, high-res gallery
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
      cache: "no-store",
      redirect: "follow",
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

function parseDenison(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── JSON-LD (richest source) ─────────────────────────────────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes: Record<string, unknown>[] = Array.isArray(json)
        ? json
        : json["@graph"]
        ? json["@graph"]
        : [json];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();
        if (!/product|boat|vehicle|offer/i.test(type) && !node.offers) continue;

        if (node.name && !vessel.name)
          vessel.name = cleanHeadline(String(node.name));

        if (node.description && !vessel.description)
          vessel.description = clean(String(node.description));

        // Images
        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string, string>)?.url || "";
            if (src && /^https?:\/\//i.test(src)) {
              vessel.images.push({ src, alt: vessel.name || "" });
            }
          }
        }

        // Price
        const offers = (node.offers as Record<string, unknown>) || {};
        if (offers.price && !vessel.price) {
          const p = offers.price;
          const c = String(offers.priceCurrency || "USD");
          vessel.price =
            typeof p === "number"
              ? `${c === "EUR" ? "€" : "$"}${(p as number).toLocaleString("en-US")}`
              : String(p);
        }

        // Location
        const avail = (offers.availableAtOrFrom as Record<string, unknown>) || {};
        const addr = (avail.address as Record<string, string>) || (node.address as Record<string, string>) || {};
        if (!vessel.location) {
          vessel.location = [addr.addressLocality, addr.addressRegion]
            .filter(Boolean)
            .join(", ");
        }

        // Builder
        const brand = (node.brand as Record<string, string>) || (node.manufacturer as Record<string, string>);
        if (brand?.name && !vessel.builder) vessel.builder = clean(brand.name);

        // Year
        if (!vessel.year) {
          const yr = String(node.productionDate || node.vehicleModelDate || node.modelDate || "");
          const y = parseInt(yr);
          if (y > 1900) vessel.year = y;
        }

        // Additional properties
        const props = Array.isArray(node.additionalProperty)
          ? (node.additionalProperty as { name?: string; value?: string }[])
          : [];
        for (const prop of props) {
          if (prop.name && prop.value) assignSpec(vessel, prop.name, String(prop.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── Open Graph fallbacks ─────────────────────────────────────────────────
  if (!vessel.name) {
    vessel.name = cleanHeadline($('meta[property="og:title"]').attr("content")) || "";
  }
  if (!vessel.description) {
    vessel.description = clean($('meta[property="og:description"]').attr("content"));
  }
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && vessel.images.length === 0) {
    vessel.images.push({ src: ogImg, alt: vessel.name });
  }

  // ── DOM: h1 fallback ──────────────────────────────────────────────────────
  if (!vessel.name) vessel.name = cleanHeadline($("h1").first().text()) || "";

  // ── DOM: spec table (Denison uses .listing-specs, .boat-specs, dt/dd) ────
  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });
  $("li").each((_, el) => {
    const text = clean($(el).text());
    const m = text.match(/^([^:]{2,50}):\s*(.{1,200})$/);
    if (m) assignSpec(vessel, m[1], m[2]);
  });

  // Price & location from DOM if not found in JSON-LD
  if (!vessel.price) {
    vessel.price = clean(
      $('[class*="price" i]').first().text() ||
      $('[data-testid*="price"]').first().text()
    );
  }
  if (!vessel.location) {
    vessel.location = clean($('[class*="location" i]').first().text());
  }

  // ── Gallery: Denison uses data-src or srcset on slide/gallery images ─────
  // High-res gallery images
  $(
    ".swiper-slide img, .gallery-item img, .listing-gallery img, .yacht-photos img, .carousel img, figure img"
  ).each((_, img) => {
    const src =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("src") ||
      "";
    const fullSrc = getBestSrc($(img), src);
    if (fullSrc && /\.(jpe?g|png|webp)/i.test(fullSrc) && !isJunk(fullSrc)) {
      vessel.images.push({ src: fullSrc, alt: clean($(img).attr("alt")) });
    }
  });

  // Srcset: pick largest
  $("img[srcset]").each((_, img) => {
    const best = bestFromSrcset($(img).attr("srcset") || "");
    if (best && !isJunk(best)) vessel.images.push({ src: best, alt: clean($(img).attr("alt")) });
  });

  // Anchor href images (lightbox pattern)
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/\.(jpe?g|png|webp)/i.test(href) && !isJunk(href)) {
      vessel.images.push({ src: href, alt: "" });
    }
  });

  vessel.images = dedupeImages(vessel.images);

  // ── Features ─────────────────────────────────────────────────────────────
  const feats: string[] = [];
  const $featSection = $("h2,h3,h4")
    .filter((_, el) => /feature|highlight|equipment|key feature/i.test($(el).text()))
    .first();
  if ($featSection.length) {
    $featSection.nextUntil("h2,h3,h4").find("li").each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 8 && t.length < 200) feats.push(t);
    });
  }
  if (!feats.length) {
    $("main ul li, article ul li, .listing-detail ul li").each((_, li) => {
      const t = clean($(li).text());
      if (t.length > 8 && t.length < 200 && !isNavItem(t)) feats.push(t);
    });
  }
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}

function getBestSrc($img: cheerio.Cheerio<cheerio.AnyNode>, fallback: string): string {
  const srcset = $img.attr("srcset") || "";
  if (srcset) return bestFromSrcset(srcset) || fallback;
  return fallback;
}

function bestFromSrcset(srcset: string): string {
  const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
  let best = "";
  let bestW = 0;
  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/);
    const w = descriptor ? parseFloat(descriptor) : 1;
    if (w > bestW && url) { best = url; bestW = w; }
  }
  return best;
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder/i.test(src);
}

function isNavItem(t: string): boolean {
  return /^(home|about|contact|menu|search|login|sign in|privacy|terms|cookie|newsletter|back to|view all|read more|english|español|français)$/i.test(t.trim());
}
