import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { GovError } from './errors';

/**
 * Governed vessel records + live field reads (Pass 3).
 * Pass 3 may create/list/get vessels and READ live fields.
 * It must NOT write live vessel fields (acceptance/override is Pass 4).
 */

const MAX_STR = 200;

export interface VesselInput {
  displayName?: string;
  boatId?: number | null;
  listingId?: number | null;
  createdBy?: string | null;
}

export interface VesselRow {
  id: number;
  display_name: string;
  boat_id: number | null;
  listing_id: number | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

export interface VesselFieldRow {
  id: number;
  vessel_id: number;
  field_key: string;
  value: string | null;
  status: string;
  source_id: number | null;
  extraction_id: number | null;
  created_by: string | null;
  updated_by: string | null;
  verified_by: string | null;
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

export function createVessel(input: VesselInput): VesselRow {
  initGovernanceTables();
  const name = String(input.displayName ?? '').slice(0, MAX_STR);
  const createdBy = input.createdBy ? String(input.createdBy).slice(0, MAX_STR) : null;
  const db = getGovernanceDb();
  try {
    const info = db
      .prepare(`INSERT INTO ma_vessels (display_name, boat_id, listing_id, created_by) VALUES (?, ?, ?, ?)`)
      .run(name, input.boatId ?? null, input.listingId ?? null, createdBy);
    return getVesselInternal(db, Number(info.lastInsertRowid)) as VesselRow;
  } finally {
    db.close();
  }
}

export function listVessels(limit = 100): VesselRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const l = Math.min(Math.max(limit, 1), 500);
    return db.prepare(`SELECT * FROM ma_vessels ORDER BY id DESC LIMIT ?`).all(l) as VesselRow[];
  } finally {
    db.close();
  }
}

export function getVessel(id: number): VesselRow | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return getVesselInternal(db, id);
  } finally {
    db.close();
  }
}

export function getVesselFields(vesselId: number): VesselFieldRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return db
      .prepare(`SELECT * FROM ma_vessel_fields WHERE vessel_id = ? ORDER BY field_key`)
      .all(vesselId) as VesselFieldRow[];
  } finally {
    db.close();
  }
}

function getVesselInternal(db: Database.Database, id: number): VesselRow | null {
  return (db.prepare(`SELECT * FROM ma_vessels WHERE id = ?`).get(id) as VesselRow | undefined) ?? null;
}

// Shared connection read used by the proposal staging logic for conflict detection.
export function getVesselFieldRow(db: Database.Database, vesselId: number, fieldKey: string): VesselFieldRow | null {
  return (
    (db.prepare(`SELECT * FROM ma_vessel_fields WHERE vessel_id = ? AND field_key = ?`).get(vesselId, fieldKey) as
      | VesselFieldRow
      | undefined) ?? null
  );
}

// ---------------------------------------------------------------------------
// Pass 4: live field writes (broker-approved). Additive; no schema changes.
// ---------------------------------------------------------------------------

export interface WriteLiveFieldArgs {
  vesselId: number;
  fieldKey: string;
  value: string | null;
  status: string;
  sourceId?: number | null;
  extractionId?: number | null;
  by?: string | null;
  verifiedBy?: string | null;
  acceptedBy?: string | null;
}

/**
 * Upsert a live vessel field (UNIQUE vessel_id+field_key). created_by is set on
 * insert and preserved on update. db-param so callers compose it in a transaction.
 */
export function writeLiveField(db: Database.Database, args: WriteLiveFieldArgs): VesselFieldRow {
  const by = args.by ?? null;
  db.prepare(
    `INSERT INTO ma_vessel_fields
       (vessel_id, field_key, value, status, source_id, extraction_id, created_by, updated_by, verified_by, accepted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vessel_id, field_key) DO UPDATE SET
       value = excluded.value,
       status = excluded.status,
       source_id = excluded.source_id,
       extraction_id = excluded.extraction_id,
       updated_by = excluded.updated_by,
       verified_by = excluded.verified_by,
       accepted_by = excluded.accepted_by,
       updated_at = datetime('now')`
  ).run(
    args.vesselId, args.fieldKey, args.value, args.status,
    args.sourceId ?? null, args.extractionId ?? null,
    by, by, args.verifiedBy ?? null, args.acceptedBy ?? null
  );
  return getVesselFieldRow(db, args.vesselId, args.fieldKey) as VesselFieldRow;
}

export interface FieldHistoryArgs {
  vesselId: number;
  fieldKey: string;
  action: string;
  value: string | null;
  status: string | null;
  source?: string | null;
  by?: string | null;
}

export function appendFieldHistory(db: Database.Database, h: FieldHistoryArgs): void {
  db.prepare(
    `INSERT INTO ma_field_history (vessel_id, field_key, action, value, status, source, by_user)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(h.vesselId, h.fieldKey, h.action, h.value, h.status, h.source ?? null, h.by ?? null);
}

/** Manual broker entry of a field value -> verified, provenance 'manual'. */
export function setVesselField(vesselId: number, fieldKey: string, value: string, by?: string | null): VesselFieldRow {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    if (!getVesselInternal(db, vesselId)) throw new GovError(404, 'vessel not found');
    const run = db.transaction(() => {
      const field = writeLiveField(db, {
        vesselId, fieldKey, value: String(value), status: 'verified',
        sourceId: null, extractionId: null, by, verifiedBy: by ?? null, acceptedBy: null,
      });
      appendFieldHistory(db, { vesselId, fieldKey, action: 'manual set', value: String(value), status: 'verified', source: 'manual', by });
      return field;
    });
    return run();
  } finally {
    db.close();
  }
}

/** Mark an existing live field as broker-verified. 404 if the field does not exist. */
export function verifyVesselField(vesselId: number, fieldKey: string, by?: string | null): VesselFieldRow {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const run = db.transaction(() => {
      const existing = getVesselFieldRow(db, vesselId, fieldKey);
      if (!existing) throw new GovError(404, 'vessel field not found');
      db.prepare(
        `UPDATE ma_vessel_fields SET status='verified', verified_by=?, updated_by=?, updated_at=datetime('now')
         WHERE vessel_id=? AND field_key=?`
      ).run(by ?? null, by ?? null, vesselId, fieldKey);
      appendFieldHistory(db, {
        vesselId, fieldKey, action: 'verified', value: existing.value, status: 'verified',
        source: existing.source_id != null ? 'source' : 'manual', by,
      });
      return getVesselFieldRow(db, vesselId, fieldKey) as VesselFieldRow;
    });
    return run();
  } finally {
    db.close();
  }
}
