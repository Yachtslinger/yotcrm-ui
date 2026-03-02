/**
 * Manual Corrections API
 * Allows broker to correct any intel field and track what was manually overridden
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.NODE_ENV === "production"
  ? "/tmp/yotcrm.db"
  : path.join(process.cwd(), "data", "yotcrm.db");

export async function POST(req: NextRequest) {
  try {
    const { lead_id, corrections } = await req.json();
    if (!lead_id || !corrections || typeof corrections !== "object") {
      return NextResponse.json({ error: "lead_id and corrections object required" }, { status: 400 });
    }

    const db = new Database(DB_PATH);
    try {
      // Get current lead data including manual corrections
      const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(lead_id) as any;
      if (!row) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

      let existing: any[] = [];
      try { existing = JSON.parse(row.manual_corrections || "[]"); } catch { existing = []; }

      // Allowed correctable fields
      const allowed = new Set([
        "date_of_birth", "age", "spouse_name", "spouse_employer",
        "primary_address", "secondary_addresses", "estimated_net_worth",
        "occupation", "employer", "city", "state", "zip",
        "net_worth_range", "net_worth_confidence",
      ]);

      const sets: string[] = [];
      const vals: any[] = [];
      const newCorrections: any[] = [];

      for (const [field, value] of Object.entries(corrections)) {
        if (!allowed.has(field)) continue;
        sets.push(`${field} = ?`);
        vals.push(value);
        newCorrections.push({
          field, old_value: row[field] || "", new_value: value,
          corrected_at: new Date().toISOString(), corrected_by: "broker",
        });
      }

      if (sets.length === 0) {
        return NextResponse.json({ error: "No valid corrections provided" }, { status: 400 });
      }

      const allCorrections = [...existing, ...newCorrections];
      sets.push("manual_corrections = ?");
      vals.push(JSON.stringify(allCorrections));
      sets.push("updated_at = ?");
      vals.push(new Date().toISOString());
      vals.push(lead_id);

      db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
      return NextResponse.json({ ok: true, corrections_count: allCorrections.length });
    } finally {
      db.close();
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
