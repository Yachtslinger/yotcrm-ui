import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initMatchTables() {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT DEFAULT 'boatwizard',
        subject TEXT DEFAULT '',
        sender TEXT DEFAULT '',
        content_hash TEXT UNIQUE,
        raw_content TEXT DEFAULT '',
        listing_count INTEGER DEFAULT 0,
        match_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'processed',
        error_log TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS parsed_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        make TEXT DEFAULT '',
        model TEXT DEFAULT '',
        year TEXT DEFAULT '',
        loa TEXT DEFAULT '',
        asking_price TEXT DEFAULT '',
        location TEXT DEFAULT '',
        vessel_type TEXT DEFAULT '',
        features TEXT DEFAULT '',
        listing_url TEXT DEFAULT '',
        broker_notes TEXT DEFAULT '',
        raw_text TEXT DEFAULT '',
        content_hash TEXT,
        section TEXT DEFAULT '',
        brokerage TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES email_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS listing_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id INTEGER NOT NULL,
        lead_id INTEGER,
        iso_id INTEGER,
        batch_id INTEGER NOT NULL,
        match_score INTEGER DEFAULT 0,
        confidence TEXT DEFAULT 'low',
        reasons TEXT DEFAULT '[]',
        conflicts TEXT DEFAULT '[]',
        status TEXT DEFAULT 'new',
        notes TEXT DEFAULT '',
        contacted_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (listing_id) REFERENCES parsed_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES email_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS match_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        title TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES email_batches(id) ON DELETE CASCADE
      );
    `);

    // Safe column migrations for existing databases
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN section TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN brokerage TEXT DEFAULT ''"); } catch {}
  } finally { db.close(); }
}

// ─── Types ──────────────────────────────────────────────

export type EmailBatch = {
  id: number; source: string; subject: string; sender: string;
  content_hash: string; listing_count: number; match_count: number;
  status: string; error_log: string; created_at: string;
};

export type ParsedListing = {
  id: number; batch_id: number; make: string; model: string;
  year: string; loa: string; asking_price: string; location: string;
  vessel_type: string; features: string; listing_url: string;
  broker_notes: string; raw_text: string; created_at: string;
  section?: string; brokerage?: string;
};

export type ListingMatch = {
  id: number; listing_id: number; lead_id: number | null;
  iso_id: number | null; batch_id: number; match_score: number;
  confidence: string; reasons: string; conflicts: string;
  status: string; notes: string; contacted_at: string | null;
  created_at: string;
  // Joined fields
  listing?: ParsedListing;
  lead_name?: string; lead_email?: string; lead_phone?: string;
  lead_status?: string; lead_notes?: string;
  iso_name?: string; iso_email?: string;
};

// ─── Batch Operations ───────────────────────────────────

export function createBatch(source: string, subject: string, sender: string, rawContent: string): EmailBatch | null {
  const db = getDb();
  try {
    initMatchTables();
    const hash = crypto.createHash("sha256").update(rawContent).digest("hex");
    // Idempotency check
    const existing = db.prepare("SELECT * FROM email_batches WHERE content_hash = ?").get(hash) as EmailBatch | undefined;
    if (existing) return null; // already processed
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO email_batches (source, subject, sender, content_hash, raw_content, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(source, subject, sender, hash, rawContent, now);
    return db.prepare("SELECT * FROM email_batches WHERE id = ?").get(result.lastInsertRowid) as EmailBatch;
  } finally { db.close(); }
}

export function updateBatchCounts(batchId: number, listingCount: number, matchCount: number) {
  const db = getDb();
  try {
    db.prepare("UPDATE email_batches SET listing_count = ?, match_count = ? WHERE id = ?").run(listingCount, matchCount, batchId);
  } finally { db.close(); }
}

export function listBatches(): EmailBatch[] {
  const db = getDb();
  try {
    initMatchTables();
    return db.prepare("SELECT id, source, subject, sender, listing_count, match_count, status, created_at FROM email_batches ORDER BY created_at DESC").all() as EmailBatch[];
  } finally { db.close(); }
}

// ─── Parsed Listings ────────────────────────────────────

export function insertListing(batchId: number, listing: Partial<ParsedListing> & { section?: string; brokerage?: string }): ParsedListing {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const hash = crypto.createHash("sha256").update(JSON.stringify(listing)).digest("hex");

    // Check for duplicate by URL or content hash
    if (listing.listing_url) {
      const existing = db.prepare("SELECT id FROM parsed_listings WHERE listing_url = ?").get(listing.listing_url) as any;
      if (existing) {
        // Tag with additional section if different
        if (listing.section) {
          const current = db.prepare("SELECT section FROM parsed_listings WHERE id = ?").get(existing.id) as any;
          if (current && !current.section?.includes(listing.section)) {
            db.prepare("UPDATE parsed_listings SET section = ? WHERE id = ?")
              .run(`${current.section},${listing.section}`, existing.id);
          }
        }
        return db.prepare("SELECT * FROM parsed_listings WHERE id = ?").get(existing.id) as ParsedListing;
      }
    }

    const result = db.prepare(
      `INSERT INTO parsed_listings (batch_id, make, model, year, loa, asking_price, location, vessel_type, features, listing_url, broker_notes, raw_text, content_hash, section, brokerage, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(batchId, listing.make||"", listing.model||"", listing.year||"", listing.loa||"",
      listing.asking_price||"", listing.location||"", listing.vessel_type||"",
      listing.features||"", listing.listing_url||"", listing.broker_notes||"",
      listing.raw_text||"", hash, listing.section||"", listing.brokerage||"", now);
    return db.prepare("SELECT * FROM parsed_listings WHERE id = ?").get(result.lastInsertRowid) as ParsedListing;
  } finally { db.close(); }
}

