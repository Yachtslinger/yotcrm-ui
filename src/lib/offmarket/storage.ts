import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Auto-create tables if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS pocket_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT DEFAULT '', model TEXT DEFAULT '', year TEXT DEFAULT '',
      length TEXT DEFAULT '', price TEXT DEFAULT '', location TEXT DEFAULT '',
      description TEXT DEFAULT '', seller_name TEXT DEFAULT '', seller_contact TEXT DEFAULT '',
      status TEXT DEFAULT 'active', notes TEXT DEFAULT '', listing_url TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS iso_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_name TEXT DEFAULT '', buyer_email TEXT DEFAULT '', buyer_phone TEXT DEFAULT '',
      make TEXT DEFAULT '', model TEXT DEFAULT '', year_min TEXT DEFAULT '', year_max TEXT DEFAULT '',
      length_min TEXT DEFAULT '', length_max TEXT DEFAULT '', budget_min TEXT DEFAULT '', budget_max TEXT DEFAULT '',
      preferences TEXT DEFAULT '', status TEXT DEFAULT 'active', notes TEXT DEFAULT '',
      lead_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );
  `);

  return db;
}

// ===================== POCKET LISTINGS =====================

export type PocketListing = {
  id: number; make: string; model: string; year: string; length: string;
  price: string; location: string; description: string; seller_name: string;
  seller_contact: string; status: string; notes: string; listing_url: string;
  created_at: string; updated_at: string;
};

export async function readPocketListings(): Promise<PocketListing[]> {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM pocket_listings ORDER BY created_at DESC").all() as PocketListing[];
  } finally { db.close(); }
}

export async function createPocketListing(input: Partial<PocketListing>): Promise<PocketListing> {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO pocket_listings (make, model, year, length, price, location, description, seller_name, seller_contact, status, notes, listing_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.make || "", input.model || "", input.year || "", input.length || "",
      input.price || "", input.location || "", input.description || "",
      input.seller_name || "", input.seller_contact || "", input.status || "active",
      input.notes || "", input.listing_url || "", now, now
    );
    return db.prepare("SELECT * FROM pocket_listings WHERE id = ?").get(result.lastInsertRowid) as PocketListing;
  } finally { db.close(); }
}

export async function updatePocketListing(id: number, updates: Partial<PocketListing>): Promise<PocketListing | null> {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["make","model","year","length","price","location","description","seller_name","seller_contact","status","notes","listing_url"];
    for (const f of allowed) {
      if (f in updates && (updates as any)[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push((updates as any)[f]);
      }
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM pocket_listings WHERE id = ?").get(id) as PocketListing;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE pocket_listings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM pocket_listings WHERE id = ?").get(id) as PocketListing || null;
  } finally { db.close(); }
}

export async function deletePocketListing(id: number): Promise<boolean> {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM pocket_listings WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}

// ===================== ISO REQUESTS =====================

export type IsoRequest = {
  id: number; buyer_name: string; buyer_email: string; buyer_phone: string;
  make: string; model: string; year_min: string; year_max: string;
  length_min: string; length_max: string; budget_min: string; budget_max: string;
  preferences: string; status: string; notes: string; lead_id: number | null;
  created_at: string; updated_at: string;
};

export async function readIsoRequests(): Promise<IsoRequest[]> {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM iso_requests ORDER BY created_at DESC").all() as IsoRequest[];
  } finally { db.close(); }
}

export async function createIsoRequest(input: Partial<IsoRequest>): Promise<IsoRequest> {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO iso_requests (buyer_name, buyer_email, buyer_phone, make, model, year_min, year_max, length_min, length_max, budget_min, budget_max, preferences, status, notes, lead_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.buyer_name || "", input.buyer_email || "", input.buyer_phone || "",
      input.make || "", input.model || "", input.year_min || "", input.year_max || "",
      input.length_min || "", input.length_max || "", input.budget_min || "", input.budget_max || "",
      input.preferences || "", input.status || "active", input.notes || "",
      input.lead_id || null, now, now
    );
    return db.prepare("SELECT * FROM iso_requests WHERE id = ?").get(result.lastInsertRowid) as IsoRequest;
  } finally { db.close(); }
}

export async function updateIsoRequest(id: number, updates: Partial<IsoRequest>): Promise<IsoRequest | null> {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["buyer_name","buyer_email","buyer_phone","make","model","year_min","year_max","length_min","length_max","budget_min","budget_max","preferences","status","notes","lead_id"];
    for (const f of allowed) {
      if (f in updates && (updates as any)[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push((updates as any)[f]);
      }
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM iso_requests WHERE id = ?").get(id) as IsoRequest;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE iso_requests SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM iso_requests WHERE id = ?").get(id) as IsoRequest || null;
  } finally { db.close(); }
}

export async function deleteIsoRequest(id: number): Promise<boolean> {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM iso_requests WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}
