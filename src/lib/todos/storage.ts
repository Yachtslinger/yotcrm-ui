import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export type TodoRecord = {
  id: number;
  text: string;
  completed: number;
  priority: string;
  lead_id: number | null;
  due_date: string | null;
  assignee: string;
  created_at: string;
  completed_at: string | null;
  email_draft?: string | null;
  todo_type?: string;
  queue?: string;
  lead_name?: string;
  lead_email?: string;
};

export function getAllTodos(queue = "human"): TodoRecord[] {
  const db = getDb();
  try {
    try { db.exec("ALTER TABLE todos ADD COLUMN email_draft TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE todos ADD COLUMN todo_type TEXT DEFAULT 'manual'"); } catch {}
    try { db.exec("ALTER TABLE todos ADD COLUMN queue TEXT DEFAULT 'human'"); } catch {}
    return db.prepare(`
      SELECT t.*,
        CASE WHEN t.lead_id IS NOT NULL
          THEN (l.first_name || ' ' || l.last_name) ELSE NULL END as lead_name,
        CASE WHEN t.lead_id IS NOT NULL
          THEN l.email ELSE NULL END as lead_email
      FROM todos t
      LEFT JOIN leads l ON t.lead_id = l.id
      WHERE (t.queue = ? OR t.queue IS NULL)
      ORDER BY t.completed ASC,
        CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        t.created_at DESC
    `).all(queue) as TodoRecord[];
  } finally {
    db.close();
  }
}

export function createTodo(text: string, priority = "normal", dueDate?: string, leadId?: number, assignee = "will"): TodoRecord {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO todos (text, priority, lead_id, due_date, assignee, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(text, priority, leadId ?? null, dueDate ?? null, assignee.toLowerCase().trim(), now, now);
    return db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid) as TodoRecord;
  } finally {
    db.close();
  }
}

export function updateTodo(id: number, fields: Partial<{ text: string; completed: boolean; priority: string; due_date: string | null; assignee: string }>): TodoRecord | null {
  const db = getDb();
  try {
    const existing = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRecord | undefined;
    if (!existing) return null;

    if (fields.text !== undefined) {
      db.prepare("UPDATE todos SET text = ?, updated_at = ? WHERE id = ?").run(fields.text, new Date().toISOString(), id);
    }
    if (fields.completed !== undefined) {
      const completedAt = fields.completed ? new Date().toISOString() : null;
      db.prepare("UPDATE todos SET completed = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .run(fields.completed ? 1 : 0, completedAt, new Date().toISOString(), id);
    }
    if (fields.priority !== undefined) {
      db.prepare("UPDATE todos SET priority = ?, updated_at = ? WHERE id = ?").run(fields.priority, new Date().toISOString(), id);
    }
    if (fields.due_date !== undefined) {
      db.prepare("UPDATE todos SET due_date = ?, updated_at = ? WHERE id = ?").run(fields.due_date, new Date().toISOString(), id);
    }
    if (fields.assignee !== undefined) {
      db.prepare("UPDATE todos SET assignee = ?, updated_at = ? WHERE id = ?").run(fields.assignee.toLowerCase().trim(), new Date().toISOString(), id);
    }
    return db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRecord;
  } finally {
    db.close();
  }
}

export function deleteTodo(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function clearCompleted(assignee?: string): number {
  const db = getDb();
  try {
    if (assignee) {
      const result = db.prepare("DELETE FROM todos WHERE completed = 1 AND assignee = ?").run(assignee);
      return result.changes;
    }
    const result = db.prepare("DELETE FROM todos WHERE completed = 1").run();
    return result.changes;
  } finally {
    db.close();
  }
}
