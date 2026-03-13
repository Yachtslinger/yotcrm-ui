import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Types ──────────────────────────────────────────────────────────

export type EnrichmentProfile = {
  id: number;
  lead_id: number;
  score: number;
  score_band: string;
  score_breakdown: string;
  identity_data: string;
  capital_data: string;
  risk_data: string;
  engagement_data: string;
  // 5-layer sub-scores
  identity_score: number;
  capital_score: number;
  risk_score: number;
  digital_score: number;
  engagement_score: number;
  summary: string;
  strategy_notes: string;
  leverage_notes: string;
  manual_override: number;
  override_score: number | null;
  override_reason: string;
  enrichment_status: string;
  last_enriched_at: string;
  created_at: string;
  updated_at: string;
};

export type EnrichmentSource = {
  id: number;
  profile_id: number;
  lead_id: number;
  source_type: string;         // "ofac" | "sec_edgar" | "opencorporates" | "uscg" | "faa" | "domain" | "manual" | etc.
  source_url: string;
  source_label: string;        // human-readable label
  layer: string;               // "identity" | "capital" | "risk" | "engagement"
  data_key: string;            // e.g. "corporate_role", "vessel_registration", "bankruptcy_flag"
  data_value: string;          // JSON or plain string
  confidence: number;          // 0-100 confidence in this data point
  fetched_at: string;
};

export type AuditLogEntry = {
  id: number;
  lead_id: number;
  action: string;              // "enrich_triggered" | "source_fetched" | "score_computed" | "override" | "opt_out"
  actor: string;               // "system" | broker name
  detail: string;              // JSON with context
  created_at: string;
};

export type ScoreWeight = {
  id: number;
  factor: string;              // e.g. "verified_business_ownership"
  label: string;               // human-readable
  points: number;              // positive or negative
  category: string;            // "identity" | "capital" | "risk" | "engagement"
  active: number;              // 0 or 1
};

// ─── Structured Layer Types ─────────────────────────────────────────

export type IdentityLayer = {
  employment_history: { company: string; role: string; years?: string; source_id?: number }[];
  corporate_roles: { company: string; title: string; source_id?: number }[];
  business_ownership: { company: string; jurisdiction?: string; status?: string; source_id?: number }[];
  years_active: number | null;
  cross_source_consistency: number;  // 0-100
};

export type CapitalLayer = {
  executive_roles: boolean;
  prior_exits: { company: string; detail?: string; source_id?: number }[];
  vessel_registrations: { name: string; hin?: string; source_id?: number }[];
  aircraft_registrations: { n_number: string; type?: string; source_id?: number }[];
  property_signals: { location: string; estimated_value?: string; source_id?: number }[];
  industry_indicators: string[];
};

export type RiskLayer = {
  litigation_count: number;
  bankruptcy_flag: boolean;
  fraud_indicators: { detail: string; source_id?: number }[];
  sanctions_flag: boolean;
  sanctions_detail: string | null;
  regulatory_actions: { detail: string; source_id?: number }[];
};

export type EngagementLayer = {
  email_tone: string | null;           // "professional" | "casual" | "aggressive" | "vague"
  urgency_level: string | null;        // "high" | "medium" | "low"
  inquiry_specificity: string | null;  // "specific" | "general" | "exploratory"
  response_time_avg_hours: number | null;
  follow_up_count: number;
};

// ─── Init Tables ────────────────────────────────────────────────────

