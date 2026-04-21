import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type NoteCategory =
  | "buyer_preference"   // what they want in a boat
  | "seller_motivation"  // selling signals, motivation, timing
  | "family"             // spouse, partner, decision dynamics
  | "timeline"           // when they want to move
  | "budget"             // money, price, financing signals
  | "boat_history"       // what they've owned or come from
  | "hot_lead"           // urgency and readiness signals
  | "objection"          // hesitation, pushback, concerns
  | "deal_blocker"       // hard stops: survey, lien, legal, financing
  | "general";           // fallback — no badge shown

export type NoteIntent = "informational" | "action_required" | "review_needed";

export type NoteRecord = {
  id: number;
  lead_id: number;
  raw_text: string;
  categories: string;       // JSON array e.g. '["buyer_preference","timeline"]'
  intent: NoteIntent;
  importance: number;       // 0–100
  parse_reason: string;     // JSON — why the parser made each decision
  created_by: string;       // "will" | "paolo" | "system"
  created_at: string;
  updated_at: string;
};

export type NoteRecordParsed = Omit<NoteRecord, "categories"> & {
  categories: NoteCategory[];
};

export type FollowUpRecord = {
  id: number;
  note_id: number | null;
  lead_id: number;
  title: string;
  due_date: string | null;
  due_confidence: string;   // "explicit" | "inferred" | "suggested" | "none"
  priority: string;         // "high" | "medium" | "low"
  status: string;           // "pending" | "completed" | "dismissed" | "snoozed"
  assignee: string;
  created_at: string;
  completed_at: string | null;
  snoozed_until: string | null;
  lead_name?: string;
  lead_email?: string;
};

// ─── Table init ──────────────────────────────────────────────────────────────

