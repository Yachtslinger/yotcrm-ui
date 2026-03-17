// src/app/api/public/pocket-listings/route.ts
// Returns active pocket listings for the public website "Off Market" section.
// Merges: (1) manually added pocket_listings rows, (2) brochures marked is_pocket_listing=1

import { NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://yotcrm-production.up.railway.app";

export async function GET() {
  try {
    const db = new Database(DB_PATH);

    // Ensure pocket_listings columns exist
    const plCols = (db.prepare("PRAGMA table_info(pocket_listings)").all() as {name:string}[]).map(r=>r.name);
    if (!plCols.includes("name"))           db.exec("ALTER TABLE pocket_listings ADD COLUMN name TEXT DEFAULT ''");
    if (!plCols.includes("hero_image"))     db.exec("ALTER TABLE pocket_listings ADD COLUMN hero_image TEXT DEFAULT ''");
    if (!plCols.includes("images"))         db.exec("ALTER TABLE pocket_listings ADD COLUMN images TEXT DEFAULT '[]'");
    if (!plCols.includes("highlights"))     db.exec("ALTER TABLE pocket_listings ADD COLUMN highlights TEXT DEFAULT ''");
    if (!plCols.includes("pdf_url"))        db.exec("ALTER TABLE pocket_listings ADD COLUMN pdf_url TEXT DEFAULT ''");
    if (!plCols.includes("listing_type"))   db.exec("ALTER TABLE pocket_listings ADD COLUMN listing_type TEXT DEFAULT 'pocket'");
    if (!plCols.includes("show_price"))     db.exec("ALTER TABLE pocket_listings ADD COLUMN show_price INTEGER DEFAULT 1");
    if (!plCols.includes("listing_url"))    db.exec("ALTER TABLE pocket_listings ADD COLUMN listing_url TEXT DEFAULT ''");
    if (!plCols.includes("brochure_slug"))  db.exec("ALTER TABLE pocket_listings ADD COLUMN brochure_slug TEXT DEFAULT ''");

    // 1. Manual pocket listings
    const manualRows = db.prepare(`
      SELECT id, name, make, model, year, length, price, location,
             description, hero_image, images, highlights, pdf_url, listing_url,
             brochure_slug, listing_type, show_price, status, created_at
      FROM pocket_listings WHERE status = 'active' ORDER BY created_at DESC
    `).all() as any[];

    // 2. Brochures marked as pocket listings (not already in pocket_listings via brochure_slug)
    const existingSlugs = new Set(manualRows.map(r => r.brochure_slug).filter(Boolean));
    const brCols = (db.prepare("PRAGMA table_info(brochures)").all() as {name:string}[]).map(r=>r.name);
    const brochureRows: any[] = brCols.includes("is_pocket_listing")
      ? db.prepare(`SELECT id, slug, vessel_name, builder, year, vessel_data, created_at
                    FROM brochures WHERE is_pocket_listing=1 ORDER BY created_at DESC`).all() as any[]
      : [];

    db.close();

    function parseImages(raw: string) {
      try { return JSON.parse(raw || "[]"); } catch { return []; }
    }

    const manualListings = manualRows.map(r => ({
      id:           `pl-${r.id}`,
      name:         r.name || `${r.year} ${r.make} ${r.model}`.trim(),
      make:         r.make, model: r.model, year: r.year, length: r.length,
      price:        r.show_price ? r.price : "Price Upon Request",
      location:     r.location, description: r.description,
      heroImage:    r.hero_image,
      images:       parseImages(r.images),
      highlights:   r.highlights,
      pdfUrl:       r.pdf_url,
      brochureUrl:  r.listing_url || (r.brochure_slug ? `${BASE}/brochures/${r.brochure_slug}` : ""),
      listingType:  r.listing_type,
      source:       "manual",
      createdAt:    r.created_at,
    }));

    const brochureListings = brochureRows
      .filter(r => !existingSlugs.has(r.slug))
      .map(r => {
        let vessel: any = {};
        try { const p = JSON.parse(r.vessel_data || "{}"); vessel = p.vessel || {}; } catch {}
        const heroImage = vessel.images?.[0]?.src || "";
        const images = (vessel.images || []).map((i: any) => i.src).filter(Boolean);
        return {
          id:           `br-${r.id}`,
          name:         vessel.name || r.vessel_name,
          make:         vessel.builder || r.builder,
          model:        vessel.name || r.vessel_name,
          year:         String(vessel.year || r.year || ""),
          length:       vessel.loa || "",
          price:        vessel.price || "Price Upon Request",
          location:     vessel.location || "",
          description:  vessel.description || "",
          heroImage,
          images,
          highlights:   "",
          pdfUrl:       `${BASE}/api/brochures/pdf?slug=${r.slug}`,
          brochureUrl:  `${BASE}/brochures/${r.slug}`,
          listingType:  "pocket",
          source:       "brochure",
          createdAt:    r.created_at,
        };
      });

    return NextResponse.json({ ok: true, listings: [...manualListings, ...brochureListings] });
  } catch (err) {
    console.error("[public/pocket-listings]", err);
    return NextResponse.json({ ok: true, listings: [] });
  }
}
