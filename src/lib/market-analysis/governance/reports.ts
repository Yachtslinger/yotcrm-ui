import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { GovError } from './errors';
import { getVessel } from './vessels';
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
