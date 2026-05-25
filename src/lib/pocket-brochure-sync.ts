// src/lib/pocket-brochure-sync.ts
// When a brochure is marked as a pocket listing, this upserts a matching
// row in pocket_listings so the public website API serves it automatically.

import Database from "better-sqlite3";
import type { VesselData } from "@/lib/vessel-scraper/types";

/**
 * Structural subset of VesselData — only the fields this sync actually reads.
 * Declared standalone (not Pick<VesselData>) so callers can pass either
 * VesselData variant: brochure-storage's and vessel-scraper's are nominally
 * distinct and differ in minor field types (e.g. the images element type),
 * but both satisfy this loose shape. Avoids a forced type unification.
 */
type SyncableVessel = {
  name: string;
  builder: string;
  year: number | null;
  location: string;
  price?: string;
  loa: string;
  description: string;
  images: { src: string; alt: string }[];
};

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export function syncPocketListingFromBrochure(opts: {
  vessel: SyncableVessel;
  slug: string;
  brochureUrl: string;
  pdfUrl: string;
}) {
  const { vessel, slug, brochureUrl, pdfUrl } = opts;
  const db = new Database(DB_PATH);
  try {
    // Ensure all needed columns exist
    const cols = (db.prepare("PRAGMA table_info(pocket_listings)").all() as {name:string}[]).map(r=>r.name);
    if (!cols.includes("brochure_slug")) db.exec("ALTER TABLE pocket_listings ADD COLUMN brochure_slug TEXT DEFAULT ''");
    if (!cols.includes("name"))          db.exec("ALTER TABLE pocket_listings ADD COLUMN name TEXT DEFAULT ''");
    if (!cols.includes("hero_image"))    db.exec("ALTER TABLE pocket_listings ADD COLUMN hero_image TEXT DEFAULT ''");
    if (!cols.includes("images"))        db.exec("ALTER TABLE pocket_listings ADD COLUMN images TEXT DEFAULT '[]'");
    if (!cols.includes("highlights"))    db.exec("ALTER TABLE pocket_listings ADD COLUMN highlights TEXT DEFAULT ''");
    if (!cols.includes("pdf_url"))       db.exec("ALTER TABLE pocket_listings ADD COLUMN pdf_url TEXT DEFAULT ''");
    if (!cols.includes("listing_type"))  db.exec("ALTER TABLE pocket_listings ADD COLUMN listing_type TEXT DEFAULT 'pocket'");
    if (!cols.includes("show_price"))    db.exec("ALTER TABLE pocket_listings ADD COLUMN show_price INTEGER DEFAULT 1");
    if (!cols.includes("listing_url"))   db.exec("ALTER TABLE pocket_listings ADD COLUMN listing_url TEXT DEFAULT ''");

    const now = new Date().toISOString();
    const heroImage = vessel.images?.[0]?.src || "";
    const allImages = JSON.stringify((vessel.images || []).map(i => i.src));
    const name = vessel.name || `${vessel.year || ""} ${vessel.builder || ""}`.trim();
    const loa = vessel.loa || "";

    // Upsert by brochure_slug — one pocket listing per brochure
    const existing = db.prepare("SELECT id FROM pocket_listings WHERE brochure_slug = ?").get(slug) as {id:number}|undefined;

    if (existing) {
      db.prepare(`
        UPDATE pocket_listings SET
          name=?, make=?, model=?, year=?, length=?, price=?, location=?,
          description=?, hero_image=?, images=?, pdf_url=?, listing_url=?,
          listing_type='pocket', status='active', updated_at=?
        WHERE brochure_slug=?
      `).run(
        name, vessel.builder || "", vessel.name || "", String(vessel.year || ""),
        loa, vessel.price || "", vessel.location || "",
        vessel.description || "", heroImage, allImages,
        pdfUrl, brochureUrl, now, slug
      );
    } else {
      db.prepare(`
        INSERT INTO pocket_listings
          (brochure_slug, name, make, model, year, length, price, location,
           description, hero_image, images, pdf_url, listing_url,
           listing_type, show_price, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        slug, name, vessel.builder || "", vessel.name || "",
        String(vessel.year || ""), loa, vessel.price || "", vessel.location || "",
        vessel.description || "", heroImage, allImages,
        pdfUrl, brochureUrl,
        "pocket", 1, "active", now, now
      );
    }
  } finally {
    db.close();
  }
}

export function removePocketListingBySlug(slug: string) {
  const db = new Database(DB_PATH);
  try {
    const cols = (db.prepare("PRAGMA table_info(pocket_listings)").all() as {name:string}[]).map(r=>r.name);
    if (cols.includes("brochure_slug")) {
      db.prepare("DELETE FROM pocket_listings WHERE brochure_slug = ?").run(slug);
    }
  } finally {
    db.close();
  }
}
