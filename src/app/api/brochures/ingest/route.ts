/**
 * POST /api/brochures/ingest
 *
 * Receives raw page data from the YotCRM bookmarklet.
 * The bookmarklet runs in the user's browser — CF is already bypassed,
 * window.__REDUX_STATE__ and document data are fully available.
 *
 * Payload:
 *   { pageUrl, reduxState?, metaTags?, jsonLd?, title? }
 *
 * Returns:
 *   { ok, editUrl }  — the brochure editor URL to redirect to
 */
import { NextRequest, NextResponse } from "next/server";
import { emptyVessel } from "@/lib/vessel-scraper/types";
import { clean, dedupeImages } from "@/lib/vessel-scraper/utils";
import type { VesselData } from "@/lib/brochure-storage";

export const runtime = "nodejs";

// ── Image helpers (mirrors yachtworld.ts) ─────────────────────────────────────
function upscale(src: string): string {
  if (src.startsWith("//")) src = "https:" + src;
  let out = src
    .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/g, "")
    .replace(/[?&]exact/g, "")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/, "");
  if (out.includes("boatsgroup.com/resize/") && !/[?&]w=/.test(out))
    out += (out.includes("?") ? "&" : "?") + "w=1200";
  return out;
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|flag|avatar|favicon|servedby/i.test(src) ||
    /youtube\.com|youtu\.be|vimeo\.com/i.test(src);
}

// ── Map YachtWorld __REDUX_STATE__ → VesselData ───────────────────────────────
function mapRedux(d: Record<string, any>, vessel: VesselData) {
  if (d.boatName)  vessel.name    = clean(d.boatName);
  if (d.make)      vessel.builder = clean(d.make);
  if (d.year)      vessel.year    = parseInt(String(d.year));
  const usd = d.price?.type?.amount?.USD;
  if (usd)         vessel.price   = `$${Number(usd).toLocaleString("en-US")}`;
  const loc = d.location?.address;
  if (loc)         vessel.location = [loc.city, loc.subdivision, loc.country].filter(Boolean).join(", ");
  if (d.descriptionNoHTML) vessel.description = clean(String(d.descriptionNoHTML)).slice(0, 2000);
  if (d.hull?.material)    vessel.hullMaterial = clean(d.hull.material);

  const dims = d.specifications?.dimensions;
  if (dims) {
    if (dims.lengths?.nominal?.ft) vessel.loa   = `${dims.lengths.nominal.ft} ft / ${dims.lengths.nominal.m} m`;
    if (dims.beam?.ft)             vessel.beam  = `${dims.beam.ft} ft / ${dims.beam.m} m`;
    if (dims.maxDraft?.ft)         vessel.draft = `${dims.maxDraft.ft} ft / ${dims.maxDraft.m} m`;
  }
  const spd = d.specifications?.speedDistance;
  if (spd) {
    if (spd.maxSpeed?.kn)      vessel.maxSpeed    = `${spd.maxSpeed.kn} kn`;
    if (spd.cruisingSpeed?.kn) vessel.cruiseSpeed = `${spd.cruisingSpeed.kn} kn`;
    if (spd.range?.nmi)        vessel.range       = `${spd.range.nmi} nmi`;
  }
  const acc = d.specifications?.accommodation;
  if (acc) {
    if (acc.cabins != null)     vessel.staterooms = String(acc.cabins);
    if (acc.passengers != null) vessel.guests     = String(acc.passengers);
    if (acc.crew != null)       vessel.crew       = String(acc.crew);
  }
  const engines: any[] = d.propulsion?.engines || [];
  if (engines.length) {
    const e = engines[0];
    const parts = [e.make, e.model].filter(Boolean);
    if (parts.length) vessel.engines = (engines.length > 1 ? `${engines.length}x ` : "") + parts.join(" ");
    if (e.power?.hp)  vessel.power   = `${e.power.hp} hp`;
  }
  const tanks = d.tanks || {};
  const fuel = tanks.fuel?.[0]?.capacity;
  if (fuel) vessel.fuelTank   = `${Math.round(fuel.gal).toLocaleString("en-US")} gal / ${Math.round(fuel.l).toLocaleString("en-US")} lt`;
  const fresh = tanks.fresh?.[0]?.capacity || tanks.freshWater?.[0]?.capacity;
  if (fresh) vessel.freshWater = `${Math.round(fresh.gal).toLocaleString("en-US")} gal / ${Math.round(fresh.l).toLocaleString("en-US")} lt`;

  // Images — media[] is the canonical source
  const media: any[] = d.media || [];
  for (const m of media) {
    if (m.mediaType === "video" || m.videoUrl) continue;
    let src: string = m.originalImageUrl || m.url || m.thumbnailUrl || "";
    if (!src || isJunk(src)) continue;
    if (src.startsWith("//")) src = "https:" + src;
    if (!src.startsWith("http")) continue;
    vessel.images.push({ src: upscale(src), alt: m.title || vessel.name });
  }
}

