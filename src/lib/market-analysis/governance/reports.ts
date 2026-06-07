import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { GovError } from './errors';
import { getVessel, getVesselFields } from './vessels';
import { USABLE_FIELD_STATUSES } from './valuation-input';
import { runGovernedValuation, normalizeMode, type GovernedMode } from './valuation';
import { buildWorkingSections, generateNarrativeSections, type WorkingSection } from './sections';

/**
 * Working (mutable) report lifecycle. Pass 5 writes ma_reports + ma_report_sections
 * ONLY. It never writes ma_report_versions (finalized/frozen snapshots) — that is a
 * later pass — and adds no deal-file export.
 */

export interface ReportRow {
  id: number;
  vessel_id: number;
  mode: string;
  version: number;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

export interface SectionRow {
  id: number;
  report_id: number;
  section_key: string;
  content_json: string;
  status: string;
  source: string | null;
  generated_by: string | null;
  approved_by: string | null;
  updated_at: string;
  schema_version: number;
}

const modeColumn = (m: GovernedMode): 'sell' | 'buy' => (m === 'buyer' ? 'buy' : 'sell');

function upsertSection(db: Database.Database, reportId: number, s: WorkingSection, by: string | null): void {
  db.prepare(
    `INSERT INTO ma_report_sections (report_id, section_key, content_json, status, source, generated_by)
     VALUES (?, ?, ?, 'generated', ?, ?)
     ON CONFLICT(report_id, section_key) DO UPDATE SET
       content_json = excluded.content_json,
       status       = 'generated',
       source       = excluded.source,
       generated_by = excluded.generated_by,
       updated_at   = datetime('now')`
  ).run(reportId, s.section_key, JSON.stringify(s.content ?? {}), s.source, by);
}

function readReport(db: Database.Database, reportId: number): { report: ReportRow; sections: Array<SectionRow & { content: unknown }> } | null {
  const report = db.prepare(`SELECT * FROM ma_reports WHERE id = ?`).get(reportId) as ReportRow | undefined;
  if (!report) return null;
  const rows = db.prepare(`SELECT * FROM ma_report_sections WHERE report_id = ? ORDER BY id`).all(reportId) as SectionRow[];
  const sections = rows.map((r) => {
    let content: unknown = null;
    try { content = JSON.parse(r.content_json); } catch { content = r.content_json; }
    return { ...r, content };
  });
  return { report, sections };
}

export interface CreateReportOpts {
  mode?: unknown;
  by?: string | null;
  narrative?: boolean;
}

export async function createOrRefreshReport(vesselId: number, opts: CreateReportOpts = {}) {
  initGovernanceTables();
  if (!getVessel(vesselId)) throw new GovError(404, 'vessel not found');

  const mode = normalizeMode(opts.mode);
  const by = opts.by != null ? String(opts.by) : null;

  // Compute valuation + deterministic sections (no network).
  const gv = runGovernedValuation(vesselId, { mode });
  const sections: WorkingSection[] = buildWorkingSections(gv);

  // Optional AI narrative — network, done BEFORE the write transaction so no
  // DB write-lock is held across a network call.
  if (opts.narrative) {
    const narrative = await generateNarrativeSections(gv);
    sections.push(...narrative);
  }

  const db = getGovernanceDb();
  try {
    const col = modeColumn(mode);
    const run = db.transaction(() => {
      let report = db
        .prepare(`SELECT * FROM ma_reports WHERE vessel_id = ? AND mode = ? AND version = 0`)
        .get(vesselId, col) as ReportRow | undefined;
      if (!report) {
        const info = db
          .prepare(`INSERT INTO ma_reports (vessel_id, mode, version, status, created_by, updated_by) VALUES (?, ?, 0, 'draft', ?, ?)`)
          .run(vesselId, col, by, by);
        report = db.prepare(`SELECT * FROM ma_reports WHERE id = ?`).get(Number(info.lastInsertRowid)) as ReportRow;
      } else {
        db.prepare(`UPDATE ma_reports SET updated_by = ?, updated_at = datetime('now') WHERE id = ?`).run(by, report.id);
      }
      for (const s of sections) upsertSection(db, report.id, s, by);
      return readReport(db, report.id);
    });
    return run();
  } finally {
    db.close();
  }
}

export function getReport(reportId: number) {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return readReport(db, reportId);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Pass 6: finalize -> immutable frozen snapshot in ma_report_versions.
// Schema has UNIQUE(report_id, version) + UPDATE/DELETE immutability triggers,
// so re-finalize creates the NEXT incrementing version (MAX+1, starting at 1).
// This preserves every frozen snapshot; working rows stay mutable and the
// snapshot is a fully independent copy.
// ---------------------------------------------------------------------------

export interface ReportVersionRow {
  id: number;
  report_id: number;
  version: number;
  finalized_by: string | null;
  finalized_at: string;
  confidence: string | null;
  warnings_json: string;
  vessel_snapshot_json: string;
  active_comps_json: string;
  closed_comps_json: string;
  sections_json: string;
  schema_version: number;
}

function buildFinalizeWarnings(gv: ReturnType<typeof runGovernedValuation>): string[] {
  const w: string[] = [];
  if (!gv.sufficient) w.push('No approved sold comps fed the valuation; calculated value is 0.');
  if (!gv.subject.make) w.push('Vessel builder/make missing from accepted fields.');
  if (!gv.subject.lengthFt) w.push('Vessel length (loa) missing or unparseable.');
  if (!gv.subject.year) w.push('Vessel year missing from accepted fields.');
  if (!gv.subject.askingPrice) w.push('Asking price missing from accepted fields.');
  return w;
}

export interface FinalizeOpts {
  by?: string | null;
}

export function finalizeReport(reportId: number, opts: FinalizeOpts = {}): { report: ReportRow; version: ReportVersionRow } {
  initGovernanceTables();

  // Read-only gather (own connections) before opening the write transaction.
  const probe = getReport(reportId);
  if (!probe) throw new GovError(404, 'report not found');
  const mode = normalizeMode(probe.report.mode);
  const gv = runGovernedValuation(probe.report.vessel_id, { mode });
  const usableFields = getVesselFields(probe.report.vessel_id)
    .filter((f) => USABLE_FIELD_STATUSES.has(f.status))
    .map((f) => ({ field_key: f.field_key, value: f.value, status: f.status, source_id: f.source_id, extraction_id: f.extraction_id }));

  const by = opts.by != null ? String(opts.by) : null;
  const db = getGovernanceDb();
  try {
    const run = db.transaction(() => {
      const report = db.prepare(`SELECT * FROM ma_reports WHERE id = ?`).get(reportId) as ReportRow | undefined;
      if (!report) throw new GovError(404, 'report not found');

      // Snapshot the CURRENT stored working sections verbatim (incl. narrative).
      const sectionRows = db.prepare(`SELECT * FROM ma_report_sections WHERE report_id = ? ORDER BY id`).all(reportId) as SectionRow[];
      const sections: Record<string, { content: unknown; source: string | null; status: string }> = {};
      for (const r of sectionRows) {
        let content: unknown;
        try { content = JSON.parse(r.content_json); } catch { content = r.content_json; }
        sections[r.section_key] = { content, source: r.source, status: r.status };
      }

      const nextVersion = (db
        .prepare(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM ma_report_versions WHERE report_id = ?`)
        .get(reportId) as { v: number }).v;

      const vesselSnapshot = {
        mode,
        subject: gv.subject,
        valuation: gv.valuation,
        fields: usableFields, // governed input statuses/sources used
        soldCompCount: gv.soldCompCount,
        activeCompCount: gv.activeCompCount,
        sufficient: gv.sufficient,
      };
      const warnings = buildFinalizeWarnings(gv);

      const info = db
        .prepare(
          `INSERT INTO ma_report_versions
             (report_id, version, finalized_by, confidence, warnings_json,
              vessel_snapshot_json, active_comps_json, closed_comps_json, sections_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          reportId,
          nextVersion,
          by,
          String(gv.valuation.confidenceScore),
          JSON.stringify(warnings),
          JSON.stringify(vesselSnapshot),
          JSON.stringify(gv.activeComps), // context only
          JSON.stringify(gv.soldComps),   // closed/sold comps used for the math
          JSON.stringify(sections)
        );

      // Working row stays version 0 / mutable; mark status informationally.
      db.prepare(`UPDATE ma_reports SET status = 'finalized', updated_by = ?, updated_at = datetime('now') WHERE id = ?`).run(by, reportId);

      const version = db.prepare(`SELECT * FROM ma_report_versions WHERE id = ?`).get(Number(info.lastInsertRowid)) as ReportVersionRow;
      const updatedReport = db.prepare(`SELECT * FROM ma_reports WHERE id = ?`).get(reportId) as ReportRow;
      return { report: updatedReport, version };
    });
    return run();
  } finally {
    db.close();
  }
}

export interface FrozenReportVersion extends ReportVersionRow {
  warnings: unknown;
  vessel_snapshot: unknown;
  active_comps: unknown;
  closed_comps: unknown;
  sections: unknown;
}

export function getReportVersion(reportId: number, version: number): FrozenReportVersion | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const row = db
      .prepare(`SELECT * FROM ma_report_versions WHERE report_id = ? AND version = ?`)
      .get(reportId, version) as ReportVersionRow | undefined;
    if (!row) return null;
    const parse = (s: string): unknown => { try { return JSON.parse(s); } catch { return s; } };
    return {
      ...row,
      warnings: parse(row.warnings_json),
      vessel_snapshot: parse(row.vessel_snapshot_json),
      active_comps: parse(row.active_comps_json),
      closed_comps: parse(row.closed_comps_json),
      sections: parse(row.sections_json),
    };
  } finally {
    db.close();
  }
}

export type ReportVersionSummary = Pick<ReportVersionRow, 'id' | 'report_id' | 'version' | 'finalized_by' | 'finalized_at' | 'confidence'>;

export function listReportVersions(reportId: number): ReportVersionSummary[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return db
      .prepare(`SELECT id, report_id, version, finalized_by, finalized_at, confidence FROM ma_report_versions WHERE report_id = ? ORDER BY version`)
      .all(reportId) as ReportVersionSummary[];
  } finally {
    db.close();
  }
}
