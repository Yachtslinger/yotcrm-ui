#!/usr/bin/env node
/**
 * Sync local YotCRM data TO Railway — includes enrichment data.
 */
const Database = require('/Users/willnoftsinger/yotcrm-deploy/node_modules/better-sqlite3');
const LOCAL_DB = '/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db';
const RAILWAY_URL = 'https://yotcrm-production.up.railway.app/api/sync';
const SYNC_SECRET = 'yotcrm-sync-2026';

async function sync() {
  const db = new Database(LOCAL_DB, { readonly: true });
  const leads = db.prepare('SELECT * FROM leads').all();
  const boats = db.prepare('SELECT * FROM boats').all();
  let todos = []; try { todos = db.prepare('SELECT * FROM todos').all(); } catch {}
  let pocket_listings = []; try { pocket_listings = db.prepare('SELECT * FROM pocket_listings').all(); } catch {}
  let iso_requests = []; try { iso_requests = db.prepare('SELECT * FROM iso_requests').all(); } catch {}
  let marinas = []; try { marinas = db.prepare('SELECT * FROM marinas').all(); } catch {}
  // Enrichment data
  let enrichment_profiles = []; try { enrichment_profiles = db.prepare('SELECT * FROM enrichment_profiles').all(); } catch {}
  let enrichment_sources = []; try { enrichment_sources = db.prepare('SELECT * FROM enrichment_sources').all(); } catch {}
  let score_weights = []; try { score_weights = db.prepare('SELECT * FROM score_weights').all(); } catch {}
  db.close();

  console.log(`Syncing: ${leads.length} leads, ${boats.length} boats, ${enrichment_profiles.length} profiles, ${score_weights.length} weights`);

  const res = await fetch(RAILWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': SYNC_SECRET },
    body: JSON.stringify({ leads, boats, todos, pocket_listings, iso_requests, marinas, enrichment_profiles, enrichment_sources, score_weights }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Sync failed (${res.status}): ${t}`); }
  const result = await res.json();
  console.log('✅ Synced:', JSON.stringify(result.synced || result));
}

sync().catch(e => { console.error('❌', e.message); process.exit(1); });
