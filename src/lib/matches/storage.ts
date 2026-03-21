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
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN client_name TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN denison_url TEXT DEFAULT ''"); } catch {}
    // Phase 1: staleness tracking on listings
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN listed_at TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE parsed_listings ADD COLUMN days_on_market INTEGER DEFAULT 0"); } catch {}
    // Phase 1: dismissal memory on leads
    try { db.exec("ALTER TABLE leads ADD COLUMN dismissed_listing_ids TEXT DEFAULT '[]'"); } catch {}
    // Phase 2 behavioral: last contacted timestamp on leads
    try { db.exec("ALTER TABLE leads ADD COLUMN last_contacted_at TEXT DEFAULT ''"); } catch {}
    // Phase 1: penalty log + positive hits stored on matches
    try { db.exec("ALTER TABLE listing_matches ADD COLUMN penalty_log TEXT DEFAULT '[]'"); } catch {}
    try { db.exec("ALTER TABLE listing_matches ADD COLUMN positive_hits INTEGER DEFAULT 0"); } catch {}
    // Phase 1: exposure log table
    db.exec(`CREATE TABLE IF NOT EXISTS match_exposure_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      lead_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      surfaced_in TEXT DEFAULT 'todos',
      surfaced_at TEXT NOT NULL,
      broker_action TEXT DEFAULT '',
      action_at TEXT DEFAULT '',
      assigned_broker TEXT DEFAULT ''
    )`);
    // Extended buyer_searches criteria columns (Phase 2)
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN vessel_type_pref TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN flybridge_pref TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN stabilizers_pref TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN condition_pref TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN min_cabins TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN engine_type_pref TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE buyer_searches ADD COLUMN hull_material_pref TEXT DEFAULT ''"); } catch {}
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
  listed_at?: string; days_on_market?: number; denison_url?: string;
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
      `INSERT INTO parsed_listings (batch_id, make, model, year, loa, asking_price, location, vessel_type, features, listing_url, broker_notes, raw_text, content_hash, section, brokerage, listed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(batchId, listing.make||"", listing.model||"", listing.year||"", listing.loa||"",
      listing.asking_price||"", listing.location||"", listing.vessel_type||"",
      listing.features||"", listing.listing_url||"", listing.broker_notes||"",
      listing.raw_text||"", hash, listing.section||"", listing.brokerage||"", now, now);
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

type MatchResult = {
  score: number;
  confidence: string;
  reasons: string[];
  conflicts: string[];
  /** Number of criteria that returned a REAL signal (not a neutral default) */
  positiveHits: number;
  /** Human-readable log of penalties applied */
  penaltyLog: string[];
  /** true if hard-fail gate triggered — match should be suppressed entirely */
  hardFail: boolean;
};

// ── Geo helpers ───────────────────────────────────────────────────────────────
// US coastal regions — vessels are usually trailered or sailed within region
const US_REGIONS: Record<string, string[]> = {
  southeast:    ["fl","ga","sc","nc"],
  mid_atlantic: ["va","md","de","nj","ny"],
  northeast:    ["ct","ri","ma","nh","me"],
  gulf:         ["tx","la","ms","al"],
  great_lakes:  ["il","oh","mi","in","wi","mn"],
  west_coast:   ["ca","or","wa"],
};
// International macro-regions — full names only, no ambiguous short codes
const INTL_REGIONS: Record<string, string[]> = {
  mediterranean: ["france","monaco","italy","spain","portugal","croatia","greece","turkey","malta",
                  "gibraltar","montenegro","slovenia","tunisia","algeria","morocco"],
  caribbean:     ["bahamas","virgin islands","cayman","antigua","barbados",
                  "martinique","grenada","trinidad","aruba","curacao","turks"],
  northern_europe:["ireland","netherlands","germany","belgium","denmark","sweden","norway","finland"],
  pacific:       ["australia","zealand","japan","singapore","thailand","indonesia","philippines"],
  middle_east:   ["emirates","dubai","qatar","saudi","oman","kuwait","bahrain"],
};

function extractGeoTokens(loc: string): { state: string; country: string; tokens: string[] } {
  const GEO_STOPWORDS = new Set(["united","states","kingdom","republic","of","the","and","coast","port","bay",
    "city","island","islands","north","south","east","west","new","la","le","les","san","santa","saint","st"]);
  const l = loc.toLowerCase().replace(/[,\.]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = l.split(" ").filter(t => t.length > 3 && !GEO_STOPWORDS.has(t));
  const usStates = ["al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia","ks","ky",
    "la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok","or",
    "pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv","wi","wy"];
  // also check raw tokens (including short) for 2-letter state codes
  const rawTokens = l.split(" ").filter(Boolean);
  const state  = rawTokens.find(t => usStates.includes(t)) || "";
  const country = l.includes("united states") || rawTokens.includes("us") ? "us"
    : l.includes("united kingdom") || rawTokens.includes("gb") ? "gb"
    : rawTokens.at(-1) || "";
  return { state, country, tokens };
}

function geoScore(listingLoc: string, buyerLoc: string): { pts: number; reason: string | null } {
  if (!listingLoc || !buyerLoc) return { pts: 4, reason: null }; // neutral missing

  const l = extractGeoTokens(listingLoc);
  const b = extractGeoTokens(buyerLoc);

  // Exact city overlap
  const sharedToken = l.tokens.find(t => t.length > 3 && b.tokens.includes(t));
  if (sharedToken) return { pts: 16, reason: `Same area: ${sharedToken}` };

  // Same US state
  if (l.state && b.state && l.state === b.state)
    return { pts: 12, reason: `Same state (${l.state.toUpperCase()})` };

  // Same US coastal region
  if (l.state && b.state) {
    for (const [region, states] of Object.entries(US_REGIONS)) {
      if (states.includes(l.state) && states.includes(b.state))
        return { pts: 8, reason: `Same region (${region.replace("_"," ")})` };
    }
  }

  // Both in US
  if (l.country === "us" && b.country === "us")
    return { pts: 5, reason: "Both US" };

  // Same international macro-region (token-based only, no substring to avoid false positives)
  for (const [region, terms] of Object.entries(INTL_REGIONS)) {
    const lIn = terms.some(t => l.tokens.includes(t));
    const bIn = terms.some(t => b.tokens.includes(t));
    if (lIn && bIn) return { pts: 8, reason: `Same region (${region.replace("_"," ")})` };
  }

  // Same country (non-US)
  if (l.country && b.country && l.country === b.country && l.country !== "us")
    return { pts: 6, reason: `Same country` };

  return { pts: 1, reason: null }; // different regions
}

// ── Notes intent mining ───────────────────────────────────────────────────────
function intentScore(notes: string): { pts: number; signal: string | null } {
  if (!notes) return { pts: 0, signal: null };
  const n = notes.toLowerCase();
  const strongSignals = ["make an offer","place an offer","submit an offer","ready to purchase",
    "ready to buy","immediate purchase","looking to close","serious buyer","motivated","want to buy",
    "like to purchase","want to purchase","interested in closing","underwrite","purchase this",
    "buy this","acquiring","looking to acquire"];
  const medSignals = ["very interested","seriously interested","serious","interested in buying",
    "looking to buy","want to acquire","plan to buy","considering purchase","have budget",
    "cash buyer","financing arranged","pre-approved"];
  const lightSignals = ["interested","like to know more","like more info","inquire",
    "viewing","see the boat","schedule a viewing","arrange a viewing"];

  if (strongSignals.some(s => n.includes(s))) return { pts: 7, signal: "Strong buy intent" };
  if (medSignals.some(s => n.includes(s)))    return { pts: 4, signal: "Serious interest" };
  if (lightSignals.some(s => n.includes(s)))  return { pts: 2, signal: "Expressed interest" };
  return { pts: 1, signal: null }; // has notes = slight positive
}

// ── Notes → specs extraction (for leads with no boat record) ─────────────────
function extractSpecsFromNotes(notes: string): { make?: string; length?: number; year?: number; price?: number } {
  if (!notes) return {};
  const n = notes.toLowerCase();
  const result: { make?: string; length?: number; year?: number; price?: number } = {};

  // Length: "43 foot", "43'", "43ft", "43-foot"
  const lenMatch = n.match(/(\d{2,3})['\s-]?(?:ft|foot|feet|'|meter|metre|m\b)/);
  if (lenMatch) result.length = parseInt(lenMatch[1]);

  // Year: 4-digit year between 1970-2026
  const yearMatch = n.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
  if (yearMatch) result.year = parseInt(yearMatch[1]);

  // Price: $X million, $Xm, $X,000
  const priceMatch = n.match(/\$\s*([\d,.]+)\s*(?:m(?:illion)?|mil\b)?/i);
  if (priceMatch) {
    const raw = parseFloat(priceMatch[1].replace(/,/g, ""));
    result.price = n.includes("million") || n.includes(" mil") || raw < 1000 ? raw * 1_000_000 : raw;
  }

  // Make: check against known brands
  const brands = ["azimut","sunseeker","ferretti","benetti","princess","pershing","riva","ocean alexander",
    "san lorenzo","sanlorenzo","viking","hatteras","sea ray","bertram","mochi craft","fairline",
    "prestige","pearl","custom line","numarine","mangusta","heesen","feadship","lurssen","oceanco",
    "amels","nobiskrug","van der valk","moonen","nordhavn","selene","beneteau","jeanneau","sessa",
    "contessa","buddy davis","jarvis newman","hinckley"];
  for (const b of brands) { if (n.includes(b)) { result.make = b; break; } }

  return result;
}

// ── Feature extraction from listing text ─────────────────────────────────────
// Mines both the features field and raw_text for physical attributes.
// Returns presence/absence — null means "not mentioned" (neutral).
function extractListingFeatures(listing: ParsedListing): {
  hasFlybridge: boolean | null;
  hasStabilizers: boolean | null;
  engineType: "diesel" | "gas" | "hybrid" | null;
  cabins: number | null;
  hullMaterial: "fiberglass" | "aluminum" | "steel" | "composite" | null;
  condition: "new" | "excellent" | "good" | "fair" | null;
} {
  const text = [(listing.features || ""), (listing.raw_text || ""), (listing.broker_notes || "")]
    .join(" ").toLowerCase();

  const hasFlybridge =
    /flybridge|fly\s*bridge|fly\s*deck/.test(text) ? true :
    /no flybridge|without flybridge|express(?!\s+flybridge)/.test(text) ? false : null;

  const hasStabilizers =
    /stabiliz|gyrostabiliz|seakeeper|active fins|fin stabiliz|zero[\s-]speed stabiliz/.test(text) ? true :
    /no stabiliz|without stabiliz/.test(text) ? false : null;

  const engineTypeMatch =
    /\bhybrid\b/.test(text) ? "hybrid" as const :
    /\bdiesel\b|mtu\b|man\b engines|caterpillar|volvo\s*penta\s*diesel|cummins/.test(text) ? "diesel" as const :
    /\bgas(?:oline)?\b|petrol|mercruiser|gasoline engines/.test(text) ? "gas" as const : null;

  let cabins: number | null = null;
  const cabinMatch = text.match(/(\d)\s*(?:cabin|stateroom|guest room|berth)/);
  if (cabinMatch) cabins = parseInt(cabinMatch[1]);

  const hullMaterial =
    /\baluminum\b|\baluminium\b/.test(text) ? "aluminum" as const :
    /\bsteel\b\s*hull|steel\s*hull/.test(text) ? "steel" as const :
    /\bcomposite\b/.test(text) ? "composite" as const :
    /\bfiber\s*glass\b|\bfiberglass\b|\bGRP\b/.test(text) ? "fiberglass" as const : null;

  // Condition rough mapping (new/excellent/good from listing text)
  const condition =
    /\bnew\b|\bbrand[\s-]new\b|\bnew build\b/.test(text) ? "new" as const :
    /\bexcellent\b|\bpristine\b|\bimmaculate\b/.test(text) ? "excellent" as const :
    /\bgood condition\b|\bwell[\s-]maintained\b|\bgood order\b/.test(text) ? "good" as const :
    /\bfair condition\b|\bneeds work\b|\bproject\b/.test(text) ? "fair" as const : null;

  return { hasFlybridge, hasStabilizers, engineType: engineTypeMatch, cabins, hullMaterial, condition };
}

// ── Vessel type matching ──────────────────────────────────────────────────────
function vesselTypeScore(lType: string, notes: string): { pts: number; reason: string | null } {
  const lt = (lType || "").toLowerCase();
  const n  = (notes || "").toLowerCase();

  const typeKeywords: Record<string, string[]> = {
    motor_yacht:  ["motor yacht","motoryacht","my ","flybridge","pilothouse","sedan"],
    sailing:      ["sailing","sailboat","sloop","ketch","yawl","catamaran","sail yacht"],
    explorer:     ["explorer","expedition","trawler","passage","long range"],
    sport:        ["sport","sportfish","sportfisher","sport fishing","fishing"],
    catamaran:    ["catamaran","cat ","multihull"],
    mega:         ["superyacht","mega","super yacht","giga"],
  };

  for (const [type, terms] of Object.entries(typeKeywords)) {
    const listingIs = terms.some(t => lt.includes(t));
    const buyerWants = terms.some(t => n.includes(t));
    if (listingIs && buyerWants) return { pts: 5, reason: `${type.replace("_"," ")} match` };
    if (listingIs && !buyerWants && n.length > 20) return { pts: 1, reason: null }; // minor conflict
  }
  return { pts: 3, reason: null }; // neutral / no data
}

export function scoreListingVsBuyer(
  listing: ParsedListing,
  buyer: {
    // ISO / explicit fields
    budget_min?: string; budget_max?: string;
    length_min?: string; length_max?: string;
    year_min?: string;   year_max?: string;
    make?: string;       model?: string;
    preferred_location?: string;
    // From boat record
    boat_make?: string; boat_year?: string; boat_length?: string; boat_price?: string;
    boat_location?: string;
    // Lead meta
    notes?: string;
    lead_city?: string; lead_state?: string;
    has_email?: boolean; has_phone?: boolean;
    lead_status?: string;
    last_contacted_at?: string;  // ISO date string — for lead recency scoring
    // ── Extended ISO criteria (Phase 2) ───────────────────────────────────────
    vessel_type_pref?: string;   // motor_yacht | sailing | explorer | sport | catamaran | mega | any
    flybridge_pref?: string;     // yes | no | any
    stabilizers_pref?: string;   // yes | no | any
    condition_pref?: string;     // new | excellent | good | any
    min_cabins?: string;         // "4" etc
    engine_type_pref?: string;   // diesel | gas | hybrid | any
    hull_material_pref?: string; // fiberglass | aluminum | steel | composite | any
  }
): MatchResult {
  let score = 0;
  let positiveHits = 0;   // incremented only when we have REAL data, not neutral defaults
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const penaltyLog: string[] = [];

  const lPrice = parseNum(listing.asking_price);
  const lLoa   = parseNum(listing.loa);
  const lYear  = parseNum(listing.year);
  const lMake  = (listing.make || "").toLowerCase().trim();
  const notes  = buyer.notes || "";

  // ── HARD-FAIL GATES (evaluated before any scoring) ────────────────────────
  // If any gate fires, return immediately with hardFail=true — match is suppressed.

  // Gate 1: Price >125% of buyer max (completely unaffordable)
  const bMinH = parseNum(buyer.budget_min) || parseNum(buyer.boat_price);
  const bMaxH = parseNum(buyer.budget_max) || (bMinH ? bMinH * 1.3 : null);
  if (lPrice !== null && bMaxH !== null && lPrice > bMaxH * 1.25) {
    return { score: 0, confidence: "low", reasons: [], conflicts: ["Price >125% of budget"],
             positiveHits: 0, penaltyLog: [], hardFail: true };
  }

  // Gate 2: LOA more than 20% outside buyer range (wrong size class entirely)
  const bLenMinH = parseNum(buyer.length_min) || (buyer.boat_length ? (parseNum(buyer.boat_length)||0)*0.85 : null);
  const bLenMaxH = parseNum(buyer.length_max) || (buyer.boat_length ? (parseNum(buyer.boat_length)||0)*1.15 : null);
  if (lLoa !== null && bLenMinH !== null && bLenMaxH !== null) {
    if (lLoa < bLenMinH * 0.8 || lLoa > bLenMaxH * 1.2) {
      return { score: 0, confidence: "low", reasons: [], conflicts: ["LOA >20% outside desired range"],
               positiveHits: 0, penaltyLog: [], hardFail: true };
    }
  }

  // Gate 3: Hard vessel type contradiction (buyer wants sail, listing is power, or vice versa)
  const vtPrefH = (buyer.vessel_type_pref || "").toLowerCase();
  const lTypeH  = (listing.vessel_type || "").toLowerCase();
  if (vtPrefH && lTypeH) {
    const wantsSail  = /sail|sloop|ketch|yawl/.test(vtPrefH);
    const wantsPower = /motor|flybridge|pilothouse|sport|explorer/.test(vtPrefH);
    const isSail  = /sail|sloop|ketch|yawl/.test(lTypeH);
    const isPower = /motor|flybridge|pilothouse|sport|explorer/.test(lTypeH);
    if ((wantsSail && isPower) || (wantsPower && isSail)) {
      return { score: 0, confidence: "low", reasons: [],
               conflicts: [`Type contradiction: buyer wants ${vtPrefH}, listing is ${lTypeH}`],
               positiveHits: 0, penaltyLog: [], hardFail: true };
    }
  }

  // Gate 4: Listing staleness >180 days (stale inventory — never surface)
  const listedAt = (listing.listed_at || listing.created_at || "");
  let daysOld = 0;
  if (listedAt) {
    daysOld = Math.floor((Date.now() - new Date(listedAt).getTime()) / 86_400_000);
    if (daysOld > 180) {
      return { score: 0, confidence: "low", reasons: [],
               conflicts: [`Listing >180 days old (${daysOld}d)`],
               positiveHits: 0, penaltyLog: [], hardFail: true };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── 1. PRICE (25 pts) ──────────────────────────────────────────────────────
  const bMin = parseNum(buyer.budget_min) || parseNum(buyer.boat_price);
  const bMax = parseNum(buyer.budget_max) || (bMin ? bMin * 1.3 : null);
  if (lPrice !== null && bMax !== null) {
    positiveHits++;
    if (lPrice <= bMax && (!bMin || lPrice >= bMin * 0.7)) {
      score += 25; reasons.push(`Price $${(lPrice/1e6).toFixed(1)}M within budget`);
    } else if (lPrice <= bMax * 1.15) {
      score += 12; conflicts.push(`Price slightly over budget (${Math.round((lPrice/bMax - 1)*100)}%)`);
    } else {
      conflicts.push("Price exceeds budget by >15%");
    }
  } else {
    // Try to extract price signal from notes
    const noted = extractSpecsFromNotes(notes);
    if (noted.price && lPrice) {
      positiveHits++;
      const impliedMax = noted.price * 1.3;
      if (lPrice <= impliedMax) { score += 12; reasons.push("Price may fit notes context"); }
      else { score += 6; }
    } else { score += 12; } // neutral missing — no hit counted
  }

  // ── 2. LOA (20 pts) ────────────────────────────────────────────────────────
  let bLenMin = parseNum(buyer.length_min);
  let bLenMax = parseNum(buyer.length_max);
  if (!bLenMin && !bLenMax && buyer.boat_length) {
    const bl = parseNum(buyer.boat_length);
    if (bl) { bLenMin = bl * 0.85; bLenMax = bl * 1.15; }
  }
  if (!bLenMin && !bLenMax) {
    // Try notes
    const noted = extractSpecsFromNotes(notes);
    if (noted.length) { bLenMin = noted.length * 0.85; bLenMax = noted.length * 1.15; }
  }
  if (lLoa !== null && (bLenMin !== null || bLenMax !== null)) {
    positiveHits++;
    const lo = bLenMin || 0;
    const hi = bLenMax || Infinity;
    if (lLoa >= lo && lLoa <= hi) {
      score += 20; reasons.push(`LOA ${listing.loa}' fits range`);
    } else if (lLoa >= lo * 0.9 && lLoa <= hi * 1.1) {
      score += 10; conflicts.push(`LOA ${listing.loa}' slightly outside range`);
    } else {
      conflicts.push(`LOA ${listing.loa}' outside desired range`);
    }
  } else { score += 10; } // neutral

  // ── 3. YEAR (12 pts) ───────────────────────────────────────────────────────
  let bYearMin = parseNum(buyer.year_min);
  let bYearMax = parseNum(buyer.year_max);
  if (!bYearMin && !bYearMax && buyer.boat_year) {
    const by = parseNum(buyer.boat_year);
    if (by) { bYearMin = by - 3; bYearMax = by + 3; }
  }
  if (!bYearMin && !bYearMax) {
    const noted = extractSpecsFromNotes(notes);
    if (noted.year) { bYearMin = noted.year - 5; bYearMax = noted.year + 5; }
  }
  if (lYear !== null && (bYearMin !== null || bYearMax !== null)) {
    positiveHits++;
    const lo = bYearMin || 0;
    const hi = bYearMax || 9999;
    if (lYear >= lo && lYear <= hi) {
      score += 12; reasons.push(`Year ${listing.year} in range`);
    } else if (lYear >= lo - 3 && lYear <= hi + 3) {
      score += 6; conflicts.push(`Year ${listing.year} slightly outside target`);
    } else {
      conflicts.push(`Year ${listing.year} too far from target`);
    }
  } else { score += 6; } // neutral

  // ── 4. MAKE (12 pts) ───────────────────────────────────────────────────────
  let bMake = (buyer.make || buyer.boat_make || "").toLowerCase().trim();
  if (!bMake) {
    const noted = extractSpecsFromNotes(notes);
    if (noted.make) bMake = noted.make;
  }
  if (lMake && bMake) {
    positiveHits++;
    if (lMake === bMake || lMake.includes(bMake) || bMake.includes(lMake)) {
      score += 12; reasons.push(`Make match: ${listing.make}`);
    } else {
      conflicts.push(`Make: ${listing.make} vs preferred ${bMake}`);
    }
  } else { score += 6; } // neutral

  // ── 5. LOCATION PROXIMITY (16 pts) ─────────────────────────────────────────
  // Build buyer location string from available sources (priority order)
  const buyerLocRaw = buyer.preferred_location
    || buyer.boat_location
    || [buyer.lead_city, buyer.lead_state].filter(Boolean).join(" ")
    || "";
  const { pts: locPts, reason: locReason } = geoScore(listing.location || "", buyerLocRaw);
  score += locPts;
  if (locPts >= 8) positiveHits++;   // only real geo signal counts
  if (locReason) reasons.push(locReason);
  else if (locPts >= 8) reasons.push(`Location proximity`);

  // ── 6. VESSEL TYPE (5 pts) ─────────────────────────────────────────────────
  const { pts: typePts, reason: typeReason } = vesselTypeScore(listing.vessel_type || "", notes);
  score += typePts;
  if (typePts === 5) positiveHits++;  // explicit type match only
  if (typeReason) reasons.push(typeReason);

  // ── 7. NOTES INTENT SIGNALS (7 pts) ────────────────────────────────────────
  const { pts: intentPts, signal } = intentScore(notes);
  score += intentPts;
  if (intentPts >= 4) positiveHits++;  // medium+ intent only
  if (signal) reasons.push(signal);

  // ── 8. LEAD QUALITY (3 pts) ────────────────────────────────────────────────
  let qualPts = 0;
  if (buyer.has_email)   qualPts += 1;
  if (buyer.has_phone)   qualPts += 1;
  const activeStatuses = ["active","warm","hot","qualified","interested","pipeline"];
  if (buyer.lead_status && activeStatuses.includes(buyer.lead_status.toLowerCase())) qualPts += 1;
  score += qualPts;
  if (qualPts >= 2) reasons.push("Verified contact info");

  // ── 9. EXTENDED CRITERIA (up to 17 additional pts) ─────────────────────────
  // Mine the listing for physical attributes
  const lf = extractListingFeatures(listing);

  // ── 9a. Vessel type explicit pref (5 pts — bonus on top of notes-based type) ─
  const vtPref = (buyer.vessel_type_pref || "").toLowerCase().trim();
  if (vtPref && vtPref !== "any") {
    const typeKeywords: Record<string, string[]> = {
      motor_yacht:  ["motor", "motor_yacht", "motoryacht", "flybridge", "pilothouse"],
      sailing:      ["sail", "sailing", "sloop", "ketch", "yawl"],
      explorer:     ["explorer", "expedition", "trawler"],
      sport:        ["sport", "sportfish", "fishing"],
      catamaran:    ["catamaran", "cat", "multihull"],
      mega:         ["superyacht", "mega"],
    };
    const lType = (listing.vessel_type || "").toLowerCase();
    for (const [key, terms] of Object.entries(typeKeywords)) {
      if (vtPref.includes(key.replace("_"," ")) || terms.some(t => vtPref.includes(t))) {
        if (terms.some(t => lType.includes(t))) {
          score += 5; positiveHits++; reasons.push(`Vessel type match: ${vtPref}`);
        } else if (lType) {
          conflicts.push(`Type mismatch: want ${vtPref}, listing is ${lType}`);
        }
        break;
      }
    }
  }

  // ── 9b. Flybridge preference (4 pts) ────────────────────────────────────────
  const fbPref = (buyer.flybridge_pref || "").toLowerCase().trim();
  if (fbPref && fbPref !== "any" && lf.hasFlybridge !== null) {
    positiveHits++;
    if (fbPref === "yes" && lf.hasFlybridge) {
      score += 4; reasons.push("Flybridge match");
    } else if (fbPref === "no" && !lf.hasFlybridge) {
      score += 4; reasons.push("Express layout match");
    } else {
      conflicts.push(`Flybridge: buyer wants ${fbPref}, listing has ${lf.hasFlybridge ? "flybridge" : "no flybridge"}`);
    }
  }

  // ── 9c. Stabilizers preference (4 pts) ──────────────────────────────────────
  const stabPref = (buyer.stabilizers_pref || "").toLowerCase().trim();
  if (stabPref === "yes" && lf.hasStabilizers !== null) {
    positiveHits++;
    if (lf.hasStabilizers) {
      score += 4; reasons.push("Stabilizers match");
    } else {
      conflicts.push("Buyer wants stabilizers — not mentioned in listing");
    }
  }

  // ── 9d. Min cabins (3 pts) ──────────────────────────────────────────────────
  const minCabins = parseInt(buyer.min_cabins || "0");
  if (minCabins > 0 && lf.cabins !== null) {
    positiveHits++;
    if (lf.cabins >= minCabins) {
      score += 3; reasons.push(`${lf.cabins} cabins meets ${minCabins}+ requirement`);
    } else {
      conflicts.push(`${lf.cabins} cabins below ${minCabins} minimum`);
    }
  }

  // ── 9e. Engine type preference (3 pts) ──────────────────────────────────────
  const engPref = (buyer.engine_type_pref || "").toLowerCase().trim();
  if (engPref && engPref !== "any" && lf.engineType !== null) {
    positiveHits++;
    if (lf.engineType === engPref) {
      score += 3; reasons.push(`${engPref} engines match`);
    } else {
      conflicts.push(`Engine: want ${engPref}, listing has ${lf.engineType}`);
    }
  }

  // ── 9f. Hull material preference (2 pts) ────────────────────────────────────
  const hullPref = (buyer.hull_material_pref || "").toLowerCase().trim();
  if (hullPref && hullPref !== "any" && lf.hullMaterial !== null) {
    positiveHits++;
    if (lf.hullMaterial === hullPref) {
      score += 2; reasons.push(`${hullPref} hull match`);
    } else {
      conflicts.push(`Hull: want ${hullPref}, listing is ${lf.hullMaterial}`);
    }
  }

  // ── LEAD RECENCY (up to +6 / down to -3) ─────────────────────────────────
  // Rewards recently active leads; lightly penalizes cold/stale leads.
  if (buyer.last_contacted_at) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(buyer.last_contacted_at).getTime()) / 86_400_000
    );
    if (daysAgo <= 14) {
      score += 6; reasons.push(`Active lead (contacted ${daysAgo}d ago)`);
      positiveHits++;
    } else if (daysAgo <= 30) {
      score += 3; // warm — no tag, just a soft bonus
    } else if (daysAgo <= 60) {
      // neutral — no adjustment
    } else if (daysAgo <= 90) {
      score -= 3; penaltyLog.push(`Cold lead -3 (${daysAgo}d since contact)`);
    } else {
      score -= 5; penaltyLog.push(`Stale lead -5 (${daysAgo}d since contact)`);
    }
  }

  // ── STALENESS DECAY ───────────────────────────────────────────────────────
  // New-to-market bonus: listed in last 7 days gets +6
  // Soft decay: 31–90 days = -2; 91–180 days = -5
  if (daysOld > 0) {
    if (daysOld <= 7) {
      score += 6; reasons.push(`New to market (${daysOld}d old)`);
    } else if (daysOld <= 30) {
      // 8–30 days: no bonus, no penalty
    } else if (daysOld <= 90) {
      score -= 2; penaltyLog.push(`Staleness -2 (${daysOld}d old)`);
    } else {
      score -= 5; penaltyLog.push(`Staleness -5 (${daysOld}d old)`);
    }
  }

  // ── CONFLICT PENALTY DEDUCTIONS ───────────────────────────────────────────
  // Conflicts are now functional — they subtract from the score.
  // Each conflict was already pushed to the conflicts[] array above.
  // Map conflict patterns to point deductions.
  const conflictPenalties: [RegExp, number, string][] = [
    [/price exceeds budget by >15%/i,               10, "Price >15% over budget"],
    [/price slightly over budget/i,                  0, ""],   // already scored partial pts
    [/loa .+ outside desired range/i,                8, "LOA outside range"],
    [/loa .+ slightly outside range/i,               0, ""],  // already scored partial pts
    [/year .+ too far from target/i,                 8, "Year too far"],
    [/year .+ slightly outside target/i,             0, ""],  // partial pts already
    [/make: .+ vs preferred/i,                       5, "Make mismatch"],
    [/type (mismatch|contradiction)/i,               5, "Vessel type mismatch"],
    [/flybridge: buyer wants/i,                      4, "Flybridge mismatch"],
    [/buyer wants stabilizers/i,                     2, "Stabilizers not confirmed"],
    [/cabins below .+ minimum/i,                     3, "Insufficient cabins"],
    [/engine: want/i,                                2, "Engine type mismatch"],
    [/hull: want/i,                                  1, "Hull material mismatch"],
  ];

  for (const conflict of conflicts) {
    for (const [pattern, deduction, label] of conflictPenalties) {
      if (deduction > 0 && pattern.test(conflict)) {
        score -= deduction;
        penaltyLog.push(`${label} -${deduction}`);
        break;
      }
    }
  }

  // ── FINAL CONFIDENCE BUCKET ───────────────────────────────────────────────
  // Score can now go negative due to penalties — clamp at 0
  score = Math.max(0, score);
  const confidence = score >= 70 ? "high" : score >= 45 ? "medium" : "low";

  return { score, confidence, reasons, conflicts, positiveHits, penaltyLog, hardFail: false };
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
    const THRESHOLD = 75;

    for (const listing of listings) {
      // ── Match against leads ──────────────────────────────────────────────
      for (const lead of leads) {
        // Dismissal exclusion: if this lead has previously dismissed this listing, skip entirely
        const dismissedIds: number[] = (() => {
          try { return JSON.parse(lead.dismissed_listing_ids || "[]"); } catch { return []; }
        })();
        if (dismissedIds.includes(listing.id)) continue;

        const leadBoats = boatsByLead.get(lead.id) || [];

        // Build candidate buyer profiles — one per boat, plus a notes-only profile if strong intent
        const profiles: Parameters<typeof scoreListingVsBuyer>[1][] = [];

        const baseMeta = {
          notes: lead.notes || "",
          lead_city: lead.city || "",
          lead_state: lead.state || "",
          has_email: !!(lead.email && lead.email.trim()),
          has_phone: !!(lead.phone && lead.phone.trim()),
          lead_status: lead.status || "new",
          last_contacted_at: lead.last_contacted_at || "",
          // Explicit buyer criteria (Phase 3) — take priority over notes mining
          budget_min: lead.budget_min || "",
          budget_max: lead.budget_max || "",
          length_min: lead.loa_min || "",
          length_max: lead.loa_max || "",
          year_min: lead.year_min || "",
          year_max: lead.year_max || "",
          make: lead.make_preference || "",
          preferred_location: lead.preferred_location || "",
          vessel_type_pref: lead.vessel_type_pref || "",
          flybridge_pref: lead.flybridge_pref || "",
          stabilizers_pref: lead.stabilizers_pref || "",
          min_cabins: lead.min_cabins || "",
          engine_type_pref: lead.engine_type_pref || "",
        };

        for (const boat of leadBoats) {
          profiles.push({
            ...baseMeta,
            boat_make: boat.make, boat_year: boat.year,
            boat_length: boat.length, boat_price: boat.price,
            boat_location: boat.location || "",
          });
        }

        // Score notes-only if no boats but notes have intent/spec signals
        if (leadBoats.length === 0) {
          const { pts: intentPts } = intentScore(baseMeta.notes);
          const noted = extractSpecsFromNotes(baseMeta.notes);
          const hasSpecs = noted.make || noted.length || noted.price || noted.year;
          if (intentPts >= 2 || hasSpecs) {
            profiles.push(baseMeta);
          }
        }

        if (profiles.length === 0) continue;

        // Take the best score across all profiles for this lead
        const result = profiles
          .map(p => scoreListingVsBuyer(listing, p))
          .reduce((best, r) => r.score > best.score ? r : best);

        // Skip if any profile triggered a hard-fail gate
        if (result.hardFail) continue;

        if (result.score >= THRESHOLD) {
          try {
            db.prepare(
              `INSERT OR IGNORE INTO listing_matches
               (listing_id, lead_id, iso_id, batch_id, match_score, confidence,
                reasons, conflicts, penalty_log, positive_hits, status, created_at)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
            ).run(listing.id, lead.id, batchId, result.score, result.confidence,
              JSON.stringify(result.reasons), JSON.stringify(result.conflicts),
              JSON.stringify(result.penaltyLog), result.positiveHits, now);
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
          notes: iso.notes || iso.preferences || iso.description || "",
          has_email: !!(iso.buyer_email?.trim()),
          has_phone: !!(iso.buyer_phone?.trim()),
          lead_status: "active",
          vessel_type_pref:   iso.vessel_type_pref   || "",
          flybridge_pref:     iso.flybridge_pref     || "",
          stabilizers_pref:   iso.stabilizers_pref   || "",
          condition_pref:     iso.condition_pref     || "",
          min_cabins:         iso.min_cabins         || "",
          engine_type_pref:   iso.engine_type_pref   || "",
          hull_material_pref: iso.hull_material_pref || "",
        });

        if (result.hardFail) continue;

        if (result.score >= THRESHOLD) {
          try {
            db.prepare(
              `INSERT OR IGNORE INTO listing_matches
               (listing_id, lead_id, iso_id, batch_id, match_score, confidence,
                reasons, conflicts, penalty_log, positive_hits, status, created_at)
               VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
            ).run(listing.id, iso.id, batchId, result.score, result.confidence,
              JSON.stringify(result.reasons), JSON.stringify(result.conflicts),
              JSON.stringify(result.penaltyLog), result.positiveHits, now);
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

// ── Thresholds ────────────────────────────────────────────────────────────────
// score >= HUMAN_THRESHOLD AND positiveHits >= MIN_POSITIVE_HITS → human To Do
// score >= BOT_THRESHOLD (but below human or insufficient hits) → bot queue
// score <  BOT_THRESHOLD → ignored entirely
const HUMAN_THRESHOLD    = 88;   // raised from 85 — requires genuinely strong overlap
const BOT_THRESHOLD      = 75;
const MIN_POSITIVE_HITS  = 3;    // at least 3 real data-point matches, not neutral defaults
const TOP_N_PER_PERSON   = 50;   // global cap: max open match todos per person across ALL batches
const TOP_N_BOT          = 40;   // max bot queue items per batch

export function generateMatchTodos(batchId: number): { human: number; bot: number } {
  const db = getDb();
  try {
    // Safe migrations
    try { db.exec("ALTER TABLE todos ADD COLUMN email_draft TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE todos ADD COLUMN todo_type TEXT DEFAULT 'manual'"); } catch {}
    try { db.exec("ALTER TABLE todos ADD COLUMN queue TEXT DEFAULT 'human'"); } catch {}
    try { db.exec("ALTER TABLE todos ADD COLUMN listing_id INTEGER"); } catch {}

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    let humanCreated = 0;
    let botCreated   = 0;

    // ── Global cap: count current OPEN human match todos per person ───────────
    const willOpen  = (db.prepare("SELECT COUNT(*) as c FROM todos WHERE assignee='will'  AND queue='human' AND todo_type='match' AND completed=0").get() as any).c as number;
    const paoloOpen = (db.prepare("SELECT COUNT(*) as c FROM todos WHERE assignee='paolo' AND queue='human' AND todo_type='match' AND completed=0").get() as any).c as number;
    let willSlots  = Math.max(0, TOP_N_PER_PERSON - willOpen);
    let paoloSlots = Math.max(0, TOP_N_PER_PERSON - paoloOpen);

    // Fetch matches for this batch, sorted best-first.
    // Also pull denison_url from parsed_listings if already cached.
    const matches = db.prepare(`
      SELECT lm.*, pl.make, pl.model, pl.year, pl.loa, pl.asking_price,
             pl.location, pl.section, pl.brokerage, pl.listing_url,
             COALESCE(pl.denison_url,'') AS denison_url,
             l.first_name, l.last_name,
             l.email AS lead_email, l.phone AS lead_phone
      FROM listing_matches lm
      JOIN parsed_listings pl ON lm.listing_id = pl.id
      LEFT JOIN leads l ON lm.lead_id = l.id
      WHERE lm.batch_id = ? AND lm.match_score >= ?
      ORDER BY lm.match_score DESC
    `).all(batchId, BOT_THRESHOLD) as any[];

    for (const m of matches) {
      // ── Re-score to get positiveHits (stored score used for ordering,
      //    but we need hits to gate human vs bot) ────────────────────────────
      // positiveHits is NOT stored in DB — derive from reasons count as proxy.
      // reasons are only added when there's a real signal, so reasons.length ≈ positiveHits.
      const storedReasons: string[] = (() => { try { return JSON.parse(m.reasons || "[]"); } catch { return []; } })();
      const positiveHits = storedReasons.length;

      // ── Human vs bot decision ─────────────────────────────────────────────
      const qualifiesHuman = m.match_score >= HUMAN_THRESHOLD && positiveHits >= MIN_POSITIVE_HITS;
      const isHuman = qualifiesHuman;
      const queue   = isHuman ? "human" : "bot";

      // Routing: section tag determines assignee
      const section  = (m.section || "").toLowerCase();
      const assignee = section.includes("global") || section.includes("outside") ? "paolo" : "will";

      // ── Cap check ─────────────────────────────────────────────────────────
      if (isHuman) {
        if (assignee === "will"  && willSlots  <= 0) continue;
        if (assignee === "paolo" && paoloSlots <= 0) continue;
      } else {
        if (botCreated >= TOP_N_BOT) continue;
      }

      const boatLabel    = [m.make, m.model, m.year ? `(${m.year})` : "", m.loa ? `${m.loa}'` : ""]
        .filter(Boolean).map((s: string) => s.toString().trim().replace(/\n/g, " ")).join(" ").trim() || "Unknown vessel";
      const prospectName = [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown prospect";
      const firstName    = m.first_name || "there";
      // Safe price formatting — strip $ and commas before Number(), then re-format
      const rawPrice = (m.asking_price || "").toString().replace(/[$,\s]/g, "");
      const numPrice = parseFloat(rawPrice);
      const price = !isNaN(numPrice) && numPrice > 0
        ? `$${numPrice.toLocaleString()}`
        : m.asking_price || "";

      // Dedup: skip if this lead already has an open match todo for the same vessel
      // Strategy: URL match first (most reliable), then make+loa+year fingerprint fallback
      const dupByUrl = m.listing_url
        ? db.prepare(`
            SELECT t.id FROM todos t
            JOIN parsed_listings pl ON pl.id = t.listing_id
            WHERE t.lead_id=? AND t.completed=0 AND t.todo_type='match'
              AND pl.listing_url=? AND pl.listing_url != ''
          `).get(m.lead_id || -1, m.listing_url) as any
        : null;
      const dupByFingerprint = !dupByUrl
        ? db.prepare(`
            SELECT t.id FROM todos t
            JOIN parsed_listings pl ON pl.id = t.listing_id
            WHERE t.lead_id=? AND t.completed=0 AND t.todo_type='match'
              AND LOWER(REPLACE(pl.make,' ',''))=LOWER(REPLACE(?,' ',''))
              AND REPLACE(REPLACE(pl.loa,'''',''),'ft','')=REPLACE(REPLACE(?,' ft',''),' ','')
              AND pl.year=?
          `).get(m.lead_id || -1, m.make || "", m.loa || "", m.year || "") as any
        : null;
      const dupById = (!dupByUrl && !dupByFingerprint)
        ? db.prepare("SELECT id FROM todos WHERE lead_id=? AND listing_id=? AND completed=0").get(m.lead_id || -1, m.listing_id) as any
        : null;
      if (dupByUrl || dupByFingerprint || dupById) continue;

      const reasons  = storedReasons;
      const topReason = reasons[0] || "";

      const todoText = `🚢 Send ${boatLabel}${price ? ` — ${price}` : ""} to ${prospectName}${topReason ? ` (${topReason})` : ""} [Score: ${m.match_score}]`;

      // ── Build links ──────────────────────────────────────────────────────
      const cleanBoatWizardUrl = m.listing_url ? (() => {
        try {
          const u = new URL(m.listing_url);
          const id = u.searchParams.get("id");
          return id ? `https://psp.boatwizard.com/boat?id=${id}` : m.listing_url;
        } catch { return m.listing_url; }
      })() : null;

      // Use cached denison_url if available, otherwise a filtered search URL
      const makeSlug = (m.make || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const denisonCached = (m.denison_url || "").trim();
      const denisonFallback = makeSlug
        ? `https://www.denisonyachtsales.com/yachts-for-sale/?make=${encodeURIComponent(m.make || "")}`
        : `https://www.denisonyachtsales.com/yachts-for-sale/`;
      const denisonLink = `🏢 Denison listing: ${denisonCached || denisonFallback}`;

      // NO raw YachtWorld link — we never send prospects to outside brokers directly.
      // The Denison URL (or filtered Denison search) is the only outbound link.

      const specLines = [
        m.year     ? `Year:      ${m.year}`     : null,
        m.loa      ? `LOA:       ${m.loa}'`     : null,
        price      ? `Asking:    ${price}`       : null,
        m.location ? `Location:  ${m.location}` : null,
        m.brokerage ? `Listed by: ${m.brokerage}` : null,
      ].filter(Boolean) as string[];

      const storedConflicts: string[] = (() => { try { return JSON.parse(m.conflicts || "[]"); } catch { return []; } })();
      const storedPenalties: string[] = (() => { try { return JSON.parse(m.penalty_log || "[]"); } catch { return []; } })();

      const emailDraft = [
        `To: ${m.lead_email || "[client email]"}`,
        `Subject: ${boatLabel} — I Think This One's Worth a Look`,
        ``,
        `Hi ${firstName},`,
        ``,
        `I was going through some new listings this week and this one immediately made me think of you — a ${boatLabel}${m.location ? `, currently in ${m.location}` : ""}${price ? ` asking ${price}` : ""}.`,
        ``,
        specLines.length > 0 ? `Quick specs:\n${specLines.join("\n")}\n` : "",
        `I'd love to get your thoughts on it. A few ways I can help from here:`,
        ``,
        `→ Schedule a call — happy to walk you through everything I know about this one`,
        `→ Get videos or a virtual tour — I can reach out to the listing broker and request footage`,
        `→ Arrange a showing — if you want to get eyes on her in person, let's set it up`,
        ``,
        `Links:`,
        cleanBoatWizardUrl ? `🔗 BoatWizard listing: ${cleanBoatWizardUrl}` : "(No direct listing link)",
        denisonLink,
        ``,
        `Just reply with whatever works — no pressure, just thought you should know about this one.`,
        ``,
        `Best,\nWill Noftsinger\nDenison Yachting\n850.461.3342 | WN@DenisonYachting.com`,
        // ── Machine-readable metadata (stripped before copy, parsed for card display) ──
        ``,
        `---match-metadata---`,
        `score:${m.match_score}`,
        `hits:${positiveHits}`,
        reasons.length  ? `signals:${reasons.join(" | ")}`  : "",
        storedConflicts.length ? `conflicts:${storedConflicts.join(" | ")}` : "",
        storedPenalties.length ? `penalties:${storedPenalties.join(" | ")}` : "",
        `---`,
      ].filter(l => l !== null && l !== undefined).join("\n");

      // assignee is already set above (from section tag before cap check)
      db.prepare(`
        INSERT INTO todos (text, priority, lead_id, listing_id, due_date, assignee, email_draft, todo_type, queue, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'match', ?, ?, ?)
      `).run(todoText, isHuman ? "high" : "normal", m.lead_id || null, m.listing_id || null,
             today, assignee, emailDraft, queue, now, now);

      if (isHuman) {
        humanCreated++;
        if (assignee === "will")  willSlots--;
        else                      paoloSlots--;
      } else {
        botCreated++;
      }
    }

    return { human: humanCreated, bot: botCreated };
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

// ─── Phase 1: Dismissal Memory ─────────────────────────────────────────────

/**
 * Called when a broker dismisses a match todo.
 * Records the listing_id in the lead's dismissed_listing_ids array so it
 * never resurfaces in future batches. Also marks the listing_match as dismissed.
 */
export function dismissMatch(matchId: number, leadId: number | null, listingId: number, broker: string) {
  const db = getDb();
  try {
    initMatchTables();
    const now = new Date().toISOString();

    // Mark the listing_match record as dismissed
    db.prepare("UPDATE listing_matches SET status = 'dismissed', contacted_at = ? WHERE id = ?")
      .run(now, matchId);

    // Add listing_id to lead's dismissed_listing_ids
    if (leadId) {
      const lead = db.prepare("SELECT dismissed_listing_ids FROM leads WHERE id = ?").get(leadId) as any;
      if (lead) {
        const current: number[] = (() => {
          try { return JSON.parse(lead.dismissed_listing_ids || "[]"); } catch { return []; }
        })();
        if (!current.includes(listingId)) {
          current.push(listingId);
          db.prepare("UPDATE leads SET dismissed_listing_ids = ? WHERE id = ?")
            .run(JSON.stringify(current), leadId);
        }
      }
    }

    // Log the dismissal in exposure log
    try {
      db.prepare(`INSERT INTO match_exposure_log
        (match_id, lead_id, listing_id, surfaced_in, surfaced_at, broker_action, action_at, assigned_broker)
        VALUES (?, ?, ?, 'todos', ?, 'dismissed', ?, ?)`
      ).run(matchId, leadId ?? 0, listingId, now, now, broker);
    } catch { /* non-fatal */ }
  } finally { db.close(); }
}

/**
 * Log when a match is surfaced to a broker (for exposure tracking).
 */
export function logMatchExposure(matchId: number, leadId: number, listingId: number,
  surface: string, broker: string, action = "") {
  const db = getDb();
  try {
    initMatchTables();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO match_exposure_log
      (match_id, lead_id, listing_id, surfaced_in, surfaced_at, broker_action, action_at, assigned_broker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(matchId, leadId, listingId, surface, now, action, action ? now : "", broker);
  } catch { /* non-fatal — exposure log is optional */ }
  finally { db.close(); }
}
