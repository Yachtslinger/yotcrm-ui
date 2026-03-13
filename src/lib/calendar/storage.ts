import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Types ──────────────────────────────────────────────

export const EVENT_TYPES = [
  "showing", "broker_showing", "owner_showing", "survey",
  "haul_out", "sea_trial", "yard_visit", "closing_milestone",
  "client_call", "follow_up", "boat_show", "travel_block",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ["scheduled", "completed", "canceled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export type CalendarEvent = {
  id: number;
  title: string;
  event_type: EventType;
  start_at: string;
  end_at: string;
  timezone: string;
  location: string;
  notes: string;
  checklist: string;       // JSON array
  reminder_rules: string;  // JSON array
  prospect_id: number | null;
  vessel_id: number | null;
  deal_id: number | null;
  assigned_users: string;  // JSON array
  status: EventStatus;
  outcome: string;
  feedback_notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  prospect_name?: string;
  prospect_email?: string;
  prospect_phone?: string;
  vessel_name?: string;
  sync_status?: string;
};

export type AuditEntry = {
  id: number;
  event_id: number;
  actor: string;
  action: string;
  changes: string;
  created_at: string;
};

// ─── Init Tables ────────────────────────────────────────

export function initCalendarTables() {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL,
        event_type      TEXT NOT NULL DEFAULT 'showing',
        start_at        TEXT NOT NULL,
        end_at          TEXT NOT NULL,
        timezone        TEXT DEFAULT 'America/New_York',
        location        TEXT DEFAULT '',
        notes           TEXT DEFAULT '',
        checklist       TEXT DEFAULT '[]',
        reminder_rules  TEXT DEFAULT '["24h","2h"]',
        prospect_id     INTEGER,
        vessel_id       INTEGER,
        deal_id         INTEGER,
        assigned_users  TEXT DEFAULT '["will","paolo"]',
        status          TEXT DEFAULT 'scheduled',
        outcome         TEXT DEFAULT '',
        feedback_notes  TEXT DEFAULT '',
        created_by      TEXT DEFAULT 'will',
        updated_by      TEXT DEFAULT 'will',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS calendar_audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id    INTEGER NOT NULL,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        changes     TEXT DEFAULT '',
        created_at  TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS calendar_sync_map (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        internal_event_id   INTEGER NOT NULL UNIQUE,
        provider            TEXT DEFAULT 'apple',
        provider_event_uid  TEXT,
        provider_calendar_id TEXT,
        sync_status         TEXT DEFAULT 'not_pushed',
        last_pushed_at      TEXT,
        last_pulled_at      TEXT,
        FOREIGN KEY (internal_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS calendar_sync_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        direction   TEXT NOT NULL,
        event_count INTEGER DEFAULT 0,
        errors      TEXT DEFAULT '',
        created_at  TEXT NOT NULL
      );
    `);
  } finally { db.close(); }
}

// ─── Audit Helper ───────────────────────────────────────

function logAudit(db: Database.Database, eventId: number, actor: string, action: string, changes: string) {
  db.prepare(
    "INSERT INTO calendar_audit_log (event_id, actor, action, changes, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(eventId, actor, action, changes, new Date().toISOString());
}

// ─── Conflict Detection ─────────────────────────────────

export function detectConflicts(startAt: string, endAt: string, assignedUsers: string[], excludeId?: number): CalendarEvent[] {
  const db = getDb();
  try {
    initCalendarTables();
    const events = db.prepare(`
      SELECT * FROM calendar_events
      WHERE status = 'scheduled'
        AND start_at < ? AND end_at > ?
        ${excludeId ? "AND id != ?" : ""}
    `).all(...(excludeId ? [endAt, startAt, excludeId] : [endAt, startAt])) as CalendarEvent[];

    // Filter to events that share at least one assigned user
    return events.filter(e => {
      try {
        const users = JSON.parse(e.assigned_users) as string[];
        return assignedUsers.some(u => users.includes(u));
      } catch { return false; }
    });
  } finally { db.close(); }
}

// ─── Create Event ───────────────────────────────────────

export type CreateEventInput = {
  title: string;
  event_type?: string;
  start_at: string;
  end_at: string;
  timezone?: string;
  location?: string;
  notes?: string;
  checklist?: string;
  reminder_rules?: string;
  prospect_id?: number | null;
  vessel_id?: number | null;
  deal_id?: number | null;
  assigned_users?: string[];
  status?: string;
  outcome?: string;
  feedback_notes?: string;
  actor?: string; // who is creating
};

export function createEvent(input: CreateEventInput): { event: CalendarEvent; conflicts: CalendarEvent[] } {
  const db = getDb();
  try {
    initCalendarTables();
    const now = new Date().toISOString();
    const actor = input.actor || "will";
    const users = input.assigned_users || ["will", "paolo"];
    const usersJson = JSON.stringify(users);

    // Check conflicts
    const conflicts = detectConflicts(input.start_at, input.end_at, users);

    const result = db.prepare(`
      INSERT INTO calendar_events
        (title, event_type, start_at, end_at, timezone, location, notes,
         checklist, reminder_rules, prospect_id, vessel_id, deal_id,
         assigned_users, status, outcome, feedback_notes,
         created_by, updated_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      input.title,
      input.event_type || "showing",
      input.start_at,
      input.end_at,
      input.timezone || "America/New_York",
      input.location || "",
      input.notes || "",
      input.checklist || "[]",
      input.reminder_rules || '["24h","2h"]',
      input.prospect_id ?? null,
      input.vessel_id ?? null,
      input.deal_id ?? null,
      usersJson,
      input.status || "scheduled",
      input.outcome || "",
      input.feedback_notes || "",
      actor, actor, now, now
    );

    const event = db.prepare("SELECT * FROM calendar_events WHERE id = ?")
      .get(result.lastInsertRowid) as CalendarEvent;

    logAudit(db, event.id, actor, "created", JSON.stringify({ title: input.title, type: input.event_type }));

    // Create sync_map entry
    db.prepare("INSERT INTO calendar_sync_map (internal_event_id) VALUES (?)").run(event.id);

    return { event, conflicts };
  } finally { db.close(); }
}

// ─── List Events ────────────────────────────────────────

export type ListFilters = {
  startDate?: string;
  endDate?: string;
  user?: string;
  eventType?: string;
  status?: string;
  prospectId?: number;
  vesselId?: number;
  dealId?: number;
  search?: string;
};

export function listEvents(filters: ListFilters = {}): CalendarEvent[] {
  const db = getDb();
  try {
    initCalendarTables();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.startDate) { conditions.push("e.end_at >= ?"); params.push(filters.startDate); }
    if (filters.endDate) { conditions.push("e.start_at <= ?"); params.push(filters.endDate); }
    if (filters.user) { conditions.push("e.assigned_users LIKE ?"); params.push(`%"${filters.user}"%`); }
    if (filters.eventType) { conditions.push("e.event_type = ?"); params.push(filters.eventType); }
    if (filters.status) { conditions.push("e.status = ?"); params.push(filters.status); }
    if (filters.prospectId) { conditions.push("e.prospect_id = ?"); params.push(filters.prospectId); }
    if (filters.vesselId) { conditions.push("e.vessel_id = ?"); params.push(filters.vesselId); }
    if (filters.dealId) { conditions.push("e.deal_id = ?"); params.push(filters.dealId); }
    if (filters.search) {
      const s = `%${filters.search.toLowerCase()}%`;
      conditions.push("(LOWER(e.title) LIKE ? OR LOWER(e.location) LIKE ? OR LOWER(e.notes) LIKE ? OR LOWER(COALESCE(l.first_name || ' ' || l.last_name, '')) LIKE ?)");
      params.push(s, s, s, s);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const rows = db.prepare(`
      SELECT e.*,
        COALESCE(l.first_name || ' ' || COALESCE(l.last_name, ''), '') AS prospect_name,
        l.email AS prospect_email, l.phone AS prospect_phone,
        COALESCE(b.make || ' ' || COALESCE(b.model, ''), '') AS vessel_name,
        sm.sync_status
      FROM calendar_events e
      LEFT JOIN leads l ON e.prospect_id = l.id
      LEFT JOIN boats b ON e.vessel_id = b.id
      LEFT JOIN calendar_sync_map sm ON sm.internal_event_id = e.id
      ${where}
      ORDER BY e.start_at ASC
    `).all(...params) as CalendarEvent[];

    return rows;
  } finally { db.close(); }
}

// ─── Get Single Event ───────────────────────────────────

export function getEvent(id: number): CalendarEvent | null {
  const db = getDb();
  try {
    initCalendarTables();
    return db.prepare(`
      SELECT e.*,
        COALESCE(l.first_name || ' ' || COALESCE(l.last_name, ''), '') AS prospect_name,
        l.email AS prospect_email, l.phone AS prospect_phone,
        COALESCE(b.make || ' ' || COALESCE(b.model, ''), '') AS vessel_name,
        sm.sync_status
      FROM calendar_events e
      LEFT JOIN leads l ON e.prospect_id = l.id
      LEFT JOIN boats b ON e.vessel_id = b.id
      LEFT JOIN calendar_sync_map sm ON sm.internal_event_id = e.id
      WHERE e.id = ?
    `).get(id) as CalendarEvent | null;
  } finally { db.close(); }
}

// ─── Update Event ───────────────────────────────────────

export function updateEvent(id: number, fields: Partial<CreateEventInput>): { event: CalendarEvent | null; conflicts: CalendarEvent[] } {
  const db = getDb();
  try {
    const existing = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as CalendarEvent | undefined;
    if (!existing) return { event: null, conflicts: [] };

    const actor = fields.actor || "will";
    const now = new Date().toISOString();
    const changes: Record<string, { old: any; new: any }> = {};

    const updatable: [string, string, any][] = [
      ["title", "title", fields.title],
      ["event_type", "event_type", fields.event_type],
      ["start_at", "start_at", fields.start_at],
      ["end_at", "end_at", fields.end_at],
      ["timezone", "timezone", fields.timezone],
      ["location", "location", fields.location],
      ["notes", "notes", fields.notes],
      ["checklist", "checklist", fields.checklist],
      ["reminder_rules", "reminder_rules", fields.reminder_rules],
      ["prospect_id", "prospect_id", fields.prospect_id],
      ["vessel_id", "vessel_id", fields.vessel_id],
      ["deal_id", "deal_id", fields.deal_id],
      ["status", "status", fields.status],
      ["outcome", "outcome", fields.outcome],
      ["feedback_notes", "feedback_notes", fields.feedback_notes],
    ];

    for (const [col, key, val] of updatable) {
      if (val !== undefined) {
        const oldVal = (existing as any)[key];
        if (String(oldVal) !== String(val)) {
          changes[key] = { old: oldVal, new: val };
          db.prepare(`UPDATE calendar_events SET ${col} = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
            .run(val, now, actor, id);
        }
      }
    }

    // Handle assigned_users separately (array → JSON)
    if (fields.assigned_users) {
      const newVal = JSON.stringify(fields.assigned_users);
      if (newVal !== existing.assigned_users) {
        changes.assigned_users = { old: existing.assigned_users, new: newVal };
        db.prepare("UPDATE calendar_events SET assigned_users = ?, updated_at = ?, updated_by = ? WHERE id = ?")
          .run(newVal, now, actor, id);
      }
    }

    // Audit log
    if (Object.keys(changes).length > 0) {
      logAudit(db, id, actor, "updated", JSON.stringify(changes));
      // Mark sync as stale
      db.prepare("UPDATE calendar_sync_map SET sync_status = 'updated_locally' WHERE internal_event_id = ? AND sync_status = 'pushed'")
        .run(id);
    }

    // Conflict check if time changed
    const updated = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as CalendarEvent;
    let conflicts: CalendarEvent[] = [];
    if (fields.start_at || fields.end_at) {
      const users = fields.assigned_users || (() => { try { return JSON.parse(updated.assigned_users); } catch { return []; } })();
      conflicts = detectConflicts(updated.start_at, updated.end_at, users, id);
    }

    return { event: getEvent(id), conflicts };
  } finally { db.close(); }
}

// ─── Delete Event ───────────────────────────────────────

export function deleteEvent(id: number, actor: string = "will"): boolean {
  const db = getDb();
  try {
    const existing = db.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id);
    if (!existing) return false;
    logAudit(db, id, actor, "deleted", JSON.stringify(existing));
    db.prepare("DELETE FROM calendar_events WHERE id = ?").run(id);
    return true;
  } finally { db.close(); }
}

// ─── Audit Log ──────────────────────────────────────────

export function getAuditLog(eventId?: number, limit = 50): AuditEntry[] {
  const db = getDb();
  try {
    initCalendarTables();
    if (eventId) {
      return db.prepare("SELECT * FROM calendar_audit_log WHERE event_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(eventId, limit) as AuditEntry[];
    }
    return db.prepare("SELECT * FROM calendar_audit_log ORDER BY created_at DESC LIMIT ?")
      .all(limit) as AuditEntry[];
  } finally { db.close(); }
}

// ─── ICS Generation ─────────────────────────────────────

export function generateICS(event: CalendarEvent): string {
  const uid = `yotcrm-${event.id}@yotcrm.app`;
  const dtStart = event.start_at.replace(/[-:]/g, "").replace(/\.\d+Z?$/, "Z").replace("T", "T");
  const dtEnd = event.end_at.replace(/[-:]/g, "").replace(/\.\d+Z?$/, "Z").replace("T", "T");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z?$/, "Z");
  const desc = [event.notes, event.outcome, event.feedback_notes].filter(Boolean).join("\\n\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YotCRM//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${event.title.replace(/\n/g, "\\n")}`,
    event.location ? `LOCATION:${event.location.replace(/\n/g, "\\n")}` : "",
    desc ? `DESCRIPTION:${desc}` : "",
    `STATUS:${event.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

// ─── ICS Feed (multi-event calendar subscription) ───────

function icsDateTime(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d+Z?$/, "Z");
}

export function generateICSFeed(events: CalendarEvent[]): string {
  const now = icsDateTime(new Date().toISOString());
  const vevents = events.map(event => {
    const uid = `yotcrm-${event.id}@yotcrm.app`;
    const desc = [event.notes, event.outcome, event.feedback_notes].filter(Boolean).join("\\n\\n");
    const users = (() => { try { return JSON.parse(event.assigned_users).join(", "); } catch { return ""; } })();
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${icsDateTime(event.start_at)}`,
      `DTEND:${icsDateTime(event.end_at)}`,
      `DTSTAMP:${now}`,
      `SUMMARY:${event.title.replace(/\n/g, "\\n")}`,
      event.location ? `LOCATION:${event.location.replace(/\n/g, "\\n")}` : "",
      desc ? `DESCRIPTION:${desc}` : "",
      users ? `ATTENDEE:${users}` : "",
      `CATEGORIES:${event.event_type}`,
      `STATUS:${event.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
      `LAST-MODIFIED:${icsDateTime(event.updated_at || event.created_at)}`,
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//YotCRM//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:YotCRM Calendar",
    "X-WR-TIMEZONE:America/New_York",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ─── Sync Status Helpers ────────────────────────────────

export function markEventPushed(eventId: number) {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE calendar_sync_map SET sync_status = 'pushed', last_pushed_at = ? WHERE internal_event_id = ?"
    ).run(now, eventId);
    // Log
    db.prepare(
      "INSERT INTO calendar_sync_log (direction, event_count, errors, created_at) VALUES ('push', 1, '', ?)"
    ).run(now);
  } finally { db.close(); }
}

export function markBulkPushed(eventIds: number[]) {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      "UPDATE calendar_sync_map SET sync_status = 'pushed', last_pushed_at = ? WHERE internal_event_id = ?"
    );
    for (const id of eventIds) stmt.run(now, id);
    db.prepare(
      "INSERT INTO calendar_sync_log (direction, event_count, errors, created_at) VALUES ('bulk_push', ?, '', ?)"
    ).run(eventIds.length, now);
  } finally { db.close(); }
}

export function getSyncStatus(eventId: number): { sync_status: string; last_pushed_at: string | null } | null {
  const db = getDb();
  try {
    return db.prepare(
      "SELECT sync_status, last_pushed_at FROM calendar_sync_map WHERE internal_event_id = ?"
    ).get(eventId) as any || null;
  } finally { db.close(); }
}

export function getSyncLog(limit = 20): any[] {
  const db = getDb();
  try {
    initCalendarTables();
    return db.prepare("SELECT * FROM calendar_sync_log ORDER BY created_at DESC LIMIT ?").all(limit);
  } finally { db.close(); }
}

// ─── Lookup Helpers (for dropdowns) ─────────────────────

export function getProspects(): { id: number; name: string }[] {
  const db = getDb();
  try {
    return db.prepare("SELECT id, (first_name || ' ' || COALESCE(last_name, '')) AS name FROM leads ORDER BY first_name")
      .all() as { id: number; name: string }[];
  } finally { db.close(); }
}

export function getVessels(): { id: number; name: string }[] {
  const db = getDb();
  try {
    return db.prepare("SELECT id, TRIM(COALESCE(make,'') || ' ' || COALESCE(model,'') || ' ' || COALESCE(year,'')) AS name FROM boats ORDER BY make")
      .all() as { id: number; name: string }[];
  } finally { db.close(); }
}

export function createBoat(name: string): { id: number; name: string } {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    // Parse "Year Make Model" or just use name as make
    const parts = name.trim().split(" ");
    const yearCandidate = parts[0];
    let make = name.trim();
    let model = "";
    let year = "";
    if (/^\d{4}$/.test(yearCandidate) && parts.length > 1) {
      year = yearCandidate;
      make = parts.slice(1).join(" ");
    }
    const result = db.prepare(
      `INSERT INTO boats (lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
       VALUES (NULL, ?, ?, ?, '', '', '', '', '', ?)`
    ).run(make, model, year, now);
    const id = result.lastInsertRowid as number;
    return { id, name: TRIM([make, model, year].filter(Boolean).join(" ")) };
  } finally { db.close(); }
}

function TRIM(s: string) { return s.trim(); }

// ═══ DEALS ══════════════════════════════════════════════

export const DEAL_STAGES = [
  { value: "prospect", label: "Prospect", order: 0 },
  { value: "offer_submitted", label: "Offer Submitted", order: 1 },
  { value: "loi_signed", label: "LOI Signed", order: 2 },
  { value: "deposit_due", label: "Deposit Due", order: 3 },
  { value: "deposit_received", label: "Deposit Received", order: 4 },
  { value: "survey_scheduled", label: "Survey Scheduled", order: 5 },
  { value: "haul_out", label: "Haul-Out", order: 6 },
  { value: "sea_trial", label: "Sea Trial", order: 7 },
  { value: "deficiency_negotiation", label: "Deficiency Negotiation", order: 8 },
  { value: "closing_docs", label: "Closing Docs Due", order: 9 },
  { value: "closing", label: "Closing", order: 10 },
  { value: "closed", label: "Closed", order: 11 },
  { value: "dead", label: "Dead", order: 12 },
] as const;

export type DealStage = (typeof DEAL_STAGES)[number]["value"];

export type Deal = {
  id: number;
  name: string;
  stage: DealStage;
  prospect_id: number | null;
  vessel_id: number | null;
  asking_price: string;
  offer_price: string;
  broker: string;
  notes: string;
  stage_deadlines: string; // JSON: { stage: ISO_date }
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  prospect_name?: string;
  vessel_name?: string;
};

export function initDealTables() {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deals (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        stage           TEXT DEFAULT 'prospect',
        prospect_id     INTEGER,
        vessel_id       INTEGER,
        asking_price    TEXT DEFAULT '',
        offer_price     TEXT DEFAULT '',
        broker          TEXT DEFAULT 'will',
        notes           TEXT DEFAULT '',
        stage_deadlines TEXT DEFAULT '{}',
        created_by      TEXT DEFAULT 'will',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        FOREIGN KEY (prospect_id) REFERENCES leads(id) ON DELETE SET NULL
      );
    `);
  } finally { db.close(); }
}

// ─── Deal CRUD ──────────────────────────────────────────

export type CreateDealInput = {
  name: string;
  stage?: string;
  prospect_id?: number | null;
  vessel_id?: number | null;
  asking_price?: string;
  offer_price?: string;
  broker?: string;
  notes?: string;
  stage_deadlines?: Record<string, string>;
  actor?: string;
};

export function createDeal(input: CreateDealInput): Deal {
  const db = getDb();
  try {
    initDealTables();
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO deals (name, stage, prospect_id, vessel_id, asking_price, offer_price, broker, notes, stage_deadlines, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name,
      input.stage || "prospect",
      input.prospect_id ?? null,
      input.vessel_id ?? null,
      input.asking_price || "",
      input.offer_price || "",
      input.broker || "will",
      input.notes || "",
      JSON.stringify(input.stage_deadlines || {}),
      input.actor || "will",
      now, now
    );
    return db.prepare("SELECT * FROM deals WHERE id = ?").get(result.lastInsertRowid) as Deal;
  } finally { db.close(); }
}

export function listDeals(stage?: string): Deal[] {
  const db = getDb();
  try {
    initDealTables();
    const where = stage && stage !== "all" ? "WHERE d.stage = ?" : "";
    const params = stage && stage !== "all" ? [stage] : [];
    return db.prepare(`
      SELECT d.*,
        COALESCE(l.first_name || ' ' || COALESCE(l.last_name, ''), '') AS prospect_name,
        COALESCE(b.make || ' ' || COALESCE(b.model, ''), '') AS vessel_name
      FROM deals d
      LEFT JOIN leads l ON d.prospect_id = l.id
      LEFT JOIN boats b ON d.vessel_id = b.id
      ${where}
      ORDER BY d.updated_at DESC
    `).all(...params) as Deal[];
  } finally { db.close(); }
}

export function getDeal(id: number): Deal | null {
  const db = getDb();
  try {
    initDealTables();
    return db.prepare(`
      SELECT d.*,
        COALESCE(l.first_name || ' ' || COALESCE(l.last_name, ''), '') AS prospect_name,
        COALESCE(b.make || ' ' || COALESCE(b.model, ''), '') AS vessel_name
      FROM deals d
      LEFT JOIN leads l ON d.prospect_id = l.id
      LEFT JOIN boats b ON d.vessel_id = b.id
      WHERE d.id = ?
    `).get(id) as Deal | null;
  } finally { db.close(); }
}

export function updateDeal(id: number, fields: Partial<CreateDealInput>): Deal | null {
  const db = getDb();
  try {
    const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updates: [string, any][] = [];
    if (fields.name !== undefined) updates.push(["name", fields.name]);
    if (fields.stage !== undefined) updates.push(["stage", fields.stage]);
    if (fields.prospect_id !== undefined) updates.push(["prospect_id", fields.prospect_id]);
    if (fields.vessel_id !== undefined) updates.push(["vessel_id", fields.vessel_id]);
    if (fields.asking_price !== undefined) updates.push(["asking_price", fields.asking_price]);
    if (fields.offer_price !== undefined) updates.push(["offer_price", fields.offer_price]);
    if (fields.broker !== undefined) updates.push(["broker", fields.broker]);
    if (fields.notes !== undefined) updates.push(["notes", fields.notes]);
    if (fields.stage_deadlines !== undefined) updates.push(["stage_deadlines", JSON.stringify(fields.stage_deadlines)]);

    for (const [col, val] of updates) {
      db.prepare(`UPDATE deals SET ${col} = ?, updated_at = ? WHERE id = ?`).run(val, now, id);
    }

    return getDeal(id);
  } finally { db.close(); }
}

export function deleteDeal(id: number): boolean {
  const db = getDb();
  try {
    const r = db.prepare("DELETE FROM deals WHERE id = ?").run(id);
    return r.changes > 0;
  } finally { db.close(); }
}

// ─── Deal Timeline Helper ───────────────────────────────

export type DealTimeline = {
  deal: Deal;
  milestones: {
    stage: string;
    label: string;
    deadline: string | null;
    event: CalendarEvent | null;
    status: "completed" | "upcoming" | "overdue" | "urgent" | "not_set";
    hoursUntil: number | null;
  }[];
  events: CalendarEvent[];
};

export function getDealTimeline(dealId: number): DealTimeline | null {
  const deal = getDeal(dealId);
  if (!deal) return null;

  const events = listEvents({ dealId });
  let deadlines: Record<string, string> = {};
  try { deadlines = JSON.parse(deal.stage_deadlines || "{}"); } catch {}

  const now = Date.now();
  const stageOrder = DEAL_STAGES.findIndex(s => s.value === deal.stage);

  const milestones = DEAL_STAGES.filter(s => s.value !== "dead").map(s => {
    const deadline = deadlines[s.value] || null;
    const matchingEvent = events.find(e =>
      e.event_type === "closing_milestone" &&
      e.notes?.toLowerCase().includes(s.value.replace(/_/g, " "))
    ) || events.find(e => {
      // Match by event type mapping
      const typeMap: Record<string, string> = {
        survey_scheduled: "survey", haul_out: "haul_out",
        sea_trial: "sea_trial", closing: "closing_milestone",
      };
      return typeMap[s.value] === e.event_type;
    }) || null;

    const sIdx = DEAL_STAGES.findIndex(x => x.value === s.value);
    let status: "completed" | "upcoming" | "overdue" | "urgent" | "not_set" = "not_set";
    let hoursUntil: number | null = null;

    if (sIdx < stageOrder) {
      status = "completed";
    } else if (sIdx === stageOrder) {
      status = "upcoming";
    }

    if (deadline) {
      const dlMs = new Date(deadline).getTime();
      hoursUntil = Math.round((dlMs - now) / (1000 * 60 * 60));
      if (sIdx >= stageOrder) {
        if (dlMs < now) status = "overdue";
        else if (hoursUntil <= 48) status = "urgent";
        else status = "upcoming";
      }
    }

    if (matchingEvent?.status === "completed") status = "completed";

    return {
      stage: s.value,
      label: s.label,
      deadline,
      event: matchingEvent,
      status,
      hoursUntil,
    };
  });

  return { deal, milestones, events };
}