export function getListingsForBatch(batchId: number): ParsedListing[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM parsed_listings WHERE batch_id = ? ORDER BY id").all(batchId) as ParsedListing[];
  } finally { db.close(); }
}

// ─── Match Engine ───────────────────────────────────────

function parseNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

type MatchResult = { score: number; confidence: string; reasons: string[]; conflicts: string[] };

export function scoreListingVsBuyer(
  listing: ParsedListing,
  buyer: { budget_min?: string; budget_max?: string; length_min?: string; length_max?: string;
    year_min?: string; year_max?: string; make?: string; model?: string;
    preferred_location?: string; boat_make?: string; boat_year?: string;
    boat_length?: string; boat_price?: string; notes?: string }
): MatchResult {
  let score = 0;
  const reasons: string[] = [];
  const conflicts: string[] = [];

  const lPrice = parseNum(listing.asking_price);
  const lLoa = parseNum(listing.loa);
  const lYear = parseNum(listing.year);
  const lMake = (listing.make || "").toLowerCase().trim();

  // ── PRICE (30 pts) ──
  const bMin = parseNum(buyer.budget_min) || parseNum(buyer.boat_price);
  const bMax = parseNum(buyer.budget_max) || (bMin ? bMin * 1.3 : null);
  if (lPrice !== null && bMax !== null) {
    if (lPrice <= bMax && (!bMin || lPrice >= bMin * 0.7)) {
      score += 30;
      reasons.push(`Price $${(lPrice/1e6).toFixed(1)}M within budget`);
    } else if (lPrice <= bMax * 1.15) {
      score += 15;
      conflicts.push(`Price slightly over budget (${Math.round((lPrice/bMax - 1)*100)}%)`);
    } else {
      conflicts.push("Price exceeds budget by >15%");
    }
  } else { score += 15; } // missing data = neutral

  // ── LOA (25 pts) ──
  const bLenMin = parseNum(buyer.length_min) || (parseNum(buyer.boat_length) ? parseNum(buyer.boat_length)! * 0.85 : null);
  const bLenMax = parseNum(buyer.length_max) || (parseNum(buyer.boat_length) ? parseNum(buyer.boat_length)! * 1.15 : null);
  if (lLoa !== null && (bLenMin !== null || bLenMax !== null)) {
    const lo = bLenMin || 0;
    const hi = bLenMax || Infinity;
    if (lLoa >= lo && lLoa <= hi) {
      score += 25;
      reasons.push(`LOA ${listing.loa} fits ${lo}'–${hi === Infinity ? "any" : hi + "'"}`);
    } else if (lLoa >= lo * 0.9 && lLoa <= hi * 1.1) {
      score += 12;
      conflicts.push(`LOA ${listing.loa} slightly outside range`);
    } else {
      conflicts.push(`LOA ${listing.loa} outside desired range`);
    }
  } else { score += 12; }

  // ── YEAR (15 pts) ──
  const bYearMin = parseNum(buyer.year_min) || (parseNum(buyer.boat_year) ? parseNum(buyer.boat_year)! - 3 : null);
  const bYearMax = parseNum(buyer.year_max) || (parseNum(buyer.boat_year) ? parseNum(buyer.boat_year)! + 3 : null);
  if (lYear !== null && (bYearMin !== null || bYearMax !== null)) {
    const lo = bYearMin || 0;
    const hi = bYearMax || 9999;
    if (lYear >= lo && lYear <= hi) {
      score += 15;
      reasons.push(`Year ${listing.year} in range ${lo}–${hi}`);
    } else if (lYear >= lo - 3 && lYear <= hi + 3) {
      score += 7;
      conflicts.push(`Year ${listing.year} slightly outside target`);
    } else {
      conflicts.push(`Year too far from target range`);
    }
  } else { score += 7; }

  // ── MAKE (15 pts) ──
  const bMake = (buyer.make || buyer.boat_make || "").toLowerCase().trim();
  if (lMake && bMake) {
    if (lMake === bMake || lMake.includes(bMake) || bMake.includes(lMake)) {
      score += 15;
      reasons.push(`Make match: ${listing.make}`);
    } else {
      score += 0;
      conflicts.push(`Different make: ${listing.make} vs preferred ${buyer.make || buyer.boat_make}`);
    }
  } else { score += 7; }

  // ── LOCATION (10 pts) ──
  const lLoc = (listing.location || "").toLowerCase();
  const bLoc = (buyer.preferred_location || "").toLowerCase();
  if (lLoc && bLoc) {
    if (lLoc.includes(bLoc) || bLoc.includes(lLoc)) {
      score += 10;
      reasons.push(`Location match: ${listing.location}`);
    } else {
      // Check state/region overlap
      const flTerms = ["florida", "fl", "fort lauderdale", "miami", "palm beach"];
      const lInFl = flTerms.some(t => lLoc.includes(t));
      const bInFl = flTerms.some(t => bLoc.includes(t));
      if (lInFl && bInFl) { score += 5; reasons.push("Same region (FL)"); }
    }
  } else { score += 5; }

  // ── VESSEL TYPE (5 pts) ── always neutral for now
  score += 3;

  // Confidence bucket
  const confidence = score >= 70 ? "high" : score >= 45 ? "medium" : "low";

  return { score, confidence, reasons, conflicts };
}

