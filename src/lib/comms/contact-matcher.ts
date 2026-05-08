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
}) {
  const db = getDb();
  try {
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as Record<string, string> | undefined;
    if (!lead) return;
    const updates: string[] = [];
    const vals: unknown[] = [];
    for (const [key, newVal] of Object.entries(fields)) {
      if (!newVal) continue;
      const dbKey = key === "company" ? "employer" : key;
      const existing = lead[dbKey] as string | undefined;
      // Only write if field is currently empty
      if (!existing || existing.trim() === "") {
        updates.push(`${dbKey} = ?`);
        vals.push(newVal);
      }
      // If field has a different value, log but don't overwrite
    }
    if (updates.length) {
      vals.push(leadId);
      db.prepare(`UPDATE leads SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
    }
  } finally { db.close(); }
}
