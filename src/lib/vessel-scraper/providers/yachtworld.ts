/**
 * YachtWorld scraper
 * Site: yachtworld.com
 * Rendering: React SPA with Cloudflare — requires Puppeteer stealth
 * YachtWorld has very rich JSON-LD and structured spec blocks
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";
import { stealthFetch } from "../../campaign/providers/stealthFetch";

export async function scrapeYachtWorld(url: string): Promise<VesselData> {
  const html = await stealthFetch(url);
  return parseYachtWorld(url, html);
}

function parseYachtWorld(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  // ── JSON-LD (YachtWorld has very good structured data) ───────────────────
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes: Record<string, unknown>[] = Array.isArray(json)
        ? json
        : json["@graph"] ? json["@graph"] : [json];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();
        if (!/product|boat|vehicle/i.test(type) && !node.offers) continue;

        // Name: YachtWorld puts "2018 Azimut 60" style in name
        if (node.name && !vessel.name) {
          const brand = (node.brand as Record<string, string>)?.name || "";
          const raw = String(node.name).trim();
          vessel.name = cleanHeadline(brand && !raw.toLowerCase().includes(brand.toLowerCase())
            ? `${brand} ${raw}` : raw);
        }

        if (node.description && !vessel.description) {
          vessel.description = clean(String(node.description));
        }

        if (node.image) {
          const imgs = Array.isArray(node.image) ? node.image : [node.image];
          for (const img of imgs) {
            const src = typeof img === "string" ? img : (img as Record<string, string>)?.url || "";
            if (src && /^https?:\/\//i.test(src)) vessel.images.push({ src, alt: "" });
          }
        }

        const offers = (node.offers as Record<string, unknown>) || {};
        if (offers.price && !vessel.price) {
          const p = offers.price;
          const c = String(offers.priceCurrency || "USD");
          vessel.price = typeof p === "number"
            ? `${c === "EUR" ? "€" : "$"}${(p as number).toLocaleString("en-US")}`
            : String(p);
        }

        const avail = (offers.availableAtOrFrom as Record<string, unknown>) || {};
        const addr = (avail.address as Record<string, string>) || {};
        if (!vessel.location) {
          vessel.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter(Boolean).join(", ");
        }

        const brand = (node.brand as Record<string, string>) || (node.manufacturer as Record<string, string>);
        if (brand?.name && !vessel.builder) vessel.builder = clean(brand.name);

        if (!vessel.year) {
          const yr = String(node.productionDate || node.vehicleModelDate || "");
          const y = parseInt(yr);
          if (y > 1900) vessel.year = y;
        }

        // additionalProperty — YachtWorld stores ALL specs here
        const props = Array.isArray(node.additionalProperty)
          ? (node.additionalProperty as { name?: string; value?: string }[])
          : [];
        for (const prop of props) {
          if (prop.name && prop.value) assignSpec(vessel, prop.name, String(prop.value));
        }
      }
    } catch { /* skip */ }
  });

  // ── OG fallbacks ─────────────────────────────────────────────────────────
  if (!vessel.name) vessel.name = cleanHeadline($('meta[property="og:title"]').attr("content")) || "";
  if (!vessel.description) vessel.description = clean($('meta[property="og:description"]').attr("content"));
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && vessel.images.length === 0) vessel.images.push({ src: ogImg, alt: vessel.name });

  // ── DOM fallback ──────────────────────────────────────────────────────────
  if (!vessel.name) vessel.name = cleanHeadline($("h1").first().text()) || "";

  // YachtWorld DOM spec patterns
  $("[data-testid]").each((_, el) => {
    const testId = $(el).attr("data-testid") || "";
    if (/spec|detail/i.test(testId)) {
      const label = clean($(el).find("[class*='label' i], [class*='name' i]").first().text());
      const value = clean($(el).find("[class*='value' i], [class*='data' i]").last().text());
      if (label && value) assignSpec(vessel, label, value);
    }
  });

  $("dt").each((_, el) => assignSpec(vessel, $(el).text(), $(el).next("dd").text()));
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });

  // ── Gallery: YachtWorld uses large swiper/carousel images ────────────────
  $(".swiper-slide img, [class*='gallery'] img, [class*='photo'] img, figure img").each((_, img) => {
    const src =
      $(img).attr("data-src") ||
      $(img).attr("data-lazy-src") ||
      $(img).attr("src") || "";
    if (src && /\.(jpe?g|png|webp)/i.test(src) && !isJunk(src)) {
      vessel.images.push({ src, alt: clean($(img).attr("alt")) });
    }
  });

  // YachtWorld also uses next/image with srcset
  $("img[srcset]").each((_, img) => {
    const best = bestFromSrcset($(img).attr("srcset") || "");
    if (best && !isJunk(best)) vessel.images.push({ src: best, alt: clean($(img).attr("alt")) });
  });

  vessel.images = dedupeImages(vessel.images);

  // ── Price / location DOM fallback ─────────────────────────────────────────
  if (!vessel.price) vessel.price = clean($('[class*="price" i]').first().text());
  if (!vessel.location) vessel.location = clean($('[class*="location" i]').first().text());

  // ── Features ─────────────────────────────────────────────────────────────
  const feats: string[] = [];
  $("[class*='feature' i] li, [class*='amenity' i] li, [class*='highlight' i] li").each((_, li) => {
    const t = clean($(li).text());
    if (t.length > 5 && t.length < 200) feats.push(t);
  });
  vessel.features = [...new Set(feats)].slice(0, 20);

  return vessel;
}

function bestFromSrcset(srcset: string): string {
  const parts = srcset.split(",").map(s => s.trim()).filter(Boolean);
  let best = ""; let bestW = 0;
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
