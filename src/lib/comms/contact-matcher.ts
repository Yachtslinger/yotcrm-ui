/**
 * src/lib/comms/contact-matcher.ts
 * Deterministic contact matching — no AI involved.
 * 3-tier: email exact → phone exact → name exact
 * Returns best match with confidence score and method.
 */
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

export type MatchResult = {
  lead_id: number | null;
  match_method: "email_exact" | "phone_exact" | "name_exact" | "created_new" | "no_match";
  confidence: number;
  lead?: { id: number; first_name: string; last_name: string; email: string; phone: string };
};

function normalizePhone(p: string): string {
  return (p || "").replace(/[^\d]/g, "");
}
function normalizeName(n: string): string {
  return (n || "").trim().toLowerCase();
}

export function matchContact(opts: {
  email?: string; phone?: string;
  first_name?: string; last_name?: string;
}): MatchResult {
  const db = getDb();
  try {
    // Tier 1 — email exact
    if (opts.email) {
      const row = db.prepare("SELECT id, first_name, last_name, email, phone FROM leads WHERE email = ? COLLATE NOCASE LIMIT 1").get(opts.email.trim().toLowerCase()) as { id: number; first_name: string; last_name: string; email: string; phone: string } | undefined;
      if (row) return { lead_id: row.id, match_method: "email_exact", confidence: 0.99, lead: row };
    }
    // Tier 2 — phone exact
    if (opts.phone) {
      const normalized = normalizePhone(opts.phone);
      if (normalized.length >= 7) {
        const row = db.prepare("SELECT id, first_name, last_name, email, phone FROM leads WHERE replace(replace(replace(replace(replace(phone,' ',''),'-',''),'.',''),'(',''),')','') = ? LIMIT 1").get(normalized) as { id: number; first_name: string; last_name: string; email: string; phone: string } | undefined;
        if (row) return { lead_id: row.id, match_method: "phone_exact", confidence: 0.95, lead: row };
      }
    }
    // Tier 3 — name exact (first + last)
    if (opts.first_name && opts.last_name) {
      const fn = normalizeName(opts.first_name);
      const ln = normalizeName(opts.last_name);
      const row = db.prepare("SELECT id, first_name, last_name, email, phone FROM leads WHERE lower(trim(first_name)) = ? AND lower(trim(last_name)) = ? LIMIT 1").get(fn, ln) as { id: number; first_name: string; last_name: string; email: string; phone: string } | undefined;
      if (row) return { lead_id: row.id, match_method: "name_exact", confidence: 0.75, lead: row };
    }
    return { lead_id: null, match_method: "no_match", confidence: 0 };
  } finally { db.close(); }
}

