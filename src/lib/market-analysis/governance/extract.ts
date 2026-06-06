import { callAI } from '../../ai-client';
import { parseCompPdf } from '../parser';
import type { CompRecord } from '../storage';
import { createExtraction } from './extractions';
import { stageVesselProposals, type ProposalRow } from './proposals';
import { stageComps, type CompRow } from './comps';

/**
 * AI/parser wrappers (Pass 3). The ONLY governance module that touches the
 * network. Deterministic staging lives in proposals.ts / comps.ts and is unit
 * tested without AI. Each run writes exactly one immutable extraction log
 * BEFORE staging; if parsing/staging fails afterwards, the log is preserved and
 * a clear error is returned.
 */

export const VESSEL_FIELD_KEYS = [
  'name', 'builder', 'model', 'year', 'loa', 'beam', 'maxDraft', 'grossTonnage',
  'engineMake', 'engineModel', 'engineCount', 'engineHours', 'fuelType', 'hullMaterial',
  'cruiseSpeed', 'maxSpeed', 'range', 'staterooms', 'heads', 'flag', 'location',
  'askingPrice', 'refitYear',
] as const;

const MAX_CONTENT = 200_000; // cap text sent to the model

function buildVesselPrompt(content: string): string {
  return `You extract structured vessel facts from broker source text.

STRICT RULES:
- Extract ONLY facts explicitly present in the SOURCE TEXT below.
- Return null for any field not explicitly stated.
- Do NOT infer or guess specifications.
- Do NOT invent comps, prices, or sold data.
- Do NOT treat marketing language ("stunning", "turnkey", "must-see") as verified fact.

Return ONLY a JSON object (no prose, no code fences) with EXACTLY these keys:
${JSON.stringify(VESSEL_FIELD_KEYS)}
Each value must be a string, or null if not explicitly present.

SOURCE TEXT:
"""
${content.slice(0, MAX_CONTENT)}
"""`;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let t = String(raw).trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const obj = JSON.parse(t);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('expected a JSON object');
  return obj as Record<string, unknown>;
}

export interface RunVesselExtractionArgs {
  sourceId: number;
  vesselId: number;
  content: string;
  model?: string;
  triggeredBy?: string | null;
  createdBy?: string | null;
}

export async function runVesselExtraction(
  args: RunVesselExtractionArgs
): Promise<{ extractionId: number; proposals: ProposalRow[] }> {
  const raw = await callAI(buildVesselPrompt(args.content), 1000); // network

  // Immutable log written BEFORE staging, preserving raw model output.
  const extraction = createExtraction({
    sourceId: args.sourceId,
    targetType: 'vessel',
    targetId: args.vesselId,
    model: args.model ?? 'callAI',
    triggeredBy: args.triggeredBy ?? null,
    extracted: { raw },
    originalStatus: 'ai_unconfirmed',
  });

  let fields: Record<string, unknown>;
  try {
    const obj = parseJsonObject(raw);
    fields = {};
    for (const k of VESSEL_FIELD_KEYS) if (k in obj) fields[k] = obj[k];
  } catch (err) {
    throw new Error(
      `vessel extraction produced unparseable output; extraction log ${extraction.id} preserved` +
        ` (${err instanceof Error ? err.message : String(err)})`
    );
  }

  const proposals = stageVesselProposals({
    vesselId: args.vesselId,
    sourceId: args.sourceId,
    extractionId: extraction.id,
    fields,
    createdBy: args.createdBy ?? null,
  });
  return { extractionId: extraction.id, proposals };
}

export interface RunCompExtractionArgs {
  sourceId: number;
  content: string;
  vesselId?: number | null;
  format?: 'denison' | 'ai';
  model?: string;
  triggeredBy?: string | null;
  createdBy?: string | null;
  sourceLabel?: string;
}

export async function runCompExtraction(
  args: RunCompExtractionArgs
): Promise<{ extractionId: number; comps: CompRow[] }> {
  const format = args.format ?? 'denison';
  const label = args.sourceLabel ?? `source:${args.sourceId}`;
  let comps: CompRecord[] = [];
  let extractedPayload: unknown;

  if (format === 'ai') {
    const out = await callAI(buildCompPrompt(args.content), 1500); // network
    extractedPayload = { format, raw: out };
    comps = parseCompArray(out, label);
  } else {
    comps = parseCompPdf(args.content.slice(0, MAX_CONTENT), label); // deterministic
    extractedPayload = { format, comps };
  }

  const extraction = createExtraction({
    sourceId: args.sourceId,
    targetType: 'comp',
    targetId: args.vesselId ?? null,
    model: format === 'ai' ? (args.model ?? 'callAI') : 'parseCompPdf',
    triggeredBy: args.triggeredBy ?? null,
    extracted: extractedPayload,
    originalStatus: 'ai_unconfirmed',
  });

  const staged = stageComps({
    vesselId: args.vesselId ?? null,
    sourceId: args.sourceId,
    extractionId: extraction.id,
    comps,
    createdBy: args.createdBy ?? null,
  });
  return { extractionId: extraction.id, comps: staged };
}

function buildCompPrompt(content: string): string {
  return `Extract comparable yacht listings/sales explicitly present in the text.

STRICT RULES:
- Use ONLY data explicitly stated. Use null for anything missing.
- Do NOT invent comps, asking prices, sold prices, or dates.
- Do NOT treat marketing language as fact.

Return ONLY a JSON array (no prose, no code fences). Each element:
{"name":string|null,"make":string|null,"model":string|null,"year":string|null,"length":string|null,
 "listedPrice":number|null,"soldPrice":number|null,"askPrice":number|null,
 "listedDate":string|null,"soldDate":string|null,"daysOnMarket":number|null,"location":string|null}

SOURCE TEXT:
"""
${content.slice(0, MAX_CONTENT)}
"""`;
}

function parseCompArray(raw: string, source: string): CompRecord[] {
  let t = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('[');
  const e = t.lastIndexOf(']');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const arr = JSON.parse(t);
  if (!Array.isArray(arr)) throw new Error('expected a JSON array of comps');
  return arr.map((o: Record<string, unknown>) => ({
    name: str(o.name), make: str(o.make), model: str(o.model), year: str(o.year), length: str(o.length),
    listedPrice: num(o.listedPrice), soldPrice: num(o.soldPrice), askPrice: num(o.askPrice),
    listedDate: str(o.listedDate), soldDate: str(o.soldDate), daysOnMarket: num(o.daysOnMarket),
    location: str(o.location), source,
  }));
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number | null => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
