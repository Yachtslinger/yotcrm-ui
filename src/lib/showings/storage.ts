import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS showing_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      yacht_name TEXT DEFAULT '',
      marina_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      slip_number TEXT DEFAULT '',
      gate_code TEXT DEFAULT '',
      dockmaster_phone TEXT DEFAULT '',
      special_instructions TEXT DEFAULT '',
      internal_notes TEXT DEFAULT '',
      map_image TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS showing_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      showing_id INTEGER NOT NULL,
      recipient_name TEXT DEFAULT '',
      recipient_contact TEXT DEFAULT '',
      channel TEXT DEFAULT 'email',
      sent_at TEXT NOT NULL,
      FOREIGN KEY (showing_id) REFERENCES showing_locations(id) ON DELETE CASCADE
    );
  `);

  return db;
}

export type ShowingLocation = {
  id: number; yacht_name: string; marina_name: string; address: string;
  city: string; slip_number: string; gate_code: string; dockmaster_phone: string;
  special_instructions: string; internal_notes: string; map_image: string;
  status: string; created_at: string; updated_at: string;
};

export type SendLogEntry = {
  id: number; showing_id: number; recipient_name: string;
  recipient_contact: string; channel: string; sent_at: string;
};

export function getAllShowings(): ShowingLocation[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM showing_locations ORDER BY created_at DESC").all() as ShowingLocation[];
  } finally { db.close(); }
}

export function getShowing(id: number): ShowingLocation | null {
  const db = getDb();
  try {
    return (db.prepare("SELECT * FROM showing_locations WHERE id = ?").get(id) as ShowingLocation) || null;
  } finally { db.close(); }
}

export function createShowing(input: Partial<ShowingLocation>): ShowingLocation {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO showing_locations (yacht_name, marina_name, address, city, slip_number, gate_code, dockmaster_phone, special_instructions, internal_notes, map_image, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.yacht_name || "", input.marina_name || "", input.address || "",
      input.city || "", input.slip_number || "", input.gate_code || "",
      input.dockmaster_phone || "", input.special_instructions || "",
      input.internal_notes || "", input.map_image || "", input.status || "active", now, now
    );
    return db.prepare("SELECT * FROM showing_locations WHERE id = ?").get(result.lastInsertRowid) as ShowingLocation;
  } finally { db.close(); }
}

export function updateShowing(id: number, updates: Partial<ShowingLocation>): ShowingLocation | null {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ["yacht_name","marina_name","address","city","slip_number","gate_code",
      "dockmaster_phone","special_instructions","internal_notes","map_image","status"];
    for (const f of allowed) {
      if (f in updates && (updates as any)[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push((updates as any)[f]);
      }
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM showing_locations WHERE id = ?").get(id) as ShowingLocation;
    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);
    db.prepare(`UPDATE showing_locations SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return (db.prepare("SELECT * FROM showing_locations WHERE id = ?").get(id) as ShowingLocation) || null;
  } finally { db.close(); }
}

export function deleteShowing(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM showing_locations WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}

export function logSend(showingId: number, recipientName: string, recipientContact: string, channel: string): SendLogEntry {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO showing_send_log (showing_id, recipient_name, recipient_contact, channel, sent_at) VALUES (?, ?, ?, ?, ?)`
    ).run(showingId, recipientName, recipientContact, channel, now);
    return db.prepare("SELECT * FROM showing_send_log WHERE id = ?").get(result.lastInsertRowid) as SendLogEntry;
  } finally { db.close(); }
}

export function getSendLog(showingId: number): SendLogEntry[] {
  const db = getDb();
  try {
    return db.prepare("SELECT * FROM showing_send_log WHERE showing_id = ? ORDER BY sent_at DESC").all(showingId) as SendLogEntry[];
  } finally { db.close(); }
}