export function initIntelTables() {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS enrichment_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL UNIQUE,
        score INTEGER DEFAULT 0,
        score_band TEXT DEFAULT 'unverified',
        score_breakdown TEXT DEFAULT '[]',
        identity_data TEXT DEFAULT '{}',
        capital_data TEXT DEFAULT '{}',
        risk_data TEXT DEFAULT '{}',
        engagement_data TEXT DEFAULT '{}',
        summary TEXT DEFAULT '',
        strategy_notes TEXT DEFAULT '',
        leverage_notes TEXT DEFAULT '',
        manual_override INTEGER DEFAULT 0,
        override_score INTEGER,
        override_reason TEXT DEFAULT '',
        enrichment_status TEXT DEFAULT 'pending',
        last_enriched_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_enrichment_lead ON enrichment_profiles(lead_id);
      CREATE INDEX IF NOT EXISTS idx_enrichment_score ON enrichment_profiles(score);
      CREATE INDEX IF NOT EXISTS idx_enrichment_band ON enrichment_profiles(score_band);

      CREATE TABLE IF NOT EXISTS enrichment_sources (
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
        fetched_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES enrichment_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_esrc_profile ON enrichment_sources(profile_id);
      CREATE INDEX IF NOT EXISTS idx_esrc_lead ON enrichment_sources(lead_id);
      CREATE INDEX IF NOT EXISTS idx_esrc_type ON enrichment_sources(source_type);

      CREATE TABLE IF NOT EXISTS enrichment_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        actor TEXT DEFAULT 'system',
        detail TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_audit_lead ON enrichment_audit_log(lead_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON enrichment_audit_log(action);

      CREATE TABLE IF NOT EXISTS score_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factor TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        points INTEGER NOT NULL,
        category TEXT NOT NULL,
        active INTEGER DEFAULT 1
      );
    `);

    // Add sub-score columns (safe migration)
    const subScoreCols = [
      ["identity_score", "INTEGER DEFAULT 0"],
      ["capital_score", "INTEGER DEFAULT 0"],
      ["risk_score", "INTEGER DEFAULT 0"],
      ["digital_score", "INTEGER DEFAULT 0"],
      ["engagement_score", "INTEGER DEFAULT 0"],
    ];
    for (const [col, def] of subScoreCols) {
      try { db.exec(`ALTER TABLE enrichment_profiles ADD COLUMN ${col} ${def}`); } catch { /* exists */ }
    }

    // Always run seed — INSERT OR IGNORE safely adds new factors without touching existing
    seedDefaultWeights(db);
  } finally {
    db.close();
  }
}

function seedDefaultWeights(db: Database.Database) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO score_weights (factor, label, points, category) VALUES (?, ?, ?, ?)"
  );
  const defaults: [string, string, number, string][] = [
    // Identity — positive
    ["verified_business_ownership", "Verified Business Ownership", 20, "identity"],
    ["csuite_role", "C-Suite Executive Role", 15, "identity"],
    ["multi_year_history", "Multi-Year Operating History (5+)", 10, "identity"],
    ["cross_source_match", "Cross-Source Identity Match", 5, "identity"],
    // Capital — positive
    ["property_ownership", "Public Property Ownership (High Value)", 10, "capital"],
    ["aircraft_registration", "Aircraft Registration (FAA)", 10, "capital"],
    ["vessel_registration", "Vessel Registration (USCG)", 10, "capital"],
    ["prior_company_exit", "Prior Company Exit / Acquisition", 10, "capital"],
    ["media_presence", "Media / Press Presence", 5, "capital"],
    // Risk — negative
    ["prior_bankruptcy", "Prior Bankruptcy Filing", -15, "risk"],
    ["fraud_litigation", "Fraud-Related Litigation", -25, "risk"],
    ["sanctions_flag", "OFAC Sanctions Flag", -40, "risk"],
    ["regulatory_action", "Regulatory Action / Enforcement", -10, "risk"],
    ["litigation_frequent", "Frequent Litigation (3+)", -5, "risk"],
    // Engagement — positive
    ["specific_inquiry", "Specific Vessel Inquiry", 5, "engagement"],
    ["fast_response", "Fast Response Time (<24h)", 5, "engagement"],
    ["professional_tone", "Professional Email Tone", 3, "engagement"],
    // FEC & Social — positive
    ["political_donor", "Political Donor (FEC)", 12, "capital"],
    ["verified_employer", "Verified Employer (FEC)", 8, "identity"],
    ["verified_location", "Verified Location (FEC)", 5, "identity"],
    ["social_presence", "Social Media Profiles Found", 5, "identity"],
    ["news_coverage", "News/Media Coverage", 8, "identity"],
    // Web search & nonprofit — positive
    ["web_executive_mention", "Executive Role Found (Web)", 10, "identity"],
    ["yacht_club_member", "Yacht/Boat Club Membership", 8, "engagement"],
    ["charity_board_member", "Charity/Foundation Board Seat", 10, "capital"],
    ["nonprofit_officer", "Nonprofit Officer (IRS 990)", 12, "capital"],
    ["wealth_signal", "Wealth Signal (Web)", 8, "capital"],
    ["home_ownership", "Home/Property Record Found", 10, "capital"],
    ["company_verified", "Company Details Verified", 8, "capital"],
    // Phase 2 — Re-verification & deep dive
    ["identity_reverified", "Identity Re-Verified (Targeted Search)", 15, "identity"],
    ["multiple_addresses", "Multiple Addresses Discovered", 8, "identity"],
    ["relatives_found", "Associates/Relatives Found", 5, "identity"],
    ["professional_history", "Professional History Discovered", 8, "identity"],
    ["multiple_properties", "Multiple Properties Found", 12, "capital"],
    ["court_record_clean", "Clean Court Record", 5, "capital"],
    ["court_bankruptcy", "Bankruptcy Record Found", -20, "risk"],
    ["court_lien", "Lien/Foreclosure Record Found", -10, "risk"],
    ["court_lawsuit", "Litigation Record Found", -5, "risk"],
  ];
  for (const [factor, label, points, category] of defaults) {
    insert.run(factor, label, points, category);
  }
}

// ─── CRUD: Profiles ─────────────────────────────────────────────────

export function getProfileByLeadId(leadId: number): EnrichmentProfile | null {
  const db = getDb();
  try {
    initIntelTables();
    return (db.prepare("SELECT * FROM enrichment_profiles WHERE lead_id = ?").get(leadId) as EnrichmentProfile) || null;
  } finally { db.close(); }
}

export function upsertProfile(leadId: number, data: Partial<EnrichmentProfile>): number {
  const db = getDb();
  try {
    initIntelTables();
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM enrichment_profiles WHERE lead_id = ?").get(leadId) as any;

    if (existing) {
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "id" || k === "lead_id" || k === "created_at") continue;
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      sets.push("updated_at = ?");
      vals.push(now);
      vals.push(existing.id);
      db.prepare(`UPDATE enrichment_profiles SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO enrichment_profiles (lead_id, score, score_band, score_breakdown,
          identity_data, capital_data, risk_data, engagement_data,
          identity_score, capital_score, risk_score, digital_score, engagement_score,
          summary, strategy_notes, leverage_notes, enrichment_status,
          last_enriched_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leadId,
        data.score ?? 0, data.score_band ?? "unverified", data.score_breakdown ?? "[]",
        data.identity_data ?? "{}", data.capital_data ?? "{}", data.risk_data ?? "{}",
        data.engagement_data ?? "{}",
        data.identity_score ?? 0, data.capital_score ?? 0, data.risk_score ?? 0,
        data.digital_score ?? 0, data.engagement_score ?? 0,
        data.summary ?? "", data.strategy_notes ?? "", data.leverage_notes ?? "",
        data.enrichment_status ?? "pending", data.last_enriched_at ?? null, now, now
      );
      return Number(result.lastInsertRowid);
    }
  } finally { db.close(); }
}

