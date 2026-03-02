import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const SYNC_SECRET = process.env.SYNC_SECRET || "yotcrm-sync-2026";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/**
 * POST /api/sync
 * Full database sync from local Mac to Railway.
 * Body: { leads, boats, todos, pocket_listings, iso_requests }
 * Auth: x-sync-secret header
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { leads = [], boats = [], todos = [], pocket_listings = [], iso_requests = [], marinas = [],
      enrichment_profiles = [], enrichment_sources = [], score_weights = [] } = body;

    const db = getDb();
    try {
      db.pragma("foreign_keys = OFF");

      const sync = db.transaction(() => {
        // Drop and recreate tables (leads, boats, pockets, iso — NOT todos initially)
        db.exec(`
          DROP TABLE IF EXISTS boats;
          DROP TABLE IF EXISTS iso_requests;
          DROP TABLE IF EXISTS pocket_listings;
          DROP TABLE IF EXISTS leads;

          CREATE TABLE leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
            email TEXT, phone TEXT DEFAULT '', tags TEXT DEFAULT '',
            notes TEXT DEFAULT '', source TEXT DEFAULT '', status TEXT DEFAULT 'other',
            company TEXT DEFAULT '',
            occupation TEXT DEFAULT '', employer TEXT DEFAULT '',
            city TEXT DEFAULT '', state TEXT DEFAULT '', zip TEXT DEFAULT '',
            linkedin_url TEXT DEFAULT '', facebook_url TEXT DEFAULT '',
            instagram_url TEXT DEFAULT '', twitter_url TEXT DEFAULT '',
            net_worth_range TEXT DEFAULT '', net_worth_confidence TEXT DEFAULT '',
            board_positions TEXT DEFAULT '', yacht_clubs TEXT DEFAULT '',
            nonprofit_roles TEXT DEFAULT '', total_donations TEXT DEFAULT '',
            property_summary TEXT DEFAULT '', wikipedia_url TEXT DEFAULT '',
            website_url TEXT DEFAULT '', media_mentions INTEGER DEFAULT 0,
            estimated_net_worth TEXT DEFAULT '', net_worth_breakdown TEXT DEFAULT '',
            date_of_birth TEXT DEFAULT '', age TEXT DEFAULT '',
            spouse_name TEXT DEFAULT '', spouse_employer TEXT DEFAULT '',
            primary_address TEXT DEFAULT '', secondary_addresses TEXT DEFAULT '[]',
            identity_confidence INTEGER DEFAULT 0, identity_verifications TEXT DEFAULT '[]',
            manual_corrections TEXT DEFAULT '[]',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE TABLE boats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER, make TEXT DEFAULT '', model TEXT DEFAULT '',
            year TEXT DEFAULT '', length TEXT DEFAULT '', price TEXT DEFAULT '',
            location TEXT DEFAULT '', listing_url TEXT DEFAULT '',
            source_email TEXT DEFAULT '', added_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'normal',
            lead_id INTEGER,
            due_date TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            assignee TEXT DEFAULT 'will',
            updated_at TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
          CREATE INDEX IF NOT EXISTS idx_todos_lead_id ON todos(lead_id);

          CREATE TABLE pocket_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            make TEXT DEFAULT '', model TEXT DEFAULT '', year TEXT DEFAULT '',
            length TEXT DEFAULT '', price TEXT DEFAULT '', location TEXT DEFAULT '',
            description TEXT DEFAULT '', seller_name TEXT DEFAULT '',
            seller_contact TEXT DEFAULT '', status TEXT DEFAULT 'active',
            notes TEXT DEFAULT '', listing_url TEXT DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );

          CREATE TABLE iso_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_name TEXT DEFAULT '', buyer_email TEXT DEFAULT '',
            buyer_phone TEXT DEFAULT '', make TEXT DEFAULT '', model TEXT DEFAULT '',
            year_min TEXT DEFAULT '', year_max TEXT DEFAULT '',
            length_min TEXT DEFAULT '', length_max TEXT DEFAULT '',
            budget_min TEXT DEFAULT '', budget_max TEXT DEFAULT '',
            preferences TEXT DEFAULT '', status TEXT DEFAULT 'active',
            notes TEXT DEFAULT '', lead_id INTEGER,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
          );

          CREATE TABLE IF NOT EXISTS marinas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            address TEXT DEFAULT '',
            city TEXT DEFAULT '',
            state TEXT DEFAULT '',
            gate_code TEXT DEFAULT '',
            dockmaster_name TEXT DEFAULT '',
            dockmaster_phone TEXT DEFAULT '',
            office_phone TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        // Ensure updated_at column exists on older tables
        try { db.exec("ALTER TABLE todos ADD COLUMN updated_at TEXT"); } catch { /* already exists */ }

        // Insert leads
        const insertLead = db.prepare(
          `INSERT INTO leads (id, first_name, last_name, email, phone, tags, notes, source, status,
            company, occupation, employer, city, state, zip,
            linkedin_url, facebook_url, instagram_url, twitter_url,
            net_worth_range, net_worth_confidence, board_positions, yacht_clubs,
            nonprofit_roles, total_donations, property_summary, wikipedia_url, website_url, media_mentions,
            estimated_net_worth, net_worth_breakdown, date_of_birth, age,
            spouse_name, spouse_employer, primary_address, secondary_addresses,
            identity_confidence, identity_verifications, manual_corrections,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const l of leads) {
          insertLead.run(l.id, l.first_name||'', l.last_name||'', l.email||null, l.phone||'',
            l.tags||'', l.notes||'', l.source||'', l.status||'other',
            l.company||'', l.occupation||'', l.employer||'', l.city||'', l.state||'', l.zip||'',
            l.linkedin_url||'', l.facebook_url||'', l.instagram_url||'', l.twitter_url||'',
            l.net_worth_range||'', l.net_worth_confidence||'', l.board_positions||'', l.yacht_clubs||'',
            l.nonprofit_roles||'', l.total_donations||'', l.property_summary||'', l.wikipedia_url||'', l.website_url||'', l.media_mentions||0,
            l.estimated_net_worth||'', l.net_worth_breakdown||'', l.date_of_birth||'', l.age||'',
            l.spouse_name||'', l.spouse_employer||'', l.primary_address||'', l.secondary_addresses||'[]',
            l.identity_confidence||0, l.identity_verifications||'[]', l.manual_corrections||'[]',
            l.created_at||new Date().toISOString(), l.updated_at||new Date().toISOString());
        }

        // Insert boats
        const insertBoat = db.prepare(
          `INSERT INTO boats (id, lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const b of boats) {
          insertBoat.run(b.id, b.lead_id, b.make||'', b.model||'', b.year||'', b.length||'',
            b.price||'', b.location||'', b.listing_url||'', b.source_email||'',
            b.added_at||new Date().toISOString());
        }

        // ── Sync todos: delete all and re-insert from merged local state ──
        db.prepare("DELETE FROM todos").run();

        const insertTodo = db.prepare(
          `INSERT INTO todos (id, text, completed, priority, lead_id, due_date, created_at, completed_at, assignee, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const t of todos) {
          insertTodo.run(t.id, t.text||'', t.completed||0, t.priority||'normal',
            t.lead_id||null, t.due_date||null, t.created_at||new Date().toISOString(),
            t.completed_at||null, t.assignee||'will', t.updated_at||t.created_at||new Date().toISOString());
        }

        // Insert pocket listings
        const insertPocket = db.prepare(
          `INSERT INTO pocket_listings (id, make, model, year, length, price, location, description, seller_name, seller_contact, status, notes, listing_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const p of pocket_listings) {
          insertPocket.run(p.id, p.make||'', p.model||'', p.year||'', p.length||'', p.price||'',
            p.location||'', p.description||'', p.seller_name||'', p.seller_contact||'',
            p.status||'active', p.notes||'', p.listing_url||'', p.created_at||new Date().toISOString(), p.updated_at||new Date().toISOString());
        }

        // Insert ISO requests
        const insertIso = db.prepare(
          `INSERT INTO iso_requests (id, buyer_name, buyer_email, buyer_phone, make, model, year_min, year_max, length_min, length_max, budget_min, budget_max, preferences, status, notes, lead_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const i of iso_requests) {
          insertIso.run(i.id, i.buyer_name||'', i.buyer_email||'', i.buyer_phone||'',
            i.make||'', i.model||'', i.year_min||'', i.year_max||'',
            i.length_min||'', i.length_max||'', i.budget_min||'', i.budget_max||'',
            i.preferences||'', i.status||'active', i.notes||'', i.lead_id||null,
            i.created_at||new Date().toISOString(), i.updated_at||new Date().toISOString());
        }

        // Insert marinas
        db.prepare("DELETE FROM marinas").run();
        const insertMarina = db.prepare(
          `INSERT INTO marinas (id, name, address, city, state, gate_code, dockmaster_name, dockmaster_phone, office_phone, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const m of marinas) {
          insertMarina.run(m.id, m.name||'', m.address||'', m.city||'', m.state||'',
            m.gate_code||'', m.dockmaster_name||'', m.dockmaster_phone||'',
            m.office_phone||'', m.notes||'', m.created_at||new Date().toISOString(), m.updated_at||new Date().toISOString());
        }

        // ── Sync enrichment data (intel scores, sources, weights) ──
        if (enrichment_profiles.length > 0 || enrichment_sources.length > 0 || score_weights.length > 0) {
          db.exec(`
            DROP TABLE IF EXISTS enrichment_sources;
            DROP TABLE IF EXISTS enrichment_profiles;
            DROP TABLE IF EXISTS enrichment_audit_log;
            DROP TABLE IF EXISTS score_weights;

            CREATE TABLE enrichment_profiles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lead_id INTEGER UNIQUE NOT NULL,
              score INTEGER DEFAULT 0,
              score_band TEXT DEFAULT 'unverified',
              score_breakdown TEXT DEFAULT '[]',
              identity_data TEXT DEFAULT '{}',
              capital_data TEXT DEFAULT '{}',
              risk_data TEXT DEFAULT '{}',
              engagement_data TEXT DEFAULT '{}',
              identity_score INTEGER DEFAULT 0,
              capital_score INTEGER DEFAULT 0,
              risk_score INTEGER DEFAULT 0,
              digital_score INTEGER DEFAULT 0,
              engagement_score INTEGER DEFAULT 0,
              summary TEXT DEFAULT '',
              strategy_notes TEXT DEFAULT '',
              leverage_notes TEXT DEFAULT '',
              manual_override INTEGER DEFAULT 0,
              override_score INTEGER,
              override_reason TEXT DEFAULT '',
              enrichment_status TEXT DEFAULT 'pending',
              last_enriched_at TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE enrichment_sources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              profile_id INTEGER NOT NULL,
              lead_id INTEGER NOT NULL,
              source_type TEXT NOT NULL,
              source_url TEXT DEFAULT '',
              source_label TEXT DEFAULT '',
              layer TEXT NOT NULL,
              data_key TEXT NOT NULL,
              data_value TEXT DEFAULT '',
              confidence INTEGER DEFAULT 50,
              fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE enrichment_audit_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lead_id INTEGER NOT NULL,
              action TEXT NOT NULL,
              actor TEXT DEFAULT 'system',
              detail TEXT DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE score_weights (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              factor TEXT NOT NULL,
              label TEXT NOT NULL,
              points INTEGER NOT NULL,
              category TEXT NOT NULL,
              active INTEGER DEFAULT 1
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_score_weights_factor ON score_weights(factor);
          `);

          const insertProfile = db.prepare(
            `INSERT INTO enrichment_profiles (id, lead_id, score, score_band, score_breakdown, identity_data, capital_data, risk_data, engagement_data, identity_score, capital_score, risk_score, digital_score, engagement_score, summary, strategy_notes, leverage_notes, manual_override, override_score, override_reason, enrichment_status, last_enriched_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const p of enrichment_profiles) {
            insertProfile.run(p.id, p.lead_id, p.score||0, p.score_band||'unverified',
              p.score_breakdown||'[]', p.identity_data||'{}', p.capital_data||'{}', p.risk_data||'{}', p.engagement_data||'{}',
              p.identity_score||0, p.capital_score||0, p.risk_score||0, p.digital_score||0, p.engagement_score||0,
              p.summary||'', p.strategy_notes||'', p.leverage_notes||'', p.manual_override||0, p.override_score||null, p.override_reason||'',
              p.enrichment_status||'complete', p.last_enriched_at||null,
              p.created_at||new Date().toISOString(), p.updated_at||new Date().toISOString());
          }

          const insertSource = db.prepare(
            `INSERT INTO enrichment_sources (id, profile_id, lead_id, source_type, source_url, source_label, layer, data_key, data_value, confidence, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const s of enrichment_sources) {
            insertSource.run(s.id, s.profile_id||0, s.lead_id, s.source_type||'', s.source_url||'', s.source_label||'',
              s.layer||'identity', s.data_key||'', s.data_value||'', s.confidence||50, s.fetched_at||new Date().toISOString());
          }

          if (score_weights.length > 0) {
            const insertWeight = db.prepare(
              "INSERT INTO score_weights (id, factor, label, points, category, active) VALUES (?, ?, ?, ?, ?, ?)"
            );
            for (const w of score_weights) {
              insertWeight.run(w.id, w.factor, w.label||'', w.points||0, w.category||'identity', w.active ?? 1);
            }
          }
        }
      });

      sync();
      db.pragma("foreign_keys = ON");

      const counts = { leads: leads.length, boats: boats.length, todos: todos.length,
        pocket_listings: pocket_listings.length, iso_requests: iso_requests.length, marinas: marinas.length,
        enrichment_profiles: enrichment_profiles.length, enrichment_sources: enrichment_sources.length };
      console.log("[SYNC] Database synced:", counts);
      return NextResponse.json({ ok: true, synced: counts });
    } finally { db.close(); }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SYNC ERROR]", message);
    return NextResponse.json({ error: "Sync failed", detail: message }, { status: 500 });
  }
}

/** GET /api/sync — returns current Railway state for bidirectional merge */
export async function GET(req: Request) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  try {
    const leads = db.prepare("SELECT COUNT(*) as count FROM leads").get() as any;
    const boats = db.prepare("SELECT COUNT(*) as count FROM boats").get() as any;
    let todos: any[] = [];
    try { todos = db.prepare("SELECT * FROM todos").all(); } catch { /* table may not exist */ }
    return NextResponse.json({ ok: true, counts: { leads: leads.count, boats: boats.count }, todos });
  } finally { db.close(); }
}
