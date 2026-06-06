import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';

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