// ─── CRUD: Sources ──────────────────────────────────────────────────

export function addSource(source: Omit<EnrichmentSource, "id">): number {
  const db = getDb();
  try {
    initIntelTables();
    const result = db.prepare(`
      INSERT INTO enrichment_sources (profile_id, lead_id, source_type, source_url, source_label,
        layer, data_key, data_value, confidence, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source.profile_id, source.lead_id, source.source_type, source.source_url,
      source.source_label, source.layer, source.data_key, source.data_value,
      source.confidence, source.fetched_at
    );
    return Number(result.lastInsertRowid);
  } finally { db.close(); }
}

export function getSourcesByProfile(profileId: number): EnrichmentSource[] {
  const db = getDb();
  try {
    initIntelTables();
    return db.prepare("SELECT * FROM enrichment_sources WHERE profile_id = ? ORDER BY fetched_at DESC")
      .all(profileId) as EnrichmentSource[];
  } finally { db.close(); }
}

export function getSourcesByLead(leadId: number): EnrichmentSource[] {
  const db = getDb();
  try {
    initIntelTables();
    return db.prepare("SELECT * FROM enrichment_sources WHERE lead_id = ? ORDER BY fetched_at DESC")
      .all(leadId) as EnrichmentSource[];
  } finally { db.close(); }
}

// ─── CRUD: Audit Log ────────────────────────────────────────────────

export function logAuditEvent(leadId: number, action: string, actor: string = "system", detail: object = {}) {
  const db = getDb();
  try {
    initIntelTables();
    db.prepare(`
      INSERT INTO enrichment_audit_log (lead_id, action, actor, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(leadId, action, actor, JSON.stringify(detail), new Date().toISOString());
  } finally { db.close(); }
}

export function getAuditLog(leadId: number): AuditLogEntry[] {
  const db = getDb();
  try {
    initIntelTables();
    return db.prepare("SELECT * FROM enrichment_audit_log WHERE lead_id = ? ORDER BY created_at DESC")
      .all(leadId) as AuditLogEntry[];
  } finally { db.close(); }
}

// ─── CRUD: Score Weights ────────────────────────────────────────────

export function getWeights(): ScoreWeight[] {
  const db = getDb();
  try {
    initIntelTables();
    return db.prepare("SELECT * FROM score_weights ORDER BY category, points DESC").all() as ScoreWeight[];
  } finally { db.close(); }
}

export function getActiveWeights(): ScoreWeight[] {
  const db = getDb();
  try {
    initIntelTables();
    return db.prepare("SELECT * FROM score_weights WHERE active = 1 ORDER BY category, points DESC")
      .all() as ScoreWeight[];
  } finally { db.close(); }
}

export function updateWeight(id: number, updates: { points?: number; active?: number; label?: string }): boolean {
  const db = getDb();
  try {
    initIntelTables();
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.points !== undefined) { sets.push("points = ?"); vals.push(updates.points); }
    if (updates.active !== undefined) { sets.push("active = ?"); vals.push(updates.active); }
    if (updates.label !== undefined) { sets.push("label = ?"); vals.push(updates.label); }
    if (sets.length === 0) return false;
    vals.push(id);
    const result = db.prepare(`UPDATE score_weights SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return result.changes > 0;
  } finally { db.close(); }
}

// ─── Manual Override ────────────────────────────────────────────────

export function overrideScore(leadId: number, score: number, reason: string, actor: string): boolean {
  const db = getDb();
  try {
    initIntelTables();
    const band = scoreBand(score);
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE enrichment_profiles
      SET manual_override = 1, override_score = ?, override_reason = ?,
          score = ?, score_band = ?, updated_at = ?
      WHERE lead_id = ?
    `).run(score, reason, score, band, now, leadId);

    if (result.changes > 0) {
      logAuditEvent(leadId, "override", actor, { score, reason });
    }
    return result.changes > 0;
  } finally { db.close(); }
}

// ─── Opt-Out (GDPR/CCPA compliance) ────────────────────────────────

export function optOutLead(leadId: number, actor: string): boolean {
  const db = getDb();
  try {
    initIntelTables();
    // Delete all enrichment data for this lead
    const profile = db.prepare("SELECT id FROM enrichment_profiles WHERE lead_id = ?").get(leadId) as any;
    if (profile) {
      db.prepare("DELETE FROM enrichment_sources WHERE profile_id = ?").run(profile.id);
      db.prepare("DELETE FROM enrichment_profiles WHERE id = ?").run(profile.id);
    }
    logAuditEvent(leadId, "opt_out", actor, { reason: "Lead or broker requested data removal" });
    return true;
  } finally { db.close(); }
}

// ─── Helpers ────────────────────────────────────────────────────────

export function scoreBand(score: number): string {
  if (score >= 80) return "high_confidence";
  if (score >= 60) return "likely_legitimate";
  if (score >= 40) return "unverified";
  return "elevated_risk";
}

export function scoreBandLabel(band: string): string {
  const labels: Record<string, string> = {
    high_confidence: "High Confidence Capital",
    likely_legitimate: "Likely Legitimate",
    unverified: "Unverified",
    elevated_risk: "Elevated Risk",
  };
  return labels[band] || "Unknown";
}

// ─── List / Dashboard ───────────────────────────────────────────────

export function listProfiles(options?: { band?: string; minScore?: number }): (EnrichmentProfile & { first_name: string; last_name: string; email: string })[] {
  const db = getDb();
  try {
    initIntelTables();
    let sql = `
      SELECT ep.*, l.first_name, l.last_name, l.email
      FROM enrichment_profiles ep
      JOIN leads l ON l.id = ep.lead_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (options?.band) { sql += " AND ep.score_band = ?"; params.push(options.band); }
    if (options?.minScore) { sql += " AND ep.score >= ?"; params.push(options.minScore); }
    sql += " ORDER BY ep.score DESC";
    return db.prepare(sql).all(...params) as any[];
  } finally { db.close(); }
}
