/**
 * ai-spend.ts
 *
 * Persistent monthly AI spend tracking + a HARD cap. ai-client.ts checks the
 * cap before every paid call and records cost after. The cap is the real
 * protection — even if the per-token prices below drift, the cap still stops
 * runaway spend; imprecise pricing only shifts exactly when it trips.
 *
 * Tunable via env:
 *   AI_MONTHLY_CAP_USD   hard ceiling per calendar month (default 25)
 */
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./data/yotcrm.db";
export const MONTHLY_CAP_USD = Number(process.env.AI_MONTHLY_CAP_USD || "25");

// Approximate USD per 1,000,000 tokens. Update if Anthropic's rates change.
function priceFor(model: string): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("opus"))   return { in: 15, out: 75 };
  if (m.includes("sonnet")) return { in: 3,  out: 15 };
  if (m.includes("haiku"))  return { in: 1,  out: 5 };
  return { in: 3, out: 15 };
}

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`CREATE TABLE IF NOT EXISTS ai_spend (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL DEFAULT (datetime('now')),
    month      TEXT NOT NULL,
    model      TEXT,
    in_tokens  INTEGER,
    out_tokens INTEGER,
    cost_usd   REAL
  )`);
  return _db;
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Total USD spent on AI in the current calendar month. */
export function monthSpendUSD(): number {
  try {
    const row = db()
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_spend WHERE month = ?")
      .get(thisMonth()) as { total: number };
    return row.total || 0;
  } catch {
    return 0;
  }
}

/** True once this month's spend has hit the hard cap. */
export function capReached(): boolean {
  return monthSpendUSD() >= MONTHLY_CAP_USD;
}

/** Record the cost of one call. Returns the computed USD cost. */
export function recordSpend(model: string, inTokens: number, outTokens: number): number {
  const p = priceFor(model);
  const cost = (inTokens / 1e6) * p.in + (outTokens / 1e6) * p.out;
  try {
    db()
      .prepare("INSERT INTO ai_spend (month, model, in_tokens, out_tokens, cost_usd) VALUES (?,?,?,?,?)")
      .run(thisMonth(), model, inTokens || 0, outTokens || 0, cost);
  } catch {
    /* non-fatal: never let spend logging break a call */
  }
  return cost;
}