// ─── Run Matches for a Batch ────────────────────────────

export function runMatchesForBatch(batchId: number): number {
  const db = getDb();
  try {
    initMatchTables();
    const listings = db.prepare("SELECT * FROM parsed_listings WHERE batch_id = ?").all(batchId) as ParsedListing[];
    const leads = db.prepare("SELECT * FROM leads").all() as any[];
    const boats = db.prepare("SELECT * FROM boats").all() as any[];
    let isos: any[] = [];
    try { isos = db.prepare("SELECT * FROM buyer_searches WHERE status = 'active'").all() as any[]; } catch {}

    // Group boats by lead
    const boatsByLead = new Map<number, any[]>();
    for (const b of boats) {
      if (!boatsByLead.has(b.lead_id)) boatsByLead.set(b.lead_id, []);
      boatsByLead.get(b.lead_id)!.push(b);
    }

    const now = new Date().toISOString();
    let totalMatches = 0;
    const THRESHOLD = 20;

    for (const listing of listings) {
      // Match against leads (via their boats as preference signals)
      for (const lead of leads) {
        const leadBoats = boatsByLead.get(lead.id) || [];
        const firstBoat = leadBoats[0];
        if (!firstBoat) continue; // no boat interest data

        const result = scoreListingVsBuyer(listing, {
          boat_make: firstBoat.make, boat_year: firstBoat.year,
          boat_length: firstBoat.length, boat_price: firstBoat.price,
          notes: lead.notes,
        });

        if (result.score >= THRESHOLD) {
          try {
            db.prepare(
              `INSERT OR IGNORE INTO listing_matches (listing_id, lead_id, iso_id, batch_id, match_score, confidence, reasons, conflicts, status, created_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'new', ?)`
            ).run(listing.id, lead.id, batchId, result.score, result.confidence,
              JSON.stringify(result.reasons), JSON.stringify(result.conflicts), now);
            totalMatches++;
          } catch {}
        }
      }

      // Match against ISOs (buyer_searches)
      for (const iso of isos) {
        const result = scoreListingVsBuyer(listing, {
          budget_min: iso.budget_min, budget_max: iso.budget_max,
          length_min: iso.length_min, length_max: iso.length_max,
          year_min: iso.year_min, year_max: iso.year_max,
          make: iso.make, model: iso.model,
          preferred_location: iso.preferred_location,
        });

        if (result.score >= THRESHOLD) {
          try {
            db.prepare(
              `INSERT OR IGNORE INTO listing_matches (listing_id, lead_id, iso_id, batch_id, match_score, confidence, reasons, conflicts, status, created_at)
               VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'new', ?)`
            ).run(listing.id, iso.id, batchId, result.score, result.confidence,
              JSON.stringify(result.reasons), JSON.stringify(result.conflicts), now);
            totalMatches++;
          } catch {}
        }
      }
    }

    // Update batch counts
    db.prepare("UPDATE email_batches SET listing_count = ?, match_count = ? WHERE id = ?")
      .run(listings.length, totalMatches, batchId);

    // Create notification
    const highCount = db.prepare("SELECT COUNT(*) as c FROM listing_matches WHERE batch_id = ? AND confidence = 'high'").get(batchId) as any;
    db.prepare("INSERT INTO match_notifications (batch_id, title, summary, created_at) VALUES (?, ?, ?, ?)")
      .run(batchId, "New Listings Processed",
        `${listings.length} boats parsed, ${highCount.c} high-confidence matches, ${totalMatches} total matches`, now);

    return totalMatches;
  } finally { db.close(); }
}

