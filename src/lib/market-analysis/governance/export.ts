import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { GovError } from './errors';
import { GOVERNANCE_SCHEMA_VERSION } from './types';

/**
 * Governed vessel deal-file export (Pass 7).
 *
 * Read-only assembler that produces a complete, self-contained audit package for
 * one governed vessel from the ma_* tables only. No writes, no mutation beyond the
 * idempotent table init shared by all governed code, no network, no quick-flow
 * tables (market_analyses is never read or written). Pending/rejected items are
 * included on purpose — this is an audit export, not a valuation-only view.
 */

export const EXPORT_SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;

function parseJsonText(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return s; } // preserve raw string on failure
}

// table/col are internal constants (never user input) -> safe to interpolate.
function selectIn(db: Database.Database, table: string, col: string, ids: number[]): Row[] {
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM ${table} WHERE ${col} IN (${ph}) ORDER BY id`).all(...ids) as Row[];
}

export interface VesselExport {
  exportSchemaVersion: number;
  generatedAt: string;
  governanceSchemaVersion: number;
  schemaMeta: Record<string, string>;
  vessel: Row;
  liveFields: Row[];
  fieldHistory: Row[];
  sources: Row[];
  extractions: Row[];
  proposals: Row[];
  comps: Row[];
  compHistory: Row[];
  reports: Row[];
  reportSections: Row[];
  reportVersions: Row[];
  counts: Record<string, number>;
}

export function buildVesselExport(vesselId: number): VesselExport {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const vessel = db.prepare(`SELECT * FROM ma_vessels WHERE id = ?`).get(vesselId) as Row | undefined;
    if (!vessel) throw new GovError(404, 'vessel not found');

    const liveFields = db.prepare(`SELECT * FROM ma_vessel_fields WHERE vessel_id = ? ORDER BY field_key`).all(vesselId) as Row[];
    const fieldHistory = db.prepare(`SELECT * FROM ma_field_history WHERE vessel_id = ? ORDER BY id`).all(vesselId) as Row[];
    const proposalsRaw = db.prepare(`SELECT * FROM ma_vessel_field_proposals WHERE vessel_id = ? ORDER BY id`).all(vesselId) as Row[];
    const compsRaw = db.prepare(`SELECT * FROM ma_comps WHERE vessel_id = ? ORDER BY id`).all(vesselId) as Row[];

    const compIds = compsRaw.map((c) => c.id as number);
    const compHistory = selectIn(db, 'ma_comp_field_history', 'comp_id', compIds);

    const reports = db.prepare(`SELECT * FROM ma_reports WHERE vessel_id = ? ORDER BY id`).all(vesselId) as Row[];
    const reportIds = reports.map((r) => r.id as number);
    const reportSectionsRaw = selectIn(db, 'ma_report_sections', 'report_id', reportIds);
    const reportVersionsRaw = selectIn(db, 'ma_report_versions', 'report_id', reportIds);

    // Extractions: those targeting this vessel, plus any referenced by the
    // vessel's proposals/comps (audit completeness across link paths).
    const exIds = new Set<number>();
    for (const e of db.prepare(`SELECT id FROM ma_extractions WHERE target_id = ?`).all(vesselId) as Row[]) exIds.add(e.id as number);
    for (const p of proposalsRaw) if (p.extraction_id != null) exIds.add(p.extraction_id as number);
    for (const c of compsRaw) if (c.extraction_id != null) exIds.add(c.extraction_id as number);
    const extractionsRaw = selectIn(db, 'ma_extractions', 'id', [...exIds]);

    // Sources referenced anywhere in this vessel's lineage (sources have no vessel_id).
    const srcIds = new Set<number>();
    for (const p of proposalsRaw) if (p.source_id != null) srcIds.add(p.source_id as number);
    for (const c of compsRaw) if (c.source_id != null) srcIds.add(c.source_id as number);
    for (const e of extractionsRaw) if (e.source_id != null) srcIds.add(e.source_id as number);
    const sources = selectIn(db, 'ma_sources', 'id', [...srcIds]);

    const metaRows = db.prepare(`SELECT key, value FROM ma_schema_meta`).all() as Array<{ key: string; value: string }>;
    const schemaMeta: Record<string, string> = {};
    for (const m of metaRows) schemaMeta[m.key] = m.value;

    // Parse JSON-in-TEXT columns into nested JSON (raw kept alongside; raw string preserved on failure).
    const extractions = extractionsRaw.map((e) => ({ ...e, extracted: parseJsonText(e.extracted_json) }));
    const proposals = proposalsRaw.map((p) => ({ ...p, history: parseJsonText(p.history_json) }));
    const comps = compsRaw.map((c) => ({ ...c, fields: parseJsonText(c.fields_json) }));
    const reportSections = reportSectionsRaw.map((s) => ({ ...s, content: parseJsonText(s.content_json) }));
    const reportVersions = reportVersionsRaw.map((v) => ({
      ...v,
      warnings: parseJsonText(v.warnings_json),
      vessel_snapshot: parseJsonText(v.vessel_snapshot_json),
      active_comps: parseJsonText(v.active_comps_json),
      closed_comps: parseJsonText(v.closed_comps_json),
      sections: parseJsonText(v.sections_json),
    }));

    const counts: Record<string, number> = {
      vessel: 1,
      liveFields: liveFields.length,
      fieldHistory: fieldHistory.length,
      sources: sources.length,
      extractions: extractions.length,
      proposals: proposals.length,
      comps: comps.length,
      compHistory: compHistory.length,
      reports: reports.length,
      reportSections: reportSections.length,
      reportVersions: reportVersions.length,
    };

    return {
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      governanceSchemaVersion: Number(schemaMeta.governance_schema_version ?? GOVERNANCE_SCHEMA_VERSION),
      schemaMeta,
      vessel,
      liveFields,
      fieldHistory,
      sources,
      extractions,
      proposals,
      comps,
      compHistory,
      reports,
      reportSections,
      reportVersions,
      counts,
    };
  } finally {
    db.close();
  }
}
