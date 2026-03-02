import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";

export const runtime = "nodejs";

export async function GET() {
  const dbPath = process.env.DB_PATH || "/app/data/yotcrm.db";
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };

  // DB file check
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ status: "error", ...checks, db: "missing", dbPath }, { status: 503 });
  }

  // DB query check
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name).filter(n => !n.startsWith("sqlite_"));

    const counts: Record<string, number> = {};
    for (const name of tableNames) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number };
        counts[name] = row.c;
      } catch { counts[name] = -1; }
    }
    db.close();

    checks.db = "ok";
    checks.tables = counts;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "degraded", ...checks, db: "error", dbError: message }, { status: 200 });
  }

  return NextResponse.json({ status: "ok", ...checks });
}
