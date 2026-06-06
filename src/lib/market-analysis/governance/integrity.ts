import 'server-only';
import { getGovernanceDb, initGovernanceTables } from './db';
import type { IntegrityIssue } from './types';

/**
 * Read-only governance integrity scan (Pass 1 scaffold).
 * Detects referential / consistency problems across the ma_* tables.
 * Pure read — mutates nothing. Not wired to any route or UI yet.
 */
export function runGovernanceIntegrityCheck(): IntegrityIssue[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const issues: IntegrityIssue[] = [];
    const ids = (sql: string): string[] =>
      (db.prepare(sql).all() as Array<{ id: number | string }>).map((r) => String(r.id));
    const add = (code: string, label: string, rows: string[]) => {
      if (rows.length) issues.push({ code, label, count: rows.length, sample: rows.slice(0, 25) });
    };

    add('proposal_missing_vessel', 'Proposals pointing to a missing vessel',
      ids(`SELECT p.id FROM ma_vessel_field_proposals p
           LEFT JOIN ma_vessels v ON v.id = p.vessel_id WHERE v.id IS NULL`));
    add('proposal_missing_source', 'Proposals pointing to a missing source',
      ids(`SELECT id FROM ma_vessel_field_proposals
           WHERE source_id IS NOT NULL AND source_id NOT IN (SELECT id FROM ma_sources)`));
    add('proposal_missing_extraction', 'Proposals pointing to a missing extraction',
      ids(`SELECT id FROM ma_vessel_field_proposals
           WHERE extraction_id IS NOT NULL AND extraction_id NOT IN (SELECT id FROM ma_extractions)`));
    add('extraction_missing_source', 'Extraction logs pointing to a missing source',
      ids(`SELECT id FROM ma_extractions
           WHERE source_id NOT IN (SELECT id FROM ma_sources)`));
    add('comp_missing_source', 'Comps pointing to a missing source',
      ids(`SELECT id FROM ma_comps
           WHERE source_id IS NOT NULL AND source_id NOT IN (SELECT id FROM ma_sources)`));
    add('comp_missing_vessel', 'Comps pointing to a missing vessel',
      ids(`SELECT id FROM ma_comps
           WHERE vessel_id IS NOT NULL AND vessel_id NOT IN (SELECT id FROM ma_vessels)`));
    add('version_missing_snapshot', 'Report versions without a frozen vessel snapshot',
      ids(`SELECT id FROM ma_report_versions
           WHERE vessel_snapshot_json IS NULL OR vessel_snapshot_json IN ('', '{}')`));
    add('version_missing_comps', 'Report versions without frozen comp sets',
      ids(`SELECT id FROM ma_report_versions
           WHERE (active_comps_json IS NULL OR active_comps_json IN ('', '[]'))
             AND (closed_comps_json IS NULL OR closed_comps_json IN ('', '[]'))`));
    add('field_missing_source', 'Vessel fields referencing a missing source',
      ids(`SELECT id FROM ma_vessel_fields
           WHERE source_id IS NOT NULL AND source_id NOT IN (SELECT id FROM ma_sources)`));
    add('field_missing_extraction', 'Vessel fields referencing a missing extraction',
      ids(`SELECT id FROM ma_vessel_fields
           WHERE extraction_id IS NOT NULL AND extraction_id NOT IN (SELECT id FROM ma_extractions)`));
    add('duplicate_pending_proposal', 'Duplicate pending proposals for the same vessel field',
      ids(`SELECT MIN(id) AS id FROM ma_vessel_field_proposals
           WHERE status = 'pending' GROUP BY vessel_id, field_name HAVING COUNT(*) > 1`));
    add('resolved_marked_pending', 'Proposals marked pending but already resolved',
      ids(`SELECT id FROM ma_vessel_field_proposals
           WHERE status = 'pending' AND (resolved_at IS NOT NULL OR resolved_by IS NOT NULL)`));

    return issues;
  } finally {
    db.close();
  }
}
