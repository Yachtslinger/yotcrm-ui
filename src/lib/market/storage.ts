import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Init Tables ────────────────────────────────────────────────────

export function initMarketTables() {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pocket_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        make TEXT DEFAULT '',
        model TEXT DEFAULT '',
        year TEXT DEFAULT '',
        length TEXT DEFAULT '',
        price TEXT DEFAULT '',
        location TEXT DEFAULT '',
        description TEXT DEFAULT '',
        contact_name TEXT DEFAULT '',
        contact_info TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS buyer_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_name TEXT DEFAULT '',
        buyer_email TEXT DEFAULT '',
        buyer_phone TEXT DEFAULT '',
        make TEXT DEFAULT '',
        model TEXT DEFAULT '',
        year_min TEXT DEFAULT '',
        year_max TEXT DEFAULT '',
        length_min TEXT DEFAULT '',
        length_max TEXT DEFAULT '',
        budget_min TEXT DEFAULT '',
        budget_max TEXT DEFAULT '',
        preferred_location TEXT DEFAULT '',
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        notes TEXT DEFAULT '',
        lead_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS vessel_owners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_name TEXT DEFAULT '',
        owner_email TEXT DEFAULT '',
        owner_phone TEXT DEFAULT '',
        make TEXT DEFAULT '',
        model TEXT DEFAULT '',
        year TEXT DEFAULT '',
        length TEXT DEFAULT '',
        estimated_value TEXT DEFAULT '',
        location TEXT DEFAULT '',
        vessel_name TEXT DEFAULT '',
        how_known TEXT DEFAULT '',
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        notes TEXT DEFAULT '',
        lead_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS vessel_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        iso_id INTEGER NOT NULL,
        match_score INTEGER DEFAULT 0,
        match_reasons TEXT DEFAULT '',
        status TEXT DEFAULT 'new',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES vessel_owners(id) ON DELETE CASCADE,
        FOREIGN KEY (iso_id) REFERENCES buyer_searches(id) ON DELETE CASCADE,
        UNIQUE(owner_id, iso_id)
      );
    `);
  } finally {
    db.close();
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export type PocketListing = {
  id: number; make: string; model: string; year: string;
  length: string; price: string; location: string;
  description: string; contact_name: string; contact_info: string;
  status: string; notes: string; created_at: string; updated_at: string;
};

export type BuyerSearch = {
  id: number; buyer_name: string; buyer_email: string; buyer_phone: string;
  make: string; model: string; year_min: string; year_max: string;
  length_min: string; length_max: string; budget_min: string; budget_max: string;
  preferred_location: string; description: string; status: string; notes: string;
  lead_id: number | null; created_at: string; updated_at: string;
};

export type VesselOwner = {
  id: number; owner_name: string; owner_email: string; owner_phone: string;
  make: string; model: string; year: string; length: string;
  estimated_value: string; location: string; vessel_name: string;
  how_known: string; description: string; status: string; notes: string;
  lead_id: number | null; created_at: string; updated_at: string;
};

export type VesselMatch = {
  id: number; owner_id: number; iso_id: number; match_score: number;
  match_reasons: string; status: string; notes: string; created_at: string;
  // Joined fields
  owner?: VesselOwner;
  buyer?: BuyerSearch;
};

// ─── Pocket Listings CRUD ───────────────────────────────────────────

export function listPocketListings(): PocketListing[] {
  const db = getDb();
  try {
    initMarketTables();
    return db.prepare("SELECT * FROM pocket_listings ORDER BY created_at DESC").all() as PocketListing[];
  } finally { db.close(); }
}

export function createPocketListing(input: Partial<PocketListing>): PocketListing {
  const db = getDb();
  try {
    initMarketTables();
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO pocket_listings (make, model, year, length, price, location, description, contact_name, contact_info, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.make || "", input.model || "", input.year || "", input.length || "",
      input.price || "", input.location || "", input.description || "",
      input.contact_name || "", input.contact_info || "",
      input.status || "active", input.notes || "", now, now
    );
    return db.prepare("SELECT * FROM pocket_listings WHERE id = ?").get(result.lastInsertRowid) as PocketListing;
  } finally { db.close(); }
}

export function updatePocketListing(id: number, updates: Partial<PocketListing>): PocketListing | null {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["make","model","year","length","price","location","description","contact_name","contact_info","status","notes"];
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

export function deletePocketListing(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM pocket_listings WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}

// ─── Buyer Searches (ISO) CRUD ──────────────────────────────────────

export function listBuyerSearches(): BuyerSearch[] {
  const db = getDb();
  try {
    initMarketTables();
    return db.prepare("SELECT * FROM buyer_searches ORDER BY created_at DESC").all() as BuyerSearch[];
  } finally { db.close(); }
}

export function createBuyerSearch(input: Partial<BuyerSearch>): BuyerSearch {
  const db = getDb();
  try {
    initMarketTables();
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO buyer_searches (buyer_name, buyer_email, buyer_phone, make, model, year_min, year_max, length_min, length_max, budget_min, budget_max, preferred_location, description, status, notes, lead_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.buyer_name||"", input.buyer_email||"", input.buyer_phone||"",
      input.make||"", input.model||"", input.year_min||"", input.year_max||"",
      input.length_min||"", input.length_max||"", input.budget_min||"", input.budget_max||"",
      input.preferred_location||"", input.description||"",
      input.status||"active", input.notes||"", input.lead_id||null, now, now
    );
    return db.prepare("SELECT * FROM buyer_searches WHERE id = ?").get(result.lastInsertRowid) as BuyerSearch;
  } finally { db.close(); }
}

export function updateBuyerSearch(id: number, updates: Partial<BuyerSearch>): BuyerSearch | null {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["buyer_name","buyer_email","buyer_phone","make","model","year_min","year_max","length_min","length_max","budget_min","budget_max","preferred_location","description","status","notes","lead_id"];
    for (const f of allowed) {
      if (f in updates && (updates as any)[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push((updates as any)[f]);
      }
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM buyer_searches WHERE id = ?").get(id) as BuyerSearch;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE buyer_searches SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM buyer_searches WHERE id = ?").get(id) as BuyerSearch || null;
  } finally { db.close(); }
}

export function deleteBuyerSearch(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM buyer_searches WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}


// ─── Vessel Owners CRUD ─────────────────────────────────────────────

export function listVesselOwners(): VesselOwner[] {
  const db = getDb();
  try {
    initMarketTables();
    return db.prepare("SELECT * FROM vessel_owners ORDER BY created_at DESC").all() as VesselOwner[];
  } finally { db.close(); }
}

export function createVesselOwner(input: Partial<VesselOwner>): VesselOwner {
  const db = getDb();
  try {
    initMarketTables();
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO vessel_owners (owner_name, owner_email, owner_phone, make, model, year, length, estimated_value, location, vessel_name, how_known, description, status, notes, lead_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.owner_name||"", input.owner_email||"", input.owner_phone||"",
      input.make||"", input.model||"", input.year||"", input.length||"",
      input.estimated_value||"", input.location||"", input.vessel_name||"",
      input.how_known||"", input.description||"",
      input.status||"active", input.notes||"", input.lead_id||null, now, now
    );
    return db.prepare("SELECT * FROM vessel_owners WHERE id = ?").get(result.lastInsertRowid) as VesselOwner;
  } finally { db.close(); }
}

export function updateVesselOwner(id: number, updates: Partial<VesselOwner>): VesselOwner | null {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["owner_name","owner_email","owner_phone","make","model","year","length","estimated_value","location","vessel_name","how_known","description","status","notes","lead_id"];
    for (const f of allowed) {
      if (f in updates && (updates as any)[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push((updates as any)[f]);
      }
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM vessel_owners WHERE id = ?").get(id) as VesselOwner;
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE vessel_owners SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return db.prepare("SELECT * FROM vessel_owners WHERE id = ?").get(id) as VesselOwner || null;
  } finally { db.close(); }
}

export function deleteVesselOwner(id: number): boolean {
  const db = getDb();
  try {
    db.prepare("DELETE FROM vessel_matches WHERE owner_id = ?").run(id);
    const result = db.prepare("DELETE FROM vessel_owners WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}

// ─── Match Engine ───────────────────────────────────────────────────

function parseNum(s: string): number {
  // Extract numeric value: "$1,500,000" → 1500000, "80'" → 80, "2018" → 2018
  const cleaned = s.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function inRange(value: number, min: string, max: string): boolean {
  if (!value) return false;
  const lo = min ? parseNum(min) : 0;
  const hi = max ? parseNum(max) : Infinity;
  return value >= lo && value <= hi;
}

function makeSimilar(ownerMake: string, isoMake: string): boolean {
  if (!isoMake || !ownerMake) return true; // no filter = match
  const o = ownerMake.toLowerCase().trim();
  const i = isoMake.toLowerCase().trim();
  if (!o || !i) return true;
  return o.includes(i) || i.includes(o);
}

export function computeMatch(owner: VesselOwner, iso: BuyerSearch): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Length match (strongest signal)
  const ownerLen = parseNum(owner.length);
  if (ownerLen && (iso.length_min || iso.length_max)) {
    if (inRange(ownerLen, iso.length_min, iso.length_max)) {
      score += 30;
      reasons.push(`Length ${owner.length} in range ${iso.length_min}–${iso.length_max}`);
    } else return { score: 0, reasons: [] }; // hard fail
  }

  // Year match
  const ownerYear = parseNum(owner.year);
  if (ownerYear && (iso.year_min || iso.year_max)) {
    if (inRange(ownerYear, iso.year_min, iso.year_max)) {
      score += 25;
      reasons.push(`Year ${owner.year} in range ${iso.year_min}–${iso.year_max}`);
    } else return { score: 0, reasons: [] }; // hard fail
  }

  // Budget/value match
  const ownerVal = parseNum(owner.estimated_value);
  if (ownerVal && (iso.budget_min || iso.budget_max)) {
    if (inRange(ownerVal, iso.budget_min, iso.budget_max)) {
      score += 25;
      reasons.push(`Value ${owner.estimated_value} in budget ${iso.budget_min}–${iso.budget_max}`);
    } else return { score: 0, reasons: [] }; // hard fail
  }

  // Make match (bonus, not hard fail)
  if (makeSimilar(owner.make, iso.make)) {
    if (iso.make && owner.make) {
      score += 15;
      reasons.push(`Make match: ${owner.make}`);
    }
  } else {
    score -= 10; // penalty but not disqualifying
  }

  // Model match (bonus)
  if (iso.model && owner.model) {
    const om = owner.model.toLowerCase();
    const im = iso.model.toLowerCase();
    if (om.includes(im) || im.includes(om)) {
      score += 5;
      reasons.push(`Model match: ${owner.model}`);
    }
  }

  return { score, reasons };
}

const MATCH_THRESHOLD = 25; // minimum score to record a match

export function runMatchesForOwner(ownerId: number): VesselMatch[] {
  const db = getDb();
  try {
    initMarketTables();
    const owner = db.prepare("SELECT * FROM vessel_owners WHERE id = ?").get(ownerId) as VesselOwner;
    if (!owner) return [];
    const isos = db.prepare("SELECT * FROM buyer_searches WHERE status = 'active'").all() as BuyerSearch[];
    const now = new Date().toISOString();
    const matches: VesselMatch[] = [];

    for (const iso of isos) {
      const { score, reasons } = computeMatch(owner, iso);
      if (score >= MATCH_THRESHOLD) {
        try {
          db.prepare(
            `INSERT OR REPLACE INTO vessel_matches (owner_id, iso_id, match_score, match_reasons, status, notes, created_at)
             VALUES (?, ?, ?, ?, 'new', '', ?)`
          ).run(ownerId, iso.id, score, reasons.join("; "), now);
          const m = db.prepare(
            "SELECT * FROM vessel_matches WHERE owner_id = ? AND iso_id = ?"
          ).get(ownerId, iso.id) as VesselMatch;
          if (m) matches.push(m);
        } catch { /* unique constraint — already matched */ }
      }
    }
    return matches;
  } finally { db.close(); }
}

export function runMatchesForISO(isoId: number): VesselMatch[] {
  const db = getDb();
  try {
    initMarketTables();
    const iso = db.prepare("SELECT * FROM buyer_searches WHERE id = ?").get(isoId) as BuyerSearch;
    if (!iso) return [];
    const owners = db.prepare("SELECT * FROM vessel_owners WHERE status = 'active'").all() as VesselOwner[];
    const now = new Date().toISOString();
    const matches: VesselMatch[] = [];

    for (const owner of owners) {
      const { score, reasons } = computeMatch(owner, iso);
      if (score >= MATCH_THRESHOLD) {
        try {
          db.prepare(
            `INSERT OR REPLACE INTO vessel_matches (owner_id, iso_id, match_score, match_reasons, status, notes, created_at)
             VALUES (?, ?, ?, ?, 'new', '', ?)`
          ).run(owner.id, isoId, score, reasons.join("; "), now);
          const m = db.prepare(
            "SELECT * FROM vessel_matches WHERE owner_id = ? AND iso_id = ?"
          ).get(owner.id, isoId) as VesselMatch;
          if (m) matches.push(m);
        } catch {}
      }
    }
    return matches;
  } finally { db.close(); }
}

export function listMatches(status?: string): VesselMatch[] {
  const db = getDb();
  try {
    initMarketTables();
    const where = status ? `WHERE m.status = ?` : "";
    const params = status ? [status] : [];
    return db.prepare(`
      SELECT m.*,
        o.owner_name, o.make as owner_make, o.model as owner_model, o.year as owner_year,
        o.length as owner_length, o.estimated_value as owner_value, o.location as owner_location,
        b.buyer_name, b.buyer_email, b.buyer_phone,
        b.make as iso_make, b.length_min, b.length_max, b.budget_min, b.budget_max
      FROM vessel_matches m
      JOIN vessel_owners o ON m.owner_id = o.id
      JOIN buyer_searches b ON m.iso_id = b.id
      ${where}
      ORDER BY m.match_score DESC, m.created_at DESC
    `).all(...params) as any[];
  } finally { db.close(); }
}

export function updateMatchStatus(matchId: number, status: string, notes?: string): boolean {
  const db = getDb();
  try {
    const fields = ["status = ?"];
    const values: any[] = [status];
    if (notes !== undefined) { fields.push("notes = ?"); values.push(notes); }
    values.push(matchId);
    const result = db.prepare(`UPDATE vessel_matches SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return result.changes > 0;
  } finally { db.close(); }
}

export function getMatchesForOwner(ownerId: number): any[] {
  const db = getDb();
  try {
    initMarketTables();
    return db.prepare(`
      SELECT m.*, b.buyer_name, b.buyer_email, b.buyer_phone,
        b.make as iso_make, b.model as iso_model, b.length_min, b.length_max,
        b.year_min, b.year_max, b.budget_min, b.budget_max
      FROM vessel_matches m
      JOIN buyer_searches b ON m.iso_id = b.id
      WHERE m.owner_id = ? ORDER BY m.match_score DESC
    `).all(ownerId) as any[];
  } finally { db.close(); }
}

export function getMatchesForISO(isoId: number): any[] {
  const db = getDb();
  try {
    initMarketTables();
    return db.prepare(`
      SELECT m.*, o.owner_name, o.owner_email, o.owner_phone,
        o.make, o.model, o.year, o.length, o.estimated_value, o.location
      FROM vessel_matches m
      JOIN vessel_owners o ON m.owner_id = o.id
      WHERE m.iso_id = ? ORDER BY m.match_score DESC
    `).all(isoId) as any[];
  } finally { db.close(); }
}
