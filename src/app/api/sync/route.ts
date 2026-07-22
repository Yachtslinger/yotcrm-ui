import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
export const maxDuration = 120;

// Allow up to 10MB sync payloads (leads table alone can be ~2MB with 3000+ leads)
export const fetchCache = "force-no-store";


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
      listings = [], enrichment_profiles = [], enrichment_sources = [], score_weights = [],
      vessel_owners = [], buyer_searches = [],
      email_batches = [], parsed_listings = [], listing_matches = [] } = body;

    const db = getDb();
    try {
      db.pragma("foreign_keys = OFF");

      const sync = db.transaction(() => {
        // ── Leads: CREATE IF NOT EXISTS + upsert (preserve Railway-side mutable fields) ──
        // Never drop leads — that wipes status, notes, dismissed_listing_ids, last_contacted_at
        db.exec(`
          CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
            email TEXT, phone TEXT DEFAULT '', tags TEXT DEFAULT '',
            notes TEXT DEFAULT '', source TEXT DEFAULT '', status TEXT DEFAULT 'new',
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
            court_records TEXT DEFAULT '', professional_history TEXT DEFAULT '',
            relatives TEXT DEFAULT '', additional_properties TEXT DEFAULT '',
            reverify_status TEXT DEFAULT '', broker_notes TEXT DEFAULT '',
            dismissed_listing_ids TEXT DEFAULT '[]',
            last_contacted_at TEXT DEFAULT '',
            budget_min TEXT DEFAULT '', budget_max TEXT DEFAULT '',
            loa_min TEXT DEFAULT '', loa_max TEXT DEFAULT '',
            year_min TEXT DEFAULT '', year_max TEXT DEFAULT '',
            make_preference TEXT DEFAULT '', preferred_location TEXT DEFAULT '',
            vessel_type_pref TEXT DEFAULT '', flybridge_pref TEXT DEFAULT '',
            stabilizers_pref TEXT DEFAULT '', min_cabins TEXT DEFAULT '',
            engine_type_pref TEXT DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )
        `);
        // Safe migrations for new columns on existing Railway DB
        try { db.exec("ALTER TABLE leads ADD COLUMN broker_notes TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN dismissed_listing_ids TEXT DEFAULT '[]'"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN last_contacted_at TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN budget_min TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN budget_max TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN loa_min TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN loa_max TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN year_min TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN year_max TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN make_preference TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN preferred_location TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN vessel_type_pref TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN flybridge_pref TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN stabilizers_pref TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN min_cabins TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN engine_type_pref TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN category TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN pinned_temperature TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN profile_status TEXT DEFAULT 'none'"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN profile_confidence_json TEXT DEFAULT '{}'"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN profile_source_ref TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN suggested_category TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN prospect_score REAL"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN suggest_reason TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN dossier TEXT"); } catch {}
        try { db.exec("ALTER TABLE leads ADD COLUMN sorted_at TEXT"); } catch {}

        // Upsert leads: insert new ones, update non-mutable fields on existing ones.
        // NEVER overwrite: status, notes, dismissed_listing_ids, last_contacted_at, broker_notes
        // (those are set on Railway by broker actions and must be preserved)
        const upsertLead = db.prepare(`
          INSERT INTO leads (id, first_name, last_name, email, phone, tags, notes, source, status,
            company, occupation, employer, city, state, zip,
            linkedin_url, facebook_url, instagram_url, twitter_url,
            net_worth_range, net_worth_confidence, board_positions, yacht_clubs,
            nonprofit_roles, total_donations, property_summary, wikipedia_url, website_url, media_mentions,
            estimated_net_worth, net_worth_breakdown, date_of_birth, age,
            spouse_name, spouse_employer, primary_address, secondary_addresses,
            identity_confidence, identity_verifications, manual_corrections,
            court_records, professional_history, relatives, additional_properties, reverify_status,
            broker_notes, dismissed_listing_ids, last_contacted_at,
            budget_min, budget_max, loa_min, loa_max, year_min, year_max, make_preference, vessel_type_pref,
            category, pinned_temperature, profile_status, profile_confidence_json, profile_source_ref,
            suggested_category, prospect_score, suggest_reason, dossier, sorted_at,
            created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            first_name=excluded.first_name, last_name=excluded.last_name,
            email=excluded.email, phone=excluded.phone, tags=excluded.tags,
            source=excluded.source,
            company=excluded.company, occupation=excluded.occupation, employer=excluded.employer,
            city=excluded.city, state=excluded.state, zip=excluded.zip,
            linkedin_url=excluded.linkedin_url, facebook_url=excluded.facebook_url,
            instagram_url=excluded.instagram_url, twitter_url=excluded.twitter_url,
            net_worth_range=excluded.net_worth_range, net_worth_confidence=excluded.net_worth_confidence,
            board_positions=excluded.board_positions, yacht_clubs=excluded.yacht_clubs,
            nonprofit_roles=excluded.nonprofit_roles, total_donations=excluded.total_donations,
            property_summary=excluded.property_summary, wikipedia_url=excluded.wikipedia_url,
            website_url=excluded.website_url, media_mentions=excluded.media_mentions,
            estimated_net_worth=excluded.estimated_net_worth, net_worth_breakdown=excluded.net_worth_breakdown,
            date_of_birth=excluded.date_of_birth, age=excluded.age,
            spouse_name=excluded.spouse_name, spouse_employer=excluded.spouse_employer,
            primary_address=excluded.primary_address, secondary_addresses=excluded.secondary_addresses,
            identity_confidence=excluded.identity_confidence,
            identity_verifications=excluded.identity_verifications,
            manual_corrections=excluded.manual_corrections,
            court_records=excluded.court_records, professional_history=excluded.professional_history,
            relatives=excluded.relatives, additional_properties=excluded.additional_properties,
            reverify_status=excluded.reverify_status,
            budget_min=excluded.budget_min, budget_max=excluded.budget_max,
            loa_min=excluded.loa_min, loa_max=excluded.loa_max,
            year_min=excluded.year_min, year_max=excluded.year_max,
            make_preference=excluded.make_preference, vessel_type_pref=excluded.vessel_type_pref,
            category=COALESCE(excluded.category, category),
            pinned_temperature=COALESCE(excluded.pinned_temperature, pinned_temperature),
            profile_status=CASE WHEN excluded.profile_status IS NOT NULL AND excluded.profile_status != 'none'
              THEN excluded.profile_status ELSE profile_status END,
            profile_confidence_json=excluded.profile_confidence_json,
            profile_source_ref=COALESCE(excluded.profile_source_ref, profile_source_ref),
            suggested_category=COALESCE(excluded.suggested_category, suggested_category),
            prospect_score=COALESCE(excluded.prospect_score, prospect_score),
            suggest_reason=COALESCE(excluded.suggest_reason, suggest_reason),
            dossier=COALESCE(excluded.dossier, dossier),
            sorted_at=COALESCE(excluded.sorted_at, sorted_at),
            last_contacted_at=CASE WHEN excluded.last_contacted_at > COALESCE(leads.last_contacted_at,'')
              THEN excluded.last_contacted_at ELSE leads.last_contacted_at END,
            updated_at=excluded.updated_at
            -- NOT updating: notes, status, broker_notes, dismissed_listing_ids, last_contacted_at
        `);
        for (const l of leads) {
          upsertLead.run(
            l.id, l.first_name||'', l.last_name||'', l.email||null, l.phone||'',
            l.tags||'', l.notes||'', l.source||'', l.status||'new',
            l.company||'', l.occupation||'', l.employer||'', l.city||'', l.state||'', l.zip||'',
            l.linkedin_url||'', l.facebook_url||'', l.instagram_url||'', l.twitter_url||'',
            l.net_worth_range||'', l.net_worth_confidence||'', l.board_positions||'', l.yacht_clubs||'',
            l.nonprofit_roles||'', l.total_donations||'', l.property_summary||'', l.wikipedia_url||'', l.website_url||'', l.media_mentions||0,
            l.estimated_net_worth||'', l.net_worth_breakdown||'', l.date_of_birth||'', l.age||'',
            l.spouse_name||'', l.spouse_employer||'', l.primary_address||'', l.secondary_addresses||'[]',
            l.identity_confidence||0, l.identity_verifications||'[]', l.manual_corrections||'[]',
            l.court_records||'', l.professional_history||'', l.relatives||'', l.additional_properties||'', l.reverify_status||'',
            l.broker_notes||'', l.dismissed_listing_ids||'[]', l.last_contacted_at||'',
            l.budget_min ?? null, l.budget_max ?? null, l.loa_min ?? null, l.loa_max ?? null,
            l.year_min ?? null, l.year_max ?? null, l.make_preference ?? null, l.vessel_type_pref ?? null,
            l.category ?? null, l.pinned_temperature ?? null, l.profile_status || 'none',
            l.profile_confidence_json || '{}', l.profile_source_ref ?? null,
            l.suggested_category ?? null, l.prospect_score ?? null, l.suggest_reason ?? null, l.dossier ?? null, l.sorted_at ?? null,
            l.created_at||new Date().toISOString(), l.updated_at||new Date().toISOString()
          );
        }

        // ── Boats: drop/recreate (no mutable fields, keyed to leads) ──
        // Guarded: absent/empty boats in a partial (chunked) sync must NOT wipe the table
        if (boats.length > 0) {
        db.exec(`
          DROP TABLE IF EXISTS boats;
          CREATE TABLE boats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER, make TEXT DEFAULT '', model TEXT DEFAULT '',
            year TEXT DEFAULT '', length TEXT DEFAULT '', price TEXT DEFAULT '',
            location TEXT DEFAULT '', listing_url TEXT DEFAULT '',
            source_email TEXT DEFAULT '', added_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
          )
        `);
        const insertBoat = db.prepare(
          `INSERT INTO boats (id, lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const b of boats) {
          insertBoat.run(b.id, b.lead_id, b.make||'', b.model||'', b.year||'',
            b.length||'', b.price||'', b.location||'', b.listing_url||'',
            b.source_email||'', b.added_at||new Date().toISOString());
        }
        } // end boats guard

        // ── Todos: merge — add new, preserve Railway-side completions ──
        // Ensure todos table + new columns exist
        db.exec(`
          CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,
            completed INTEGER DEFAULT 0, priority TEXT DEFAULT 'normal',
            lead_id INTEGER, due_date TEXT, created_at TEXT NOT NULL,
            completed_at TEXT, assignee TEXT DEFAULT 'will', updated_at TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
          );
          CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
          CREATE INDEX IF NOT EXISTS idx_todos_lead_id ON todos(lead_id);
        `);
        try { db.exec("ALTER TABLE todos ADD COLUMN updated_at TEXT"); } catch {}
        try { db.exec("ALTER TABLE todos ADD COLUMN email_draft TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE todos ADD COLUMN todo_type TEXT DEFAULT 'manual'"); } catch {}
        try { db.exec("ALTER TABLE todos ADD COLUMN queue TEXT DEFAULT 'human'"); } catch {}
        try { db.exec("ALTER TABLE todos ADD COLUMN listing_id INTEGER"); } catch {}

        // Remove the old one-time migration comment — engine is stable now

        // Upsert todos from local: ONLY non-match todos.
        // Match todos are Railway-side state regenerated by reruns — syncing them overwrites
        // Railway's live queue with stale local data, causing duplicates.
        const nonMatchTodos = todos.filter((t: any) => !t.todo_type || t.todo_type !== 'match');
        const upsertTodo = db.prepare(`
          INSERT INTO todos (id, text, completed, priority, lead_id, listing_id, due_date,
            created_at, completed_at, assignee, updated_at, email_draft, todo_type, queue)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            text=excluded.text, priority=excluded.priority,
            lead_id=excluded.lead_id, due_date=excluded.due_date,
            assignee=excluded.assignee, email_draft=excluded.email_draft,
            todo_type=excluded.todo_type, queue=excluded.queue,
            updated_at=excluded.updated_at
        `);
        for (const t of nonMatchTodos) {
          upsertTodo.run(
            t.id, t.text||'', t.completed||0, t.priority||'normal',
            t.lead_id||null, t.listing_id||null, t.due_date||null,
            t.created_at||new Date().toISOString(), t.completed_at||null,
            t.assignee||'will', t.updated_at||t.created_at||new Date().toISOString(),
            t.email_draft||'', t.todo_type||'manual', t.queue||'human'
          );
        }

        // Insert pocket listings
        db.prepare("DELETE FROM pocket_listings").run();
        const insertPocket = db.prepare(
          `INSERT INTO pocket_listings (id, make, model, year, length, price, location, description, seller_name, seller_contact, status, notes, listing_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const p of pocket_listings) {
          insertPocket.run(p.id, p.make||'', p.model||'', p.year||'', p.length||'', p.price||'',
            p.location||'', p.description||'', p.seller_name||'', p.seller_contact||'',
            p.status||'active', p.notes||'', p.listing_url||'',
            p.created_at||new Date().toISOString(), p.updated_at||new Date().toISOString());
        }

        // Insert ISO requests
        db.prepare("DELETE FROM iso_requests").run();
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

        // Marinas
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

        // Insert my_listings (broker's active yacht listings)
        if (listings.length > 0) {
          db.exec(`CREATE TABLE IF NOT EXISTS my_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '', make TEXT DEFAULT '', model TEXT DEFAULT '',
            year TEXT DEFAULT '', length TEXT DEFAULT '', price TEXT DEFAULT '',
            location TEXT DEFAULT '', status TEXT DEFAULT 'active',
            description TEXT DEFAULT '', highlights TEXT DEFAULT '',
            listing_urls TEXT DEFAULT '[]', pdf_urls TEXT DEFAULT '[]',
            hero_image TEXT DEFAULT '', notes TEXT DEFAULT '', broker TEXT DEFAULT 'Will',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )`);
          db.prepare("DELETE FROM my_listings").run();
          const insertListing = db.prepare(
            `INSERT INTO my_listings (id, name, make, model, year, length, price, location, status, description, highlights, listing_urls, pdf_urls, hero_image, notes, broker, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const l of listings) {
            insertListing.run(l.id, l.name||'', l.make||'', l.model||'', l.year||'', l.length||'', l.price||'', l.location||'',
              l.status||'active', l.description||'', l.highlights||'', l.listing_urls||'[]', l.pdf_urls||'[]',
              l.hero_image||'', l.notes||'', l.broker||'Will', l.created_at||new Date().toISOString(), l.updated_at||new Date().toISOString());
          }
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

      // ── Ensure match/market tables exist (idempotent, never wiped) ──
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT DEFAULT 'boatwizard', subject TEXT DEFAULT '', sender TEXT DEFAULT '', content_hash TEXT UNIQUE, raw_content TEXT DEFAULT '', listing_count INTEGER DEFAULT 0, match_count INTEGER DEFAULT 0, status TEXT DEFAULT 'processed', error_log TEXT DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS parsed_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, make TEXT DEFAULT '', model TEXT DEFAULT '', year TEXT DEFAULT '', loa TEXT DEFAULT '', asking_price TEXT DEFAULT '', location TEXT DEFAULT '', vessel_type TEXT DEFAULT '', features TEXT DEFAULT '', listing_url TEXT DEFAULT '', broker_notes TEXT DEFAULT '', raw_text TEXT DEFAULT '', content_hash TEXT, section TEXT DEFAULT '', brokerage TEXT DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY (batch_id) REFERENCES email_batches(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS listing_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, lead_id INTEGER, iso_id INTEGER, batch_id INTEGER NOT NULL, match_score INTEGER DEFAULT 0, confidence TEXT DEFAULT 'low', reasons TEXT DEFAULT '[]', conflicts TEXT DEFAULT '[]', status TEXT DEFAULT 'new', notes TEXT DEFAULT '', contacted_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY (listing_id) REFERENCES parsed_listings(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS match_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER, lead_id INTEGER, type TEXT DEFAULT 'listing_match', title TEXT DEFAULT '', summary TEXT DEFAULT '', read INTEGER DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS vessel_owners (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_name TEXT DEFAULT '', owner_email TEXT DEFAULT '', owner_phone TEXT DEFAULT '', make TEXT DEFAULT '', model TEXT DEFAULT '', year TEXT DEFAULT '', length TEXT DEFAULT '', estimated_value TEXT DEFAULT '', location TEXT DEFAULT '', vessel_name TEXT DEFAULT '', how_known TEXT DEFAULT '', description TEXT DEFAULT '', status TEXT DEFAULT 'active', notes TEXT DEFAULT '', lead_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS buyer_searches (id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_name TEXT DEFAULT '', buyer_email TEXT DEFAULT '', buyer_phone TEXT DEFAULT '', make TEXT DEFAULT '', model TEXT DEFAULT '', year_min TEXT DEFAULT '', year_max TEXT DEFAULT '', length_min TEXT DEFAULT '', length_max TEXT DEFAULT '', budget_min TEXT DEFAULT '', budget_max TEXT DEFAULT '', preferred_location TEXT DEFAULT '', description TEXT DEFAULT '', status TEXT DEFAULT 'active', notes TEXT DEFAULT '', lead_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS vessel_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, iso_id INTEGER NOT NULL, match_score INTEGER DEFAULT 0, match_reasons TEXT DEFAULT '', status TEXT DEFAULT 'new', notes TEXT DEFAULT '', created_at TEXT NOT NULL, FOREIGN KEY (owner_id) REFERENCES vessel_owners(id) ON DELETE CASCADE, FOREIGN KEY (iso_id) REFERENCES buyer_searches(id) ON DELETE CASCADE, UNIQUE(owner_id, iso_id));
      `);

      // ── Restore match engine tables (email_batches, parsed_listings, listing_matches) ──
      // These are ephemeral on Railway — sync preserves them across deploys
      if (email_batches.length > 0) {
        const upsertBatch = db.prepare(`
          INSERT INTO email_batches (id, source, subject, sender, content_hash, raw_content,
            listing_count, match_count, status, error_log, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            listing_count=excluded.listing_count, match_count=excluded.match_count,
            status=excluded.status
        `);
        for (const b of email_batches) {
          upsertBatch.run(b.id, b.source||'', b.subject||'', b.sender||'',
            b.content_hash||'', b.raw_content||'',
            b.listing_count||0, b.match_count||0,
            b.status||'processed', b.error_log||'',
            b.created_at||new Date().toISOString());
        }
      }
      if (parsed_listings.length > 0) {
        // Add Phase-1 columns if missing
        try { db.exec("ALTER TABLE parsed_listings ADD COLUMN listed_at TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE parsed_listings ADD COLUMN days_on_market INTEGER DEFAULT 0"); } catch {}
        try { db.exec("ALTER TABLE parsed_listings ADD COLUMN denison_url TEXT DEFAULT ''"); } catch {}
        const upsertListing = db.prepare(`
          INSERT INTO parsed_listings (id, batch_id, make, model, year, loa, asking_price,
            location, vessel_type, features, listing_url, broker_notes, raw_text,
            content_hash, section, brokerage, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO NOTHING
        `);
        for (const l of parsed_listings) {
          upsertListing.run(l.id, l.batch_id, l.make||'', l.model||'', l.year||'',
            l.loa||'', l.asking_price||'', l.location||'', l.vessel_type||'',
            l.features||'', l.listing_url||'', l.broker_notes||'', l.raw_text||'',
            l.content_hash||'', l.section||'', l.brokerage||'',
            l.created_at||new Date().toISOString());
        }
      }
      if (listing_matches.length > 0) {
        // Add Phase-1 columns if missing
        try { db.exec("ALTER TABLE listing_matches ADD COLUMN penalty_log TEXT DEFAULT '[]'"); } catch {}
        try { db.exec("ALTER TABLE listing_matches ADD COLUMN positive_hits INTEGER DEFAULT 0"); } catch {}
        const upsertMatch = db.prepare(`
          INSERT INTO listing_matches (id, listing_id, lead_id, iso_id, batch_id,
            match_score, confidence, reasons, conflicts, status, notes, contacted_at, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            status=CASE WHEN excluded.status='dismissed' THEN 'dismissed' ELSE listing_matches.status END,
            contacted_at=COALESCE(excluded.contacted_at, listing_matches.contacted_at)
        `);
        for (const m of listing_matches) {
          upsertMatch.run(m.id, m.listing_id, m.lead_id||null, m.iso_id||null,
            m.batch_id, m.match_score||0, m.confidence||'low',
            m.reasons||'[]', m.conflicts||'[]',
            m.status||'new', m.notes||'', m.contacted_at||null,
            m.created_at||new Date().toISOString());
        }
      }

      // ── Sync vessel_owners (upsert by id) ──
      if (vessel_owners.length > 0) {
        const upsertOwner = db.prepare(`INSERT INTO vessel_owners (id, owner_name, owner_email, owner_phone, make, model, year, length, estimated_value, location, vessel_name, how_known, description, status, notes, lead_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_name=excluded.owner_name, owner_email=excluded.owner_email, owner_phone=excluded.owner_phone, make=excluded.make, model=excluded.model, year=excluded.year, length=excluded.length, estimated_value=excluded.estimated_value, location=excluded.location, vessel_name=excluded.vessel_name, how_known=excluded.how_known, description=excluded.description, status=excluded.status, notes=excluded.notes, lead_id=excluded.lead_id, updated_at=excluded.updated_at`);
        for (const o of vessel_owners) {
          upsertOwner.run(o.id, o.owner_name||'', o.owner_email||'', o.owner_phone||'', o.make||'', o.model||'', o.year||'', o.length||'', o.estimated_value||'', o.location||'', o.vessel_name||'', o.how_known||'', o.description||'', o.status||'active', o.notes||'', o.lead_id||null, o.created_at||new Date().toISOString(), o.updated_at||new Date().toISOString());
        }
      }

      // ── Sync buyer_searches (upsert by id) ──
      if (buyer_searches.length > 0) {
        const upsertBuyer = db.prepare(`INSERT INTO buyer_searches (id, buyer_name, buyer_email, buyer_phone, make, model, year_min, year_max, length_min, length_max, budget_min, budget_max, preferred_location, description, status, notes, lead_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET buyer_name=excluded.buyer_name, buyer_email=excluded.buyer_email, make=excluded.make, model=excluded.model, year_min=excluded.year_min, year_max=excluded.year_max, length_min=excluded.length_min, length_max=excluded.length_max, budget_min=excluded.budget_min, budget_max=excluded.budget_max, status=excluded.status, notes=excluded.notes, updated_at=excluded.updated_at`);
        for (const b of buyer_searches) {
          upsertBuyer.run(b.id, b.buyer_name||'', b.buyer_email||'', b.buyer_phone||'', b.make||'', b.model||'', b.year_min||'', b.year_max||'', b.length_min||'', b.length_max||'', b.budget_min||'', b.budget_max||'', b.preferred_location||'', b.description||'', b.status||'active', b.notes||'', b.lead_id||null, b.created_at||new Date().toISOString(), b.updated_at||new Date().toISOString());
        }
      }

      db.pragma("foreign_keys = ON");

      const counts = { leads: leads.length, boats: boats.length, todos: todos.length,
        pocket_listings: pocket_listings.length, iso_requests: iso_requests.length, marinas: marinas.length,
        my_listings: listings.length, vessel_owners: vessel_owners.length, buyer_searches: buyer_searches.length,
        enrichment_profiles: enrichment_profiles.length, enrichment_sources: enrichment_sources.length,
        email_batches: email_batches.length, parsed_listings: parsed_listings.length,
        listing_matches: listing_matches.length };
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
