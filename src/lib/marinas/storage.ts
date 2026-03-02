import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export type MarinaRecord = {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  gate_code: string;
  dockmaster_name: string;
  dockmaster_phone: string;
  office_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

function ensureTable(db: InstanceType<typeof Database>) {
  db.exec(`
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
}

export function getAllMarinas(): MarinaRecord[] {
  const db = getDb();
  try {
    ensureTable(db);
    return db.prepare("SELECT * FROM marinas ORDER BY name ASC").all() as MarinaRecord[];
  } finally { db.close(); }
}

export function createMarina(fields: Partial<MarinaRecord>): MarinaRecord {
  const db = getDb();
  try {
    ensureTable(db);
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO marinas (name, address, city, state, gate_code, dockmaster_name, dockmaster_phone, office_phone, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fields.name || '', fields.address || '', fields.city || '', fields.state || '',
      fields.gate_code || '', fields.dockmaster_name || '', fields.dockmaster_phone || '',
      fields.office_phone || '', fields.notes || '', now, now
    );
    return db.prepare("SELECT * FROM marinas WHERE id = ?").get(result.lastInsertRowid) as MarinaRecord;
  } finally { db.close(); }
}

export function updateMarina(id: number, fields: Partial<MarinaRecord>): MarinaRecord | null {
  const db = getDb();
  try {
    ensureTable(db);
    const existing = db.prepare("SELECT * FROM marinas WHERE id = ?").get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const keys = ['name','address','city','state','gate_code','dockmaster_name','dockmaster_phone','office_phone','notes'] as const;
    for (const k of keys) {
      if (fields[k] !== undefined) {
        db.prepare(`UPDATE marinas SET ${k} = ?, updated_at = ? WHERE id = ?`).run(fields[k], now, id);
      }
    }
    return db.prepare("SELECT * FROM marinas WHERE id = ?").get(id) as MarinaRecord;
  } finally { db.close(); }
}

export function deleteMarina(id: number): boolean {
  const db = getDb();
  try {
    ensureTable(db);
    const result = db.prepare("DELETE FROM marinas WHERE id = ?").run(id);
    return result.changes > 0;
  } finally { db.close(); }
}
