import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

let _ready = false;
export function initMarketAnalysisTables() {
  if (_ready) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        subject_vessel TEXT DEFAULT '',
        subject_year TEXT DEFAULT '',
        subject_make TEXT DEFAULT '',
        subject_model TEXT DEFAULT '',
        subject_length TEXT DEFAULT '',
        subject_asking_price TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        sold_comps TEXT DEFAULT '[]',
        active_comps TEXT DEFAULT '[]',
        broad_sold TEXT DEFAULT '[]',
        broad_active TEXT DEFAULT '[]',
        analysis_json TEXT DEFAULT '{}',
        report_html TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    _ready = true;
  } finally { db.close(); }
}

export type CompRecord = {
  name: string; make: string; model: string; year: string; length: string;
  listedPrice: number | null; soldPrice: number | null; askPrice: number | null;
  listedDate: string; soldDate: string; daysOnMarket: number | null;
  location: string; source: string;
};

export type MarketAnalysis = {
  id: number; title: string; subject_vessel: string; subject_year: string;
  subject_make: string; subject_model: string; subject_length: string;
  subject_asking_price: string; notes: string;
  sold_comps: CompRecord[]; active_comps: CompRecord[];
  broad_sold: CompRecord[]; broad_active: CompRecord[];
  analysis_json: Record<string, unknown>; report_html: string;
  created_at: string; updated_at: string;
};

export function saveMarketAnalysis(data: Omit<MarketAnalysis, "id"|"created_at"|"updated_at">): number {
  initMarketAnalysisTables();
  const db = getDb();
  try {
    const r = db.prepare(`INSERT INTO market_analyses
      (title,subject_vessel,subject_year,subject_make,subject_model,subject_length,
       subject_asking_price,notes,sold_comps,active_comps,broad_sold,broad_active,
       analysis_json,report_html) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(data.title,data.subject_vessel,data.subject_year,data.subject_make,
        data.subject_model,data.subject_length,data.subject_asking_price,data.notes,
        JSON.stringify(data.sold_comps),JSON.stringify(data.active_comps),
        JSON.stringify(data.broad_sold),JSON.stringify(data.broad_active),
        JSON.stringify(data.analysis_json),data.report_html);
    return r.lastInsertRowid as number;
  } finally { db.close(); }
}

export function updateMarketAnalysis(id: number, data: Partial<Omit<MarketAnalysis,"id"|"created_at">>): void {
  initMarketAnalysisTables();
  const db = getDb();
  try {
    const fields: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { fields.push(`${col}=?`); vals.push(v); };
    if (data.title !== undefined) add("title", data.title);
    if (data.subject_vessel !== undefined) add("subject_vessel", data.subject_vessel);
    if (data.subject_year !== undefined) add("subject_year", data.subject_year);
    if (data.subject_make !== undefined) add("subject_make", data.subject_make);
    if (data.subject_model !== undefined) add("subject_model", data.subject_model);
    if (data.subject_length !== undefined) add("subject_length", data.subject_length);
    if (data.subject_asking_price !== undefined) add("subject_asking_price", data.subject_asking_price);
    if (data.notes !== undefined) add("notes", data.notes);
    if (data.sold_comps !== undefined) add("sold_comps", JSON.stringify(data.sold_comps));
    if (data.active_comps !== undefined) add("active_comps", JSON.stringify(data.active_comps));
    if (data.broad_sold !== undefined) add("broad_sold", JSON.stringify(data.broad_sold));
    if (data.broad_active !== undefined) add("broad_active", JSON.stringify(data.broad_active));
    if (data.analysis_json !== undefined) add("analysis_json", JSON.stringify(data.analysis_json));
    if (data.report_html !== undefined) add("report_html", data.report_html);
    fields.push("updated_at=CURRENT_TIMESTAMP");
    vals.push(id);
    db.prepare(`UPDATE market_analyses SET ${fields.join(",")} WHERE id=?`).run(...vals);
  } finally { db.close(); }
}

export function getMarketAnalyses(): MarketAnalysis[] {
  initMarketAnalysisTables();
  const db = getDb();
  try {
    return (db.prepare("SELECT * FROM market_analyses ORDER BY updated_at DESC").all() as Record<string,unknown>[]).map(parse);
  } finally { db.close(); }
}

export function getMarketAnalysis(id: number): MarketAnalysis | null {
  initMarketAnalysisTables();
  const db = getDb();
  try {
    const row = db.prepare("SELECT * FROM market_analyses WHERE id=?").get(id) as Record<string,unknown>|undefined;
    return row ? parse(row) : null;
  } finally { db.close(); }
}

export function deleteMarketAnalysis(id: number): void {
  initMarketAnalysisTables();
  const db = getDb();
  try { db.prepare("DELETE FROM market_analyses WHERE id=?").run(id); }
  finally { db.close(); }
}

function parse(r: Record<string,unknown>): MarketAnalysis {
  return {
    id: r.id as number, title: (r.title as string)||"",
    subject_vessel: (r.subject_vessel as string)||"", subject_year: (r.subject_year as string)||"",
    subject_make: (r.subject_make as string)||"", subject_model: (r.subject_model as string)||"",
    subject_length: (r.subject_length as string)||"", subject_asking_price: (r.subject_asking_price as string)||"",
    notes: (r.notes as string)||"",
    sold_comps: JSON.parse((r.sold_comps as string)||"[]"),
    active_comps: JSON.parse((r.active_comps as string)||"[]"),
    broad_sold: JSON.parse((r.broad_sold as string)||"[]"),
    broad_active: JSON.parse((r.broad_active as string)||"[]"),
    analysis_json: JSON.parse((r.analysis_json as string)||"{}"),
    report_html: (r.report_html as string)||"",
    created_at: (r.created_at as string)||"", updated_at: (r.updated_at as string)||"",
  };
}
