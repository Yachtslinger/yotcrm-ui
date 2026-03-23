#!/usr/bin/env node
/**
 * Pull ALL data from Railway into local SQLite.
 * Railway is source-of-truth for web-uploaded data (contacts, ISOs, etc).
 * Uses dynamic column upsert so no columns are ever dropped.
 * 
 * Tables synced: leads, boats, todos, pocket_listings, iso_requests, marinas, listings
 */
const Database = require('/Users/willnoftsinger/yotcrm-deploy/node_modules/better-sqlite3');

const LOCAL_DB = process.env.LOCAL_DB_PATH
  || '/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db';
const RAILWAY_URL = 'https://yotcrm-production.up.railway.app/api/sync/pull';
const SYNC_SECRET = process.env.SYNC_SECRET || 'yotcrm-sync-2026';

/**
 * Dynamically upsert rows into a table, handling any columns present in the data.
 * Creates missing columns on the fly so nothing is ever lost.
 */
function upsertRows(db, table, rows) {
  if (!rows || rows.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0, updated = 0;

  // Get existing columns in local table
  const existingCols = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  );

  // Find all columns across all rows from Railway
  const allCols = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) allCols.add(key);
  }

  // Add any missing columns to local table
  for (const col of allCols) {
    if (!existingCols.has(col) && col !== 'id') {
      try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT DEFAULT ''`).run();
      } catch (e) {
        // Column might already exist (race), ignore
      }
    }
  }

  // Build dynamic upsert for each row
  for (const row of rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => row[c] ?? '');

    // Check if row exists by ID
    const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(row.id);

    if (existing) {
      // UPDATE — set all columns except id
      const setClauses = cols.filter(c => c !== 'id').map(c => `${c} = ?`).join(', ');
      const updateValues = cols.filter(c => c !== 'id').map(c => row[c] ?? '');
      db.prepare(`UPDATE ${table} SET ${setClauses} WHERE id = ?`).run(...updateValues, row.id);
      updated++;
    } else {
      // INSERT — OR IGNORE to avoid stomping local data on email UNIQUE conflicts
      // (two leads can share an email; local data is authoritative for existing rows)
      try {
        db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
        inserted++;
      } catch (e) {
        console.warn(`[PULL] Skipped ${table} row id=${row.id}: ${e.message}`);
      }
    }
  }

  return { inserted, updated };
}

async function pull() {
  console.log('[PULL] Fetching all data from Railway…');

  const res = await fetch(RAILWAY_URL, {
    headers: { 'x-sync-secret': SYNC_SECRET },
  });
  if (!res.ok) {
    throw new Error(`Railway responded ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Pull failed');

  const db = new Database(LOCAL_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  // Tables to sync — order matters (leads before boats due to foreign keys)
  const tables = [
    { name: 'leads', rows: data.leads || [] },
    { name: 'boats', rows: data.boats || [] },
    { name: 'todos', rows: data.todos || [] },
    { name: 'pocket_listings', rows: data.pocket_listings || [] },
    { name: 'iso_requests', rows: data.iso_requests || [] },
    { name: 'marinas', rows: data.marinas || [] },
    { name: 'my_listings', rows: data.my_listings || [] },
    // Match engine tables — preserve across Railway deploys
    { name: 'email_batches', rows: data.email_batches || [] },
    { name: 'parsed_listings', rows: data.parsed_listings || [] },
    { name: 'listing_matches', rows: data.listing_matches || [] },
  ];

  const results = {};
  const syncAll = db.transaction(() => {
    // Bootstrap match tables locally if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT DEFAULT 'boatwizard',
        subject TEXT DEFAULT '', sender TEXT DEFAULT '', content_hash TEXT UNIQUE,
        raw_content TEXT DEFAULT '', listing_count INTEGER DEFAULT 0,
        match_count INTEGER DEFAULT 0, status TEXT DEFAULT 'processed',
        error_log TEXT DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS parsed_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL,
        make TEXT DEFAULT '', model TEXT DEFAULT '', year TEXT DEFAULT '',
        loa TEXT DEFAULT '', asking_price TEXT DEFAULT '', location TEXT DEFAULT '',
        vessel_type TEXT DEFAULT '', features TEXT DEFAULT '',
        listing_url TEXT DEFAULT '', broker_notes TEXT DEFAULT '',
        raw_text TEXT DEFAULT '', content_hash TEXT, section TEXT DEFAULT '',
        brokerage TEXT DEFAULT '', listed_at TEXT DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS listing_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL,
        lead_id INTEGER, iso_id INTEGER, batch_id INTEGER NOT NULL,
        match_score INTEGER DEFAULT 0, confidence TEXT DEFAULT 'low',
        reasons TEXT DEFAULT '[]', conflicts TEXT DEFAULT '[]',
        penalty_log TEXT DEFAULT '[]', positive_hits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'new', notes TEXT DEFAULT '',
        contacted_at TEXT, created_at TEXT NOT NULL
      );
    `);
    for (const { name, rows } of tables) {
      if (rows.length === 0) continue;
      results[name] = upsertRows(db, name, rows);
    }
  });

  syncAll();
  db.close();

  // Summary
  const summary = Object.entries(results)
    .filter(([, v]) => v.inserted > 0 || v.updated > 0)
    .map(([k, v]) => `${k}: +${v.inserted} new, ${v.updated} updated`)
    .join(', ');

  console.log(`[PULL] ✅ ${summary || 'No changes'}`);
  return results;
}

pull().catch(err => {
  console.error('[PULL] ❌', err.message);
  process.exit(1);
});
