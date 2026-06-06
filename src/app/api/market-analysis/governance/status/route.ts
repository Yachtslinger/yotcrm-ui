import { NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { GOVERNANCE_SCHEMA_VERSION } from "@/lib/market-analysis/governance/types";
import { getGovernanceDb, initGovernanceTables } from "@/lib/market-analysis/governance/db";

export const runtime = "nodejs";

// Hardcoded table list (not user input) — safe to interpolate.
const TABLES = [
  "ma_sources", "ma_extractions", "ma_vessels", "ma_vessel_fields", "ma_field_history",
  "ma_vessel_field_proposals", "ma_comps", "ma_comp_field_history", "ma_reports",
  "ma_report_sections", "ma_report_versions",
];

export async function GET() {
  const enabled = isGovernanceEnabled();
  // When disabled, report state WITHOUT initializing the schema (no tables created).
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, schemaVersion: GOVERNANCE_SCHEMA_VERSION });
  }
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const tableCounts: Record<string, number> = {};
    for (const t of TABLES) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };
      tableCounts[t] = row.n;
    }
    return NextResponse.json({ ok: true, enabled: true, schemaVersion: GOVERNANCE_SCHEMA_VERSION, tableCounts });
  } finally {
    db.close();
  }
}
