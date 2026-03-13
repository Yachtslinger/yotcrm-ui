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
      // INSERT — handle unique constraint conflicts (e.g. email) by replacing
      try {
        db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
        inserted++;
      } catch (e) {
        // Skip rows that still fail (shouldn't happen with OR REPLACE, but be safe)
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
  ];

  const results = {};
  const syncAll = db.transaction(() => {
    for (const { name, rows } of tables) {
      if (rows.length === 0) continue;
      // Ensure table exists (basic schema — columns added dynamically)
      try {
        db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).get();
      } catch {
        // Table doesn't exist locally — skip (syncToRailway will create it)
        console.log(`[PULL] Table ${name} doesn't exist locally, skipping`);
        continue;
      }
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