let _notesReady = false;
export function ensureNotesTables() {
  if (_notesReady) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS client_notes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        raw_text    TEXT    NOT NULL,
        categories  TEXT    NOT NULL DEFAULT '["general"]',
        intent      TEXT    NOT NULL DEFAULT 'informational',
        importance  INTEGER NOT NULL DEFAULT 50,
        parse_reason TEXT   NOT NULL DEFAULT '{}',
        created_by  TEXT    NOT NULL DEFAULT 'will',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notes_lead ON client_notes(lead_id, created_at DESC);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_followups (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id        INTEGER REFERENCES client_notes(id) ON DELETE CASCADE,
        lead_id        INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        title          TEXT    NOT NULL,
        due_date       TEXT,
        due_confidence TEXT    NOT NULL DEFAULT 'none',
        priority       TEXT    NOT NULL DEFAULT 'medium',
        status         TEXT    NOT NULL DEFAULT 'pending',
        assignee       TEXT    NOT NULL DEFAULT 'will',
        created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
        completed_at   TEXT,
        snoozed_until  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_followups_assignee ON note_followups(assignee, status, due_date);
      CREATE INDEX IF NOT EXISTS idx_followups_lead     ON note_followups(lead_id, status);
    `);
    // Migrations for existing tables (safe — ALTER TABLE IF NOT EXISTS column doesn't exist)
    try { db.exec(`ALTER TABLE client_notes ADD COLUMN parse_reason TEXT NOT NULL DEFAULT '{}'`); } catch {}

    _notesReady = true;
  } finally { db.close(); }
}
// ─── Note CRUD ───────────────────────────────────────────────────────────────

function parseCategories(raw: string): NoteCategory[] {
  try { return JSON.parse(raw) as NoteCategory[]; } catch { return ["general"]; }
}

export function getNotesByLead(leadId: number): NoteRecordParsed[] {
  const db = getDb();
  try {
    ensureNotesTables();
    const rows = db.prepare(
      `SELECT * FROM client_notes WHERE lead_id = ? ORDER BY created_at DESC`
    ).all(leadId) as NoteRecord[];
    return rows.map(r => ({ ...r, categories: parseCategories(r.categories) }));
  } finally { db.close(); }
}

export function createNote(
  leadId: number,
  rawText: string,
  createdBy = "will"
): NoteRecordParsed {
  ensureNotesTables();
  const parsed = parseNote(rawText);
  const now = new Date().toISOString();
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO client_notes (lead_id, raw_text, categories, intent, importance, parse_reason, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      leadId,
      rawText.trim(),
      JSON.stringify(parsed.categories),
      parsed.intent,
      parsed.importance,
      JSON.stringify(parsed.parseReason),
      createdBy,
      now, now
    );
    const note = db.prepare("SELECT * FROM client_notes WHERE id = ?")
      .get(result.lastInsertRowid) as NoteRecord;
    return { ...note, categories: parseCategories(note.categories) };
  } finally { db.close(); }
}

export function deleteNote(noteId: number): boolean {
  const db = getDb();
  try {
    ensureNotesTables();
    const r = db.prepare("DELETE FROM client_notes WHERE id = ?").run(noteId);
    return r.changes > 0;
  } finally { db.close(); }
}

export function updateNoteCategories(noteId: number, categories: NoteCategory[]): boolean {
  const db = getDb();
  try {
    ensureNotesTables();
    db.prepare("UPDATE client_notes SET categories = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(categories), new Date().toISOString(), noteId);
    return true;
  } finally { db.close(); }
}

export function updateFollowUpDueDate(id: number, dueDate: string | null): boolean {
  const db = getDb();
  try {
    ensureNotesTables();
    db.prepare("UPDATE note_followups SET due_date = ?, due_confidence = ? WHERE id = ?")
      .run(dueDate, dueDate ? "explicit" : "none", id);
    return true;
  } finally { db.close(); }
}

// ─── Follow-up CRUD ──────────────────────────────────────────────────────────

export function getFollowUpsByLead(leadId: number): FollowUpRecord[] {
  const db = getDb();
  try {
    ensureNotesTables();
    return db.prepare(`
      SELECT f.*, (l.first_name || ' ' || l.last_name) as lead_name, l.email as lead_email
      FROM note_followups f
      LEFT JOIN leads l ON f.lead_id = l.id
      WHERE f.lead_id = ? AND f.status != 'dismissed'
      ORDER BY f.due_date ASC NULLS LAST, f.created_at DESC
    `).all(leadId) as FollowUpRecord[];
  } finally { db.close(); }
}

export function getAllPendingFollowUps(assignee: string): FollowUpRecord[] {
  const db = getDb();
  try {
    ensureNotesTables();
    return db.prepare(`
      SELECT f.*, (l.first_name || ' ' || l.last_name) as lead_name, l.email as lead_email
      FROM note_followups f
      LEFT JOIN leads l ON f.lead_id = l.id
      WHERE f.assignee = ? AND f.status = 'pending'
        AND (f.snoozed_until IS NULL OR f.snoozed_until <= date('now'))
      ORDER BY
        CASE WHEN f.due_date < date('now') THEN 0 ELSE 1 END,
        f.due_date ASC NULLS LAST,
        CASE f.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
    `).all(assignee) as FollowUpRecord[];
  } finally { db.close(); }
}

export function createFollowUp(
  leadId: number,
  title: string,
  opts: { noteId?: number; dueDate?: string; dueConfidence?: string; priority?: string; assignee?: string }
): FollowUpRecord {
  ensureNotesTables();
  const now = new Date().toISOString();
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO note_followups (note_id, lead_id, title, due_date, due_confidence, priority, assignee, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opts.noteId ?? null,
      leadId,
      title,
      opts.dueDate ?? null,
      opts.dueConfidence ?? "none",
      opts.priority ?? "medium",
      opts.assignee ?? "will",
      now
    );
    return db.prepare("SELECT * FROM note_followups WHERE id = ?")
      .get(result.lastInsertRowid) as FollowUpRecord;
  } finally { db.close(); }
}

export function updateFollowUpStatus(
  id: number,
  status: "pending" | "completed" | "dismissed" | "snoozed",
  snoozeUntil?: string
): boolean {
  const db = getDb();
  try {
    ensureNotesTables();
    const completedAt = status === "completed" ? new Date().toISOString() : null;
    db.prepare(`
      UPDATE note_followups SET status = ?, completed_at = ?, snoozed_until = ? WHERE id = ?
    `).run(status, completedAt, snoozeUntil ?? null, id);
    return true;
  } finally { db.close(); }
}

// ─── Rules-based note parser ──────────────────────────────────────────────────
// No external API needed. Deterministic, fast, upgradeable to AI later.

type ParsedNote = {
  categories: NoteCategory[];
  intent: NoteIntent;
  importance: number;
  parseReason: {
    categories: Record<string, string>;  // category → matched phrase
    intent: string;                       // what triggered action_required
    importance: string;                   // score breakdown
    date?: string;                        // what date was extracted and how
  };
  followUp: { title: string; dueDate: string | null; dueConfidence: string; priority: string } | null;
};

// Action verbs that signal a task is required
const ACTION_VERBS = [
  "follow up", "followup", "call", "reach out", "check in", "check back",
  "send", "email", "text", "remind", "schedule", "contact", "ping",
  "update", "share", "introduce", "set up", "arrange", "book",
];

// Category keyword maps — 9 categories, yacht brokerage specific
// Each entry: [displayRegex, examplePhrase for parse_reason]
const CATEGORY_SIGNALS: Array<[NoteCategory, RegExp, string]> = [
  ["buyer_preference",  /\b(prefer|like|want|looking for|interested in|not into|loves?|hates?|must have|needs?|explorer|flybridge|fly[- ]bridge|displacement|go-fast|sport|motoryacht|trawler|catamaran|stabilizer|range|beam|draft|loa|ft|feet|knots|layout|sky[- ]?lounge|pilothouse)\b/i, "vessel preference language"],
  ["seller_motivation", /\b(selling|list|motivated|wants? to sell|needs? to sell|price drop|reduce|estate|divorce|upgrade|move[- ]up|move[- ]down|downsize)\b/i, "seller signal language"],
  ["family",            /\b(wife|husband|spouse|partner|kids?|children|family|son|daughter|parents?|mother|father|mom|dad|together|his|her|they both|decision[- ]maker|she wants|he wants|she needs|he needs)\b/i, "family or decision-dynamics language"],
  ["timeline",          /\b(timeline|by [A-Z][a-z]+|after [A-Z][a-z]+|spring|summer|fall|winter|Q[1-4]|end of year|next year|this year|season|before|closing|ready to|need[s]? to move|looking to close|Adriatic|Med|Bahamas|boat show)\b/i, "timing or seasonal language"],
  ["budget",            /\b(budget|price|million|[$€£]\d|\$\d|spend|afford|max|range|financing|cash|loan|asking|all[- ]?in|above|below|under|over)\b/i, "budget or price language"],
  ["boat_history",      /\b(owned|owns|previous|last boat|had a|came from|traded|sold their|charter|background|experience|years on|first boat|been boating)\b/i, "ownership or history language"],
  ["hot_lead",          /\b(hot|very interested|ready to move|serious|motivated buyer|wants? to buy now|urgent|immediately|asap|closing soon|actively looking|let's move|make an offer|write it up)\b/i, "urgency or readiness language"],
  ["objection",         /\b(not sure|hesitant|concern|worried|issue|problem|waiting on|holding off|push back|too expensive|too big|too small|not the right|doesn't feel|on the fence|maybe|possibly)\b/i, "hesitation or objection language"],
  ["deal_blocker",      /\b(blocked|blocker|deal[- ]breaker|won't|can't proceed|not happening|holding|lien|survey|legal|financing fell|bank|approval|contingent|dispute|title)\b/i, "hard blocker language"],
];

// Relative date patterns → offset in days
const RELATIVE_DATES: [RegExp, number][] = [
  [/\btoday\b/i,        0],
  [/\btomorrow\b/i,     1],
  [/\bnext week\b/i,    7],
  [/\bin a week\b/i,    7],
  [/\bin two weeks\b/i, 14],
  [/\bin 2 weeks\b/i,   14],
  [/\bnext month\b/i,   30],
  [/\bin a month\b/i,   30],
  [/\bin 30 days\b/i,   30],
  [/\bin 60 days\b/i,   60],
  [/\bin 90 days\b/i,   90],
];

// Explicit month/date patterns
const MONTH_NAMES = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const EXPLICIT_DATE_RE = new RegExp(
  `\\b(?:(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?|(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?)\\b`, "i"
);

// "After [month]" or "after [event]" — no hard date but directional
const AFTER_MONTH_RE = new RegExp(`\\bafter\\s+(${MONTH_NAMES}|tax season|boat show|the show|summer|season|closing)\\b`, "i");

function resolveExplicitDate(text: string): { date: string; confidence: string } | null {
  const m = EXPLICIT_DATE_RE.exec(text);
  if (!m) return null;
  try {
    let d: Date;
    if (m[1]) {
      // "June 15" or "June 15, 2026"
      const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      d = new Date(`${m[1]} ${m[2]}, ${year}`);
    } else {
      // "6/15" or "6/15/2026"
      const year = m[6] ? (m[6].length === 2 ? 2000 + parseInt(m[6]) : parseInt(m[6])) : new Date().getFullYear();
      d = new Date(year, parseInt(m[4]) - 1, parseInt(m[5]));
    }
    if (isNaN(d.getTime())) return null;
    return { date: d.toISOString().split("T")[0], confidence: "explicit" };
  } catch { return null; }
}

function resolveRelativeDate(text: string): { date: string; confidence: string } | null {
  for (const [re, days] of RELATIVE_DATES) {
    if (re.test(text)) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return { date: d.toISOString().split("T")[0], confidence: "inferred" };
    }
  }
  return null;
}

function extractDate(text: string): { dueDate: string | null; dueConfidence: string } {
  const explicit = resolveExplicitDate(text);
  if (explicit) return { dueDate: explicit.date, dueConfidence: explicit.confidence };

  const relative = resolveRelativeDate(text);
  if (relative) return { dueDate: relative.date, dueConfidence: relative.confidence };

  if (AFTER_MONTH_RE.test(text)) {
    return { dueDate: null, dueConfidence: "suggested" };
  }

  return { dueDate: null, dueConfidence: "none" };
}

function detectActionVerb(text: string): string | null {
  const lower = text.toLowerCase();
  return ACTION_VERBS.find(v => lower.includes(v)) ?? null;
}

function classifyCategories(text: string): {
  categories: NoteCategory[];
  matched: Record<string, string>;
} {
  const categories: NoteCategory[] = [];
  const matched: Record<string, string> = {};

  for (const [cat, re, reason] of CATEGORY_SIGNALS) {
    const hit = re.exec(text);
    if (hit) {
      categories.push(cat);
      matched[cat] = `"${hit[0]}" → ${reason}`;
    }
  }

  if (categories.length === 0) {
    categories.push("general");
    matched["general"] = "no specific signals detected";
  }

  return { categories, matched };
}

function scoreImportance(text: string, categories: NoteCategory[], hasAction: boolean): { score: number; breakdown: string[] } {
  let score = 40;
  const breakdown: string[] = ["base: 40"];

  if (categories.includes("hot_lead"))     { score += 30; breakdown.push("+30 hot_lead");     }
  if (categories.includes("deal_blocker")) { score += 20; breakdown.push("+20 deal_blocker"); }
  if (categories.includes("budget"))       { score += 15; breakdown.push("+15 budget");        }
  if (categories.includes("timeline"))     { score += 15; breakdown.push("+15 timeline");      }
  if (categories.includes("family"))       { score += 10; breakdown.push("+10 family");        }
  if (categories.includes("objection"))    { score += 10; breakdown.push("+10 objection");     }
  if (hasAction)                           { score += 15; breakdown.push("+15 action intent"); }
  if (text.length < 15)                    { score -= 15; breakdown.push("-15 too short");     }

  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

export function parseNote(text: string): ParsedNote {
  const { categories, matched } = classifyCategories(text);
  const actionVerb = detectActionVerb(text);
  const hasAction  = actionVerb !== null;
  const intent: NoteIntent = hasAction ? "action_required" : "informational";
  const { score: importance, breakdown } = scoreImportance(text, categories, hasAction);

  // Date extraction
  const dateResult = extractDate(text);

  // Build the parse_reason audit trail
  const parseReason = {
    categories: matched,
    intent: hasAction
      ? `action_required — matched verb: "${actionVerb}"`
      : "informational — no action verb detected",
    importance: `${importance}/100 — ${breakdown.join(", ")}`,
    ...(dateResult.dueDate
      ? { date: `${dateResult.dueDate} (${dateResult.dueConfidence})` }
      : dateResult.dueConfidence === "suggested"
      ? { date: "event-anchored — no hard date extracted" }
      : {}),
  };

  let followUp = null;
  if (hasAction) {
    const priority =
      categories.includes("hot_lead") || importance >= 80 ? "high"
      : importance >= 55 ? "medium"
      : "low";
    followUp = {
      title: text.length > 80 ? text.slice(0, 77) + "…" : text,
      dueDate: dateResult.dueDate,
      dueConfidence: dateResult.dueConfidence,
      priority,
    };
  }

  return { categories, intent, importance, parseReason, followUp };
}