/** Create a new lead from comm data. Returns the new lead id. */
export function createLeadFromComm(opts: {
  email?: string; phone?: string; first_name?: string; last_name?: string;
  company?: string; source?: string; notes?: string;
}): number {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, tags, notes, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'), datetime('now'))
    `).run(
      opts.first_name ?? "", opts.last_name ?? "",
      (opts.email ?? "").toLowerCase(), opts.phone ?? "",
      "comms_capture", opts.notes ?? "", opts.source ?? "comms_capture"
    );
    return result.lastInsertRowid as number;
  } finally { db.close(); }
}

/** Apply approved extraction fields to an existing lead — write corrections, never overwrite silently */
export function applyExtractionToLead(leadId: number, fields: {
  email?: string; phone?: string; first_name?: string; last_name?: string; company?: string; notes?: string;
  // Yacht preference fields from comms extraction
  intent?: string;
  budget_range?: string;       // e.g. "$2M-$4M" — parsed into budget_min/budget_max
  timeline?: string;
  yacht_makes?: string[];
  yacht_models?: string[];
  yacht_length_range?: string; // e.g. "70-100ft" — parsed into loa_min/loa_max
  year_range?: string;         // e.g. "2018-2024" — parsed into year_min/year_max
  location_pref?: string;
  features_mentioned?: string[];
  lead_category?: string;      // hot|warm|cold|broker|...
  summary?: string;            // for broker_notes append
}): { written: string[]; conflicts: { field: string; existing: string; incoming: string }[] } {
  const db = getDb();
  const written: string[] = [];
  const conflicts: { field: string; existing: string; incoming: string }[] = [];
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as Record<string, string> | undefined;
    if (!lead) return { written, conflicts };

    // Build column → value mapping from extraction fields
    // company is stored as employer; budget_range expands to budget_min/budget_max; etc.
    const mapping: Record<string, string | undefined> = {
      email: fields.email,
      phone: fields.phone,
      first_name: fields.first_name,
      last_name: fields.last_name,
      employer: fields.company,
      // Yacht preferences ↔ existing buyer-criteria columns
      preferred_location: fields.location_pref,
      make_preference: fields.yacht_makes?.length ? fields.yacht_makes.join(", ") : undefined,
    };

    // Parse budget_range "$2M-$4M" or "$5,000,000 - $8,000,000" into min/max
    if (fields.budget_range) {
      const parsed = parseRange(fields.budget_range, parseDollarAmount);
      if (parsed.min) mapping.budget_min = parsed.min.toString();
      if (parsed.max) mapping.budget_max = parsed.max.toString();
    }
    // Parse yacht_length_range "70-100ft" into loa_min/loa_max
    if (fields.yacht_length_range) {
      const parsed = parseRange(fields.yacht_length_range, parseFootAmount);
      if (parsed.min) mapping.loa_min = parsed.min.toString();
      if (parsed.max) mapping.loa_max = parsed.max.toString();
    }
    // Parse year_range "2018-2024" into year_min/year_max
    if (fields.year_range) {
      const parsed = parseRange(fields.year_range, (s) => parseInt(s.replace(/\D/g, ""), 10));
      if (parsed.min) mapping.year_min = parsed.min.toString();
      if (parsed.max) mapping.year_max = parsed.max.toString();
    }

    const updates: string[] = [];
    const vals: unknown[] = [];

    for (const [col, newVal] of Object.entries(mapping)) {
      if (newVal === undefined || newVal === null || newVal === "") continue;
      const existing = (lead[col] as string | undefined) ?? "";
      const isEmpty = !existing || existing.trim() === "" || existing === "[]";
      if (isEmpty) {
        updates.push(`${col} = ?`);
        vals.push(newVal);
        written.push(col);
      } else if (existing.trim() !== String(newVal).trim()) {
        conflicts.push({ field: col, existing: existing.trim(), incoming: String(newVal).trim() });
      }
    }

    // Append summary + facts to broker_notes (append-only history)
    if (fields.summary || fields.features_mentioned?.length || fields.yacht_models?.length || fields.timeline || fields.intent) {
      const existingNotes = (lead.broker_notes as string | undefined) ?? "";
      const ts = new Date().toISOString().substring(0, 10);
      const lines: string[] = [`[Comms ${ts}]`];
      if (fields.summary) lines.push(fields.summary);
      if (fields.intent) lines.push(`  intent: ${fields.intent}`);
      if (fields.timeline) lines.push(`  timeline: ${fields.timeline}`);
      if (fields.yacht_models?.length) lines.push(`  models of interest: ${fields.yacht_models.join(", ")}`);
      if (fields.features_mentioned?.length) lines.push(`  features mentioned: ${fields.features_mentioned.join(", ")}`);
      const appended = (existingNotes ? existingNotes + "\n\n" : "") + lines.join("\n");
      updates.push("broker_notes = ?");
      vals.push(appended);
      written.push("broker_notes");
    }

    // Apply lead_category as a tag rather than overwriting status
    if (fields.lead_category && fields.lead_category !== "internal") {
      const existingTags = (lead.tags as string | undefined) ?? "";
      const tagList = existingTags.split(",").map(t => t.trim()).filter(Boolean);
      const newTag = `comms_${fields.lead_category}`;
      if (!tagList.includes(newTag)) {
        tagList.push(newTag);
        updates.push("tags = ?");
        vals.push(tagList.join(", "));
        written.push("tags");
      }
    }

    if (updates.length) {
      vals.push(leadId);
      db.prepare(`UPDATE leads SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
    }
    return { written, conflicts };
  } finally { db.close(); }
}

// ── Range parsing helpers ───────────────────────────────────────────────────
function parseRange<T extends number>(s: string, parser: (token: string) => T | null | undefined): { min?: T; max?: T } {
  if (!s) return {};
  // Normalize: replace various dashes with `-`, strip surrounding whitespace
  const clean = s.replace(/[–—~to]+/gi, "-").replace(/\s+/g, "");
  const parts = clean.split("-").filter(Boolean);
  if (parts.length === 1) {
    const v = parser(parts[0]);
    return v != null ? { min: v, max: v } : {};
  }
  if (parts.length >= 2) {
    const min = parser(parts[0]);
    const max = parser(parts[1]);
    return { min: min ?? undefined, max: max ?? undefined };
  }
  return {};
}

function parseDollarAmount(s: string): number | null {
  // "$2M" -> 2000000, "$500k" -> 500000, "$2,500,000" -> 2500000
  if (!s) return null;
  const t = s.replace(/[$,\s]/g, "").toLowerCase();
  const m = t.match(/^([\d.]+)([kmb])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : m[2] === "b" ? 1_000_000_000 : 1;
  return Math.round(n * mult);
}

function parseFootAmount(s: string): number | null {
  // "70ft" -> 70, "100'" -> 100, "70" -> 70
  if (!s) return null;
  const m = s.match(/^([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : Math.round(n);
}