// ─── Auto-Generate "Send Boat" Todos from Matches ──────

export function generateMatchTodos(batchId: number): number {
  const db = getDb();
  try {
    // Get all medium+ matches for this batch with joined data
    const matches = db.prepare(`
      SELECT lm.*, pl.make, pl.model, pl.year, pl.loa, pl.asking_price, pl.location, pl.section, pl.brokerage,
        l.first_name, l.last_name, l.email AS lead_email, l.phone AS lead_phone
      FROM listing_matches lm
      JOIN parsed_listings pl ON lm.listing_id = pl.id
      LEFT JOIN leads l ON lm.lead_id = l.id
      WHERE lm.batch_id = ? AND lm.match_score >= 45
      ORDER BY lm.match_score DESC
    `).all(batchId) as any[];

    if (matches.length === 0) return 0;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    let todosCreated = 0;

    // Determine assignee: USA matches → will, global → paolo, high-confidence → both
    for (const m of matches) {
      const boatLabel = [m.make, m.model, m.year ? `(${m.year})` : "", m.loa ? `${m.loa}'` : ""]
        .filter(Boolean).join(" ").trim() || "Unknown vessel";
      const prospectName = [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown prospect";
      const price = m.asking_price ? `$${Number(m.asking_price).toLocaleString()}` : "";

      const reasons = (() => { try { return JSON.parse(m.reasons || "[]"); } catch { return []; } })();
      const topReason = reasons[0] || "";

      // Build todo text with boat-send format
      const todoText = `🚢 Send ${boatLabel}${price ? ` — ${price}` : ""} to ${prospectName}${topReason ? ` (${topReason})` : ""}`;

      // Check for existing identical todo (avoid duplicates across re-runs)
      const existing = db.prepare(
        "SELECT id FROM todos WHERE text LIKE ? AND completed = 0"
      ).get(`%Send ${boatLabel}%${prospectName}%`) as any;
      if (existing) continue;

      // Assign: section-based routing
      const section = (m.section || "").toLowerCase();
      const isHigh = m.match_score >= 70;
      const assignees: string[] = [];

      if (isHigh) {
        // High-confidence → both brokers
        assignees.push("will", "paolo");
      } else if (section.includes("global")) {
        assignees.push("paolo");
      } else {
        assignees.push("will");
      }

      for (const assignee of assignees) {
        db.prepare(`
          INSERT INTO todos (text, priority, lead_id, due_date, assignee, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          todoText,
          isHigh ? "high" : "normal",
          m.lead_id || null,
          today,
          assignee,
          now, now
        );
        todosCreated++;
      }
    }

    return todosCreated;
  } finally { db.close(); }
}

// ─── Query Functions for UI ─────────────────────────────

export type MatchFilters = {
  batchId?: number;
  confidence?: string;       // "high" | "medium" | "low"
  minScore?: number;
  maxScore?: number;
  make?: string;
  yearMin?: number;
  yearMax?: number;
  loaMin?: number;
  loaMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  leadStatus?: string;
  status?: string;           // "new" | "contacted" | "dismissed" | "snoozed"
  search?: string;
  page?: number;
  pageSize?: number;
};

export function listMatchesForPage(filters: MatchFilters = {}): { matches: ListingMatch[]; total: number } {
  const db = getDb();
  try {
    initMatchTables();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.batchId) { conditions.push("lm.batch_id = ?"); params.push(filters.batchId); }
    if (filters.confidence) { conditions.push("lm.confidence = ?"); params.push(filters.confidence); }
    if (filters.minScore !== undefined) { conditions.push("lm.match_score >= ?"); params.push(filters.minScore); }
    if (filters.maxScore !== undefined) { conditions.push("lm.match_score <= ?"); params.push(filters.maxScore); }
    if (filters.status) { conditions.push("lm.status = ?"); params.push(filters.status); }

    // Listing filters
    if (filters.make) { conditions.push("LOWER(pl.make) LIKE ?"); params.push(`%${filters.make.toLowerCase()}%`); }
    if (filters.yearMin) { conditions.push("CAST(pl.year AS INTEGER) >= ?"); params.push(filters.yearMin); }
    if (filters.yearMax) { conditions.push("CAST(pl.year AS INTEGER) <= ?"); params.push(filters.yearMax); }
    if (filters.loaMin) { conditions.push("CAST(REPLACE(REPLACE(pl.loa, '''', ''), 'ft', '') AS REAL) >= ?"); params.push(filters.loaMin); }
    if (filters.loaMax) { conditions.push("CAST(REPLACE(REPLACE(pl.loa, '''', ''), 'ft', '') AS REAL) <= ?"); params.push(filters.loaMax); }
    if (filters.budgetMin) { conditions.push("CAST(REPLACE(REPLACE(REPLACE(pl.asking_price, '$', ''), ',', ''), ' ', '') AS REAL) >= ?"); params.push(filters.budgetMin); }
    if (filters.budgetMax) { conditions.push("CAST(REPLACE(REPLACE(REPLACE(pl.asking_price, '$', ''), ',', ''), ' ', '') AS REAL) <= ?"); params.push(filters.budgetMax); }

    // Search across prospect name + boat make/model
    if (filters.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      conditions.push(`(LOWER(l.first_name || ' ' || COALESCE(l.last_name, '')) LIKE ? OR LOWER(pl.make || ' ' || pl.model) LIKE ? OR LOWER(COALESCE(bs.buyer_name, '')) LIKE ?)`);
      params.push(s, s, s);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const baseQuery = `
      FROM listing_matches lm
      JOIN parsed_listings pl ON lm.listing_id = pl.id
      LEFT JOIN leads l ON lm.lead_id = l.id
      LEFT JOIN buyer_searches bs ON lm.iso_id = bs.id
      ${where}
    `;

    const countRow = db.prepare(`SELECT COUNT(*) as total ${baseQuery}`).get(...params) as any;
    const rows = db.prepare(`
      SELECT lm.*,
        pl.make AS pl_make, pl.model AS pl_model, pl.year AS pl_year,
        pl.loa AS pl_loa, pl.asking_price AS pl_asking_price, pl.location AS pl_location,
        pl.vessel_type AS pl_vessel_type, pl.features AS pl_features,
        pl.listing_url AS pl_listing_url, pl.broker_notes AS pl_broker_notes,
        pl.raw_text AS pl_raw_text, pl.batch_id AS pl_batch_id, pl.created_at AS pl_created_at,
        pl.section AS pl_section, pl.brokerage AS pl_brokerage,
        l.first_name AS lead_first, l.last_name AS lead_last,
        l.email AS lead_email, l.phone AS lead_phone,
        l.status AS lead_status, l.notes AS lead_notes,
        bs.buyer_name AS iso_name, bs.buyer_email AS iso_email, bs.buyer_phone AS iso_phone
      ${baseQuery}
      ORDER BY lm.match_score DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[];

    const matches: ListingMatch[] = rows.map(r => ({
      id: r.id, listing_id: r.listing_id, lead_id: r.lead_id,
      iso_id: r.iso_id, batch_id: r.batch_id, match_score: r.match_score,
      confidence: r.confidence, reasons: r.reasons, conflicts: r.conflicts,
      status: r.status, notes: r.notes, contacted_at: r.contacted_at,
      created_at: r.created_at,
      listing: {
        id: r.listing_id, batch_id: r.pl_batch_id, make: r.pl_make, model: r.pl_model,
        year: r.pl_year, loa: r.pl_loa, asking_price: r.pl_asking_price,
        location: r.pl_location, vessel_type: r.pl_vessel_type, features: r.pl_features,
        listing_url: r.pl_listing_url, broker_notes: r.pl_broker_notes,
        raw_text: r.pl_raw_text, created_at: r.pl_created_at,
      },
      lead_name: r.lead_first ? `${r.lead_first} ${r.lead_last || ""}`.trim() : (r.iso_name || ""),
      lead_email: r.lead_email || r.iso_email || "",
      lead_phone: r.lead_phone || r.iso_phone || "",
      lead_status: r.lead_status || "",
      lead_notes: r.lead_notes || "",
      iso_name: r.iso_name || "",
      iso_email: r.iso_email || "",
    }));

    return { matches, total: countRow.total };
  } finally { db.close(); }
}

export function getMatchDetail(matchId: number): ListingMatch | null {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT lm.*,
        pl.make AS pl_make, pl.model AS pl_model, pl.year AS pl_year,
        pl.loa AS pl_loa, pl.asking_price AS pl_asking_price, pl.location AS pl_location,
        pl.vessel_type AS pl_vessel_type, pl.features AS pl_features,
        pl.listing_url AS pl_listing_url, pl.broker_notes AS pl_broker_notes,
        pl.raw_text AS pl_raw_text, pl.batch_id AS pl_batch_id, pl.created_at AS pl_created_at,
        pl.section AS pl_section, pl.brokerage AS pl_brokerage,
        l.first_name AS lead_first, l.last_name AS lead_last,
        l.email AS lead_email, l.phone AS lead_phone,
        l.status AS lead_status, l.notes AS lead_notes,
        bs.buyer_name AS iso_name, bs.buyer_email AS iso_email, bs.buyer_phone AS iso_phone
      FROM listing_matches lm
      JOIN parsed_listings pl ON lm.listing_id = pl.id
      LEFT JOIN leads l ON lm.lead_id = l.id
      LEFT JOIN buyer_searches bs ON lm.iso_id = bs.id
      WHERE lm.id = ?
    `).get(matchId) as any;
    if (!row) return null;
    return {
      id: row.id, listing_id: row.listing_id, lead_id: row.lead_id,
      iso_id: row.iso_id, batch_id: row.batch_id, match_score: row.match_score,
      confidence: row.confidence, reasons: row.reasons, conflicts: row.conflicts,
      status: row.status, notes: row.notes, contacted_at: row.contacted_at,
      created_at: row.created_at,
      listing: {
        id: row.listing_id, batch_id: row.pl_batch_id, make: row.pl_make, model: row.pl_model,
        year: row.pl_year, loa: row.pl_loa, asking_price: row.pl_asking_price,
        location: row.pl_location, vessel_type: row.pl_vessel_type, features: row.pl_features,
        listing_url: row.pl_listing_url, broker_notes: row.pl_broker_notes,
        raw_text: row.pl_raw_text, created_at: row.pl_created_at,
      },
      lead_name: row.lead_first ? `${row.lead_first} ${row.lead_last || ""}`.trim() : (row.iso_name || ""),
      lead_email: row.lead_email || row.iso_email || "",
      lead_phone: row.lead_phone || row.iso_phone || "",
      lead_status: row.lead_status || "",
      lead_notes: row.lead_notes || "",
      iso_name: row.iso_name || "",
      iso_email: row.iso_email || "",
    };
  } finally { db.close(); }
}

export function updateListingMatchStatus(matchId: number, status: string, notes?: string) {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    if (notes !== undefined) {
      db.prepare("UPDATE listing_matches SET status = ?, notes = ?, contacted_at = CASE WHEN ? = 'contacted' THEN ? ELSE contacted_at END WHERE id = ?")
        .run(status, notes, status, now, matchId);
    } else {
      db.prepare("UPDATE listing_matches SET status = ?, contacted_at = CASE WHEN ? = 'contacted' THEN ? ELSE contacted_at END WHERE id = ?")
        .run(status, status, now, matchId);
    }
  } finally { db.close(); }
}

export function listNotifications(): any[] {
  const db = getDb();
  try {
    initMatchTables();
    return db.prepare("SELECT * FROM match_notifications ORDER BY created_at DESC LIMIT 50").all();
  } finally { db.close(); }
}

export function markNotificationRead(id: number) {
  const db = getDb();
  try {
    db.prepare("UPDATE match_notifications SET read = 1 WHERE id = ?").run(id);
  } finally { db.close(); }
}
