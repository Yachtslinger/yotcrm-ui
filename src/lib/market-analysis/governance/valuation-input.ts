import type { VesselFieldRow } from './vessels';
import type { CompRow } from './comps';
import type { CompRecord } from '../storage';
import type { SubjectVesselAttrs } from '../valuation';

/**
 * Pure mappers: governed live fields + approved comps -> the existing engine's
 * input shape. No DB, no network, no mutation. Only fields with a usable status
 * (verified | overridden | ai_accepted) and only approved comps are considered.
 */

export const USABLE_FIELD_STATUSES = new Set(['verified', 'overridden', 'ai_accepted']);

/** Reduce live field rows to { field_key: value } keeping only usable, non-empty values. */
export function usableFieldMap(fields: VesselFieldRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!USABLE_FIELD_STATUSES.has(f.status)) continue;
    if (f.value == null || String(f.value).trim() === '') continue;
    out[f.field_key] = String(f.value).trim();
  }
  return out;
}

export function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseYear(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Length in feet from "112 ft" / "108ft" / "34.5m". Returns 0 when unparseable. */
export function parseLengthFt(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = String(raw).match(/([\d.]+)\s*m(?:eter)?/i);
  if (m) return Math.round(parseFloat(m[1]) * 3.28084);
  const ft = String(raw).match(/([\d.]+)/);
  return ft ? parseFloat(ft[1]) : 0;
}

export function parseIntOrNull(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw).replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the engine subject from usable live fields. Documented gaps: the governed
 * field set has no engineHp or refitScope source, so those default to null/"".
 */
export function buildSubjectAttrs(fields: VesselFieldRow[]): SubjectVesselAttrs {
  const m = usableFieldMap(fields);
  return {
    year: parseYear(m.year),
    lengthFt: parseLengthFt(m.loa),
    make: m.builder ?? '',
    grossTonnage: parseNum(m.grossTonnage),
    engineCount: parseIntOrNull(m.engineCount),
    engineBrand: m.engineMake ?? '',
    engineHp: parseNum(m.engineHp), // no governed source -> null
    lastRefitYear: parseIntOrNull(m.refitYear),
    refitScope: (m.refitScope as SubjectVesselAttrs['refitScope']) ?? '', // no governed source -> ''
    askingPrice: parseNum(m.askingPrice) ?? 0,
  };
}

function compRecordFromRow(c: CompRow): CompRecord {
  // Prefer the lineage blob captured at staging; fall back to typed columns.
  try {
    const parsed = JSON.parse(c.fields_json) as Partial<CompRecord>;
    if (parsed && typeof parsed === 'object') {
      return {
        name: String(parsed.name ?? ''),
        make: String(parsed.make ?? c.builder ?? ''),
        model: String(parsed.model ?? ''),
        year: String(parsed.year ?? c.year ?? ''),
        length: String(parsed.length ?? c.loa ?? ''),
        listedPrice: parsed.listedPrice ?? c.last_ask ?? null,
        soldPrice: parsed.soldPrice ?? c.sold_price ?? null,
        askPrice: parsed.askPrice ?? c.asking_price ?? null,
        listedDate: String(parsed.listedDate ?? ''),
        soldDate: String(parsed.soldDate ?? ''),
        daysOnMarket: parsed.daysOnMarket ?? null,
        location: String(parsed.location ?? ''),
        source: String(parsed.source ?? `comp:${c.id}`),
      };
    }
  } catch {
    /* fall through to columns */
  }
  return {
    name: '', make: c.builder ?? '', model: '', year: c.year ?? '', length: c.loa ?? '',
    listedPrice: c.last_ask ?? null, soldPrice: c.sold_price ?? null, askPrice: c.asking_price ?? null,
    listedDate: '', soldDate: '', daysOnMarket: null, location: '', source: `comp:${c.id}`,
  };
}

/** Approved-only comps split into sold (closed) and active pools. */
export function selectApprovedComps(comps: CompRow[]): { sold: CompRecord[]; active: CompRecord[] } {
  const sold: CompRecord[] = [];
  const active: CompRecord[] = [];
  for (const c of comps) {
    if (c.status !== 'approved') continue;
    const rec = compRecordFromRow(c);
    if (c.type === 'closed') sold.push(rec);
    else active.push(rec);
  }
  return { sold, active };
}
