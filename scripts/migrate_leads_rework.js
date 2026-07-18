/**
 * Leads Rework — Phase 1 Migration (REVISED to fit real schema, ADDITIVE ONLY)
 * Run: node scripts/migrate_leads_rework.js data/yotcrm.db
 * Reuses: leads flat profile cols, parsed_listings, listing_matches, score_weights.
 * Adds only what's missing. Idempotent.
 */
const Database = require("better-sqlite3");
const dbPath = process.argv[2];
if (!dbPath) { console.error("Usage: node migrate_leads_rework.js <db>"); process.exit(1); }
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c);

db.transaction(() => {
  // 1. Leads: category + pin + profile governance on EXISTING flat criteria columns
  if (!hasCol("leads", "category"))
    db.exec(`ALTER TABLE leads ADD COLUMN category TEXT CHECK (category IN
      ('active_buyer','owner_seller','past_client','co_broker','vendor','dead_dnc'))`);
  if (!hasCol("leads", "pinned_temperature"))
    db.exec(`ALTER TABLE leads ADD COLUMN pinned_temperature TEXT CHECK (pinned_temperature IN
      ('hot','warm','cool','cold'))`);
  if (!hasCol("leads", "profile_status"))
    db.exec(`ALTER TABLE leads ADD COLUMN profile_status TEXT NOT NULL DEFAULT 'none'
      CHECK (profile_status IN ('none','draft','approved','stale'))`);
  if (!hasCol("leads", "profile_confidence_json"))
    db.exec(`ALTER TABLE leads ADD COLUMN profile_confidence_json TEXT DEFAULT '{}'`);
  if (!hasCol("leads", "profile_source_ref"))
    db.exec(`ALTER TABLE leads ADD COLUMN profile_source_ref TEXT`);

  // 2. parsed_listings: stable BoatWizard ID + last-seen tracking (content_hash breaks on price change)
  if (!hasCol("parsed_listings", "boatwizard_id"))
    db.exec(`ALTER TABLE parsed_listings ADD COLUMN boatwizard_id TEXT`);
  if (!hasCol("parsed_listings", "last_seen_at"))
    db.exec(`ALTER TABLE parsed_listings ADD COLUMN last_seen_at TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pl_bwid ON parsed_listings(boatwizard_id)`);

  // 3. Price-drop memory
  db.exec(`CREATE TABLE IF NOT EXISTS listing_price_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parsed_listing_id INTEGER NOT NULL REFERENCES parsed_listings(id),
    old_price INTEGER, new_price INTEGER, delta INTEGER,
    observed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // 4. listing_matches: trigger type + dedupe guard (reused as Match Board rows)
  if (!hasCol("listing_matches", "trigger"))
    db.exec(`ALTER TABLE listing_matches ADD COLUMN trigger TEXT NOT NULL DEFAULT 'new_listing'
      CHECK (trigger IN ('new_listing','price_drop','relist'))`);
  // Archive full table first (never destroy data), then dedupe keeping newest
  db.exec(`CREATE TABLE IF NOT EXISTS listing_matches_archive_20260717 AS SELECT * FROM listing_matches`);
  db.exec(`DELETE FROM listing_matches WHERE id NOT IN
    (SELECT MAX(id) FROM listing_matches GROUP BY listing_id, lead_id, trigger)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_lm_pair ON listing_matches(listing_id, lead_id, trigger)`);

  // 5. Dismissal learning (make/region/type level — finer than dismissed_listing_ids)
  db.exec(`CREATE TABLE IF NOT EXISTS match_weight_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    dimension TEXT NOT NULL CHECK (dimension IN ('make','region','boat_type')),
    value TEXT NOT NULL,
    dismiss_count INTEGER NOT NULL DEFAULT 0,
    weight_multiplier REAL NOT NULL DEFAULT 1.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(lead_id, dimension, value)
  )`);
})();

console.log("Done. New leads cols:", ["category","pinned_temperature","profile_status"].map(c=>hasCol("leads",c)?c+" OK":c+" MISSING").join(", "));
db.close();
