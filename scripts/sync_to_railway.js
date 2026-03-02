#!/usr/bin/env node
/**
 * sync_to_railway.js — Bidirectional sync: push local to Railway, pull Railway todos back
 * Called by the watcher after each lead parse.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'Data', 'yotcrm.db');
const RAILWAY_URL = 'https://yotcrm-production.up.railway.app/api/sync';
const SYNC_SECRET = 'yotcrm-sync-2026';

async function sync() {
    const db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');

    try {
        const leads = db.prepare('SELECT * FROM leads').all();
        const boats = db.prepare('SELECT * FROM boats').all();

        let todos = [];
        try { todos = db.prepare('SELECT * FROM todos').all(); } catch(e) {}
        let pocket_listings = [];
        try { pocket_listings = db.prepare('SELECT * FROM pocket_listings').all(); } catch(e) {}
        let iso_requests = [];
        try { iso_requests = db.prepare('SELECT * FROM iso_requests').all(); } catch(e) {}

        const payload = { leads, boats, todos, pocket_listings, iso_requests };

        // Add enrichment data
        let enrichment_profiles = []; try { enrichment_profiles = db.prepare('SELECT * FROM enrichment_profiles').all(); } catch {}
        let enrichment_sources = []; try { enrichment_sources = db.prepare('SELECT * FROM enrichment_sources').all(); } catch {}
        let score_weights = []; try { score_weights = db.prepare('SELECT * FROM score_weights').all(); } catch {}
        payload.enrichment_profiles = enrichment_profiles;
        payload.enrichment_sources = enrichment_sources;
        payload.score_weights = score_weights;

        const res = await fetch(RAILWAY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sync-secret': SYNC_SECRET,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Sync failed (${res.status}): ${text}`);
        }

        const result = await res.json();

        // ── Pull Railway-only todos back to local DB ──
        const railwayTodos = result.railway_todos || [];
        if (railwayTodos.length > 0) {
            const localIds = new Set(todos.map(t => t.id));
            const insert = db.prepare(
                `INSERT OR IGNORE INTO todos (id, text, completed, priority, lead_id, due_date, created_at, completed_at, assignee)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            let pulled = 0;
            for (const t of railwayTodos) {
                if (!localIds.has(t.id)) {
                    insert.run(t.id, t.text||'', t.completed||0, t.priority||'normal',
                        t.lead_id||null, t.due_date||null, t.created_at||new Date().toISOString(),
                        t.completed_at||null, t.assignee||'will');
                    pulled++;
                }
            }
            if (pulled > 0) {
                console.log(`📲 Pulled ${pulled} Railway todo(s) to local`);
            }
        }

        console.log(`✅ Synced to Railway: ${leads.length} leads, ${boats.length} boats, ${todos.length} todos`);
        return result;
    } finally {
        db.close();
    }
}

sync().catch(err => {
    console.error(`❌ Sync error: ${err.message}`);
    process.exit(1);
});
