import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  return db;
}

export type ListingLink = { label: string; url: string };
export type ListingPdf = { label: string; url: string };

export type MyListing = {
  id: number;
  name: string;
  make: string;
  model: string;
  year: string;
  length: string;
  price: string;
  location: string;
  status: string;
  description: string;
  highlights: string;
  listing_urls: ListingLink[];
  pdf_urls: ListingPdf[];
  hero_image: string;
  notes: string;
  broker: string;
  created_at: string;
  updated_at: string;
};

function parseRow(row: any): MyListing {
  return {
    ...row,
    listing_urls: safeJson(row.listing_urls, []),
    pdf_urls: safeJson(row.pdf_urls, []),
  };
}

function safeJson(s: string, fallback: any) {
  try { return JSON.parse(s || "[]"); } catch { return fallback; }
}

// ─── Ensure table exists ──────────────────────────────
export function ensureTable() {
  const db = getDb();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS my_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      make TEXT DEFAULT '', model TEXT DEFAULT '',
      year TEXT DEFAULT '', length TEXT DEFAULT '',
      price TEXT DEFAULT '', location TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      description TEXT DEFAULT '', highlights TEXT DEFAULT '',
      listing_urls TEXT DEFAULT '[]', pdf_urls TEXT DEFAULT '[]',
      hero_image TEXT DEFAULT '', notes TEXT DEFAULT '',
      broker TEXT DEFAULT 'Will',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
  } finally { db.close(); }
}

// ─── Read ─────────────────────────────────────────────
export function readListings(status?: string): MyListing[] {
  ensureTable();
  const db = getDb();
  try {
    const q = status
      ? db.prepare("SELECT * FROM my_listings WHERE status = ? ORDER BY updated_at DESC")
      : db.prepare("SELECT * FROM my_listings ORDER BY updated_at DESC");
    const rows = status ? q.all(status) : q.all();
    return (rows as any[]).map(parseRow);
  } finally { db.close(); }
}

export function readListing(id: number): MyListing | null {
  ensureTable();
  const db = getDb();
  try {
    const row = db.prepare("SELECT * FROM my_listings WHERE id = ?").get(id) as any;
    return row ? parseRow(row) : null;
  } finally { db.close(); }
}

// ─── Create ───────────────────────────────────────────
export function createListing(input: Partial<MyListing>): MyListing {
  ensureTable();
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO my_listings (name, make, model, year, length, price, location,
        status, description, highlights, listing_urls, pdf_urls, hero_image, notes, broker,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name || "", input.make || "", input.model || "",
      input.year || "", input.length || "", input.price || "",
      input.location || "", input.status || "active",
      input.description || "", input.highlights || "",
      JSON.stringify(input.listing_urls || []),
      JSON.stringify(input.pdf_urls || []),
      input.hero_image || "", input.notes || "",
      input.broker || "Will", now, now
    );
    return readListing(result.lastInsertRowid as number)!;
  } finally { db.close(); }
}

// ─── Update ───────────────────────────────────────────
export function updateListing(id: number, input: Partial<MyListing>): MyListing | null {
  ensureTable();
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["name","make","model","year","length","price","location",
      "status","description","highlights","hero_image","notes","broker"];
    for (const k of allowed) {
      if (k in input && (input as any)[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push((input as any)[k]);
      }
    }
    if (input.listing_urls !== undefined) {
      fields.push("listing_urls = ?");
      values.push(JSON.stringify(input.listing_urls));
    }
    if (input.pdf_urls !== undefined) {
      fields.push("pdf_urls = ?");
      values.push(JSON.stringify(input.pdf_urls));
    }
    if (fields.length === 0) return readListing(id);
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE my_listings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return readListing(id);
  } finally { db.close(); }
}

// ─── Delete ───────────────────────────────────────────
export function deleteListing(id: number): boolean {
  const db = getDb();
  try {
    return db.prepare("DELETE FROM my_listings WHERE id = ?").run(id).changes > 0;
  } finally { db.close(); }
}