// ── Map generic JSON-LD → VesselData ─────────────────────────────────────────
function mapJsonLd(nodes: any[], vessel: VesselData) {
  for (const node of nodes) {
    if (!node || !String(node["@type"] || "").match(/Product|Vehicle|Boat/i)) continue;
    if (!vessel.name && node.name)        vessel.name    = String(node.name).trim();
    if (!vessel.description && node.description) vessel.description = String(node.description).slice(0, 2000);
    if (!vessel.builder && node.brand?.name)     vessel.builder = String(node.brand.name).trim();
    if (!vessel.builder && node.manufacturer?.name) vessel.builder = String(node.manufacturer.name).trim();
    if (!vessel.year && (node.productionDate || node.vehicleModelDate)) {
      const yr = parseInt(node.productionDate || node.vehicleModelDate);
      if (yr > 1900) vessel.year = yr;
    }
    const offers = node.offers;
    if (offers?.price && !vessel.price) {
      const p = Number(offers.price);
      const c = String(offers.priceCurrency || "USD");
      vessel.price = c === "EUR" ? `€${p.toLocaleString("en-US")}` : `$${p.toLocaleString("en-US")}`;
    }
    const addr = offers?.availableAtOrFrom?.address;
    if (addr && !vessel.location)
      vessel.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ");
    const imgs = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
    for (const img of imgs) {
      const src = typeof img === "string" ? img : img?.url || "";
      if (src && src.startsWith("http") && !isJunk(src))
        vessel.images.push({ src: upscale(src), alt: "" });
    }
    const props: any[] = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
    for (const p of props) {
      if (!p.name || !p.value) continue;
      const label = String(p.name).toLowerCase();
      const val   = String(p.value).trim();
      if (/loa|length overall/i.test(label) && !vessel.loa)         vessel.loa   = val;
      else if (/\bbeam\b/i.test(label) && !vessel.beam)             vessel.beam  = val;
      else if (/draft|draught/i.test(label) && !vessel.draft)       vessel.draft = val;
      else if (/max.*speed|top speed/i.test(label) && !vessel.maxSpeed) vessel.maxSpeed = val;
      else if (/cruise.*speed/i.test(label) && !vessel.cruiseSpeed) vessel.cruiseSpeed = val;
      else if (/\brange\b/i.test(label) && !vessel.range)           vessel.range = val;
      else if (/stateroom|cabin/i.test(label) && !vessel.staterooms) vessel.staterooms = val;
      else if (/engine/i.test(label) && !vessel.engines)            vessel.engines = val;
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      pageUrl:     string;
      reduxState?: Record<string, any>;
      metaTags?:   Record<string, string>;
      jsonLd?:     any[];
      images?:     string[];
      title?:      string;
    };

    const { pageUrl, reduxState, metaTags, jsonLd, images: rawImages, title } = body;
    if (!pageUrl) return NextResponse.json({ error: "pageUrl required" }, { status: 400 });

    const vessel = emptyVessel(pageUrl) as VesselData;

    // 1. YachtWorld Redux (richest — has media[], all specs)
    const d = reduxState?.app?.data;
    if (d?.id) {
      mapRedux(d, vessel);
    }

    // 2. JSON-LD fallback (Boat International, Superyacht Times, generic)
    if (jsonLd?.length && (!vessel.name || vessel.images.length === 0)) {
      mapJsonLd(jsonLd, vessel);
    }

    // 3. Meta tags fallback
    if (metaTags) {
      if (!vessel.name)        vessel.name        = metaTags["og:title"]       || metaTags["title"] || title || "";
      if (!vessel.description) vessel.description = metaTags["og:description"] || "";
      if (!vessel.price && metaTags["product:price:amount"]) {
        const c = metaTags["product:price:currency"] || "USD";
        vessel.price = c === "EUR"
          ? `€${Number(metaTags["product:price:amount"]).toLocaleString("en-US")}`
          : `$${Number(metaTags["product:price:amount"]).toLocaleString("en-US")}`;
      }
      const ogImg = metaTags["og:image"];
      if (ogImg && !isJunk(ogImg) && !vessel.images.some(i => i.src === ogImg))
        vessel.images.push({ src: upscale(ogImg), alt: vessel.name });
    }

    // 4. Raw image URLs sent by bookmarklet (last resort)
    if (rawImages?.length && vessel.images.length === 0) {
      for (const src of rawImages) {
        if (src && src.startsWith("http") && !isJunk(src))
          vessel.images.push({ src: upscale(src), alt: vessel.name });
      }
    }

    vessel.images = dedupeImages(vessel.images);

    return NextResponse.json({ ok: true, vessel }, { headers: CORS });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brochures/ingest]", msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
