// src/lib/brochure-storage.ts
// SQLite persistence for generated brochures.
// Follows the same patterns as src/lib/listings/storage.ts

import Database from "better-sqlite3";
// VesselData is defined canonically in the scraper layer; storage re-exports
// it (below) so scraper, storage and brochure-editor layers share one shape.
import type { VesselData } from "@/lib/vessel-scraper/types";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  return db;
}

// VesselData is defined canonically in the scraper layer. Brochure storage
// re-exports it so the scraper, storage and brochure-editor layers all share
// one shape (the type formerly duplicated here drifted out of sync).
export type { VesselData };

export type BrokerInfo = {
  name: string;
  title?: string;
  email: string;
  mobile: string;
  office?: string;
  photo?: string;
  instagram?: string;
};

export type BrochureRow = {
  id: number;
  slug: string;
  vessel_name: string;
  builder: string;
  year: number | null;
  source_url: string;
  created_at: string;
  is_pocket_listing?: number; // 1 = pocket listing, 0 = standard
};

export type BrochureFull = BrochureRow & {
  vessel: VesselData;
  brokers: BrokerInfo[];
};

function ensureTable(db: ReturnType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brochures (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      vessel_name TEXT NOT NULL,
      builder     TEXT DEFAULT '',
      year        INTEGER,
      source_url  TEXT DEFAULT '',
      vessel_data TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_brochures_slug    ON brochures(slug);
    CREATE INDEX IF NOT EXISTS idx_brochures_created ON brochures(created_at DESC);
  `);
  // Safe migrations
  const cols = (db.prepare("PRAGMA table_info(brochures)").all() as {name:string}[]).map(r=>r.name);
  if (!cols.includes("is_pocket_listing")) {
    db.exec("ALTER TABLE brochures ADD COLUMN is_pocket_listing INTEGER DEFAULT 0");
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function shortId(): string {
  // 6-char hex from crypto — no extra deps
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}

export function listBrochures(): BrochureRow[] {
  const db = getDb();
  try {
    ensureTable(db);
    return db
      .prepare(
        `SELECT id, slug, vessel_name, builder, year, source_url, created_at, is_pocket_listing
         FROM brochures ORDER BY created_at DESC`
      )
      .all() as BrochureRow[];
  } finally {
    db.close();
  }
}

export function getBrochure(slug: string): BrochureFull | null {
  const db = getDb();
  try {
    ensureTable(db);
    const row = db
      .prepare("SELECT * FROM brochures WHERE slug = ?")
      .get(slug) as any;
    if (!row) return null;
    const parsed = JSON.parse(row.vessel_data || "{}");
    return {
      id: row.id,
      slug: row.slug,
      vessel_name: row.vessel_name,
      builder: row.builder,
      year: row.year,
      source_url: row.source_url,
      created_at: row.created_at,
      vessel: parsed.vessel || ({} as VesselData),
      brokers: parsed.brokers || DEFAULT_BROKERS,
    };
  } finally {
    db.close();
  }
}

export function saveBrochure(
  vessel: VesselData,
  brokers?: BrokerInfo[],
  isPocket = false
): { id: number; slug: string } {
  const db = getDb();
  try {
    ensureTable(db);
    const slug = `${slugify((vessel.name || "yacht") + "-" + (vessel.builder || ""))}-${shortId()}`;
    const info = db
      .prepare(
        `INSERT INTO brochures (slug, vessel_name, builder, year, source_url, vessel_data, is_pocket_listing)
         VALUES (@slug, @vesselName, @builder, @year, @sourceUrl, @vesselData, @isPocket)`
      )
      .run({
        slug,
        vesselName: vessel.name || "Yacht",
        builder: vessel.builder || "",
        year: vessel.year || null,
        sourceUrl: vessel.sourceUrl || "",
        vesselData: JSON.stringify({ vessel, brokers: brokers || DEFAULT_BROKERS }),
        isPocket: isPocket ? 1 : 0,
      });
    return { id: info.lastInsertRowid as number, slug };
  } finally {
    db.close();
  }
}

export function getBrochureById(id: number): { slug: string } | null {
  const db = getDb();
  try {
    ensureTable(db);
    const row = db.prepare("SELECT slug FROM brochures WHERE id = ?").get(id) as { slug: string } | undefined;
    return row || null;
  } finally {
    db.close();
  }
}

export function deleteBrochure(id: number): boolean {
  const db = getDb();
  try {
    db.prepare("DELETE FROM brochures WHERE id = ?").run(id);
    return true;
  } finally {
    db.close();
  }
}

export function updateBrochure(id: number, vessel: VesselData, brokers?: BrokerInfo[], isPocket?: boolean, pocketOnly = false): boolean {
  const db = getDb();
  try {
    ensureTable(db);
    const existing = db.prepare("SELECT vessel_data, is_pocket_listing FROM brochures WHERE id = ?").get(id) as any;
    if (!existing) return false;

    // Pocket-only toggle — just flip the flag, don't touch vessel data
    if (pocketOnly) {
      const pocketVal = isPocket !== undefined ? (isPocket ? 1 : 0) : existing.is_pocket_listing;
      db.prepare("UPDATE brochures SET is_pocket_listing=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pocketVal, id);

      // Sync pocket listing if needed
      return true;
    }

    const parsed = JSON.parse(existing.vessel_data || "{}");
    const updatedData = { ...parsed, vessel };
    if (brokers) updatedData.brokers = brokers;
    const pocketVal = isPocket !== undefined ? (isPocket ? 1 : 0) : existing.is_pocket_listing;
    db.prepare(
      "UPDATE brochures SET vessel_name=?, builder=?, year=?, source_url=?, vessel_data=?, is_pocket_listing=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(
      vessel.name || "Yacht",
      vessel.builder || "",
      vessel.year || null,
      vessel.sourceUrl || "",
      JSON.stringify(updatedData),
      pocketVal,
      id
    );
    return true;
  } finally {
    db.close();
  }
}

export const DEFAULT_BROKERS: BrokerInfo[] = [
  {
    name: "Will Noftsinger",
    title: "Yacht Broker · Build Consultant of The Americas",
    email: "WN@DenisonYachting.com",
    mobile: "850.461.3342",
    office: "Denison Yachting · Fort Lauderdale, FL",
    photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg",
    instagram: "@yachtslinger",
  },
  {
    name: "Paolo Ameglio",
    title: "Yacht Broker · Superyacht Division",
    email: "PGA@DenisonYachting.com",
    mobile: "786.251.2588",
    office: "Denison Yachting · Fort Lauderdale, FL",
    photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg",
  },
  {
    name: "Peter Quintal",
    title: "Yacht Broker · Superyacht Division",
    email: "Peter@DenisonYachting.com",
    mobile: "954.817.5662",
    office: "Denison Yachting · Fort Lauderdale, FL",
    photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/6855b2c3e4f81.jpg",
  },
];
