#!/usr/bin/env node
/**
 * Pull leads+boats from Railway into local SQLite.
 * Railway is source-of-truth for email-ingested leads.
 * Merge strategy: INSERT OR REPLACE by email for leads,
 *   add any boats not already locally present.
 */
const Database = require('/Users/willnoftsinger/yotcrm-deploy/node_modules/better-sqlite3');

const LOCAL_DB = process.env.LOCAL_DB_PATH
  || '/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db';
const RAILWAY_URL = 'https://yotcrm-production.up.railway.app/api/sync/pull';
const SYNC_SECRET = process.env.SYNC_SECRET || 'yotcrm-sync-2026';

async function pull() {
  console.log('[PULL] Fetching leads + boats from Railway…');

  const res = await fetch(RAILWAY_URL, {
    headers: { 'x-sync-secret': SYNC_SECRET },
  });
  if (!res.ok) {
    throw new Error(`Railway responded ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Pull failed');

  const { leads, boats } = data;
  console.log(`[PULL] Got ${leads.length} leads, ${boats.length} boats from Railway`);

  const db = new Database(LOCAL_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
      email TEXT UNIQUE, phone TEXT DEFAULT '', tags TEXT DEFAULT '',
      notes TEXT DEFAULT '', source TEXT DEFAULT '', status TEXT DEFAULT 'new',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE TABLE IF NOT EXISTS boats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER, make TEXT DEFAULT '', model TEXT DEFAULT '',
      year TEXT DEFAULT '', length TEXT DEFAULT '', price TEXT DEFAULT '',
      location TEXT DEFAULT '', listing_url TEXT DEFAULT '',
      source_email TEXT DEFAULT '', added_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );
  `);

  const upsertLead = db.prepare(`
    INSERT INTO leads (id, first_name, last_name, email, phone, tags, notes, source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      first_name=excluded.first_name, last_name=excluded.last_name,
      email=excluded.email, phone=excluded.phone, tags=excluded.tags,
      notes=excluded.notes, source=excluded.source, status=excluded.status,
      updated_at=excluded.updated_at
  `);

  const upsertBoat = db.prepare(`
    INSERT INTO boats (id, lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      lead_id=excluded.lead_id, make=excluded.make, model=excluded.model,
      year=excluded.year, length=excluded.length, price=excluded.price,
      location=excluded.location, listing_url=excluded.listing_url,
      source_email=excluded.source_email, added_at=excluded.added_at
  `);

  const merge = db.transaction(() => {
    let newLeads = 0, updatedLeads = 0, newBoats = 0;

    for (const l of leads) {
      const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(l.id);
      upsertLead.run(l.id, l.first_name||'', l.last_name||'', l.email||null,
        l.phone||'', l.tags||'', l.notes||'', l.source||'', l.status||'new',
        l.created_at||new Date().toISOString(), l.updated_at||new Date().toISOString());
      if (existing) updatedLeads++; else newLeads++;
    }

    for (const b of boats) {
      const existing = db.prepare('SELECT id FROM boats WHERE id = ?').get(b.id);
      upsertBoat.run(b.id, b.lead_id, b.make||'', b.model||'', b.year||'',
        b.length||'', b.price||'', b.location||'', b.listing_url||'',
        b.source_email||'', b.added_at||new Date().toISOString());
      if (!existing) newBoats++;
    }

    return { newLeads, updatedLeads, newBoats };
  });

  const result = merge();
  db.close();

  console.log(`[PULL] ✅ ${result.newLeads} new leads, ${result.updatedLeads} updated, ${result.newBoats} new boats`);
  return result;
}

pull().catch(err => {
  console.error('[PULL] ❌', err.message);
  process.exit(1);
});
