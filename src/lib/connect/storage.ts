// src/lib/connect/storage.ts
// Connect engine — all database read/write operations.
// Pure data layer — no scoring logic, no HTTP concerns.

import { getConnectDb, initConnectTables } from './db';
import { calculateConnectScore, computePriorityScore } from './scoring';
import type {
  MatchRow, MatchListItem, MatchDetail, ExposureEntry, OverrideRow,
  ConnectLead, ConnectBrochure, ExplanationReason, CautionFlag, NextAction, ScoreBreakdown,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString(); }

function parseJSON<T>(s: string | null, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// ─── Brochure loader ─────────────────────────────────────────────────────────

export function getBrochureForScoring(brochureId: number): ConnectBrochure | null {
  const db = getConnectDb();
  try {
    const row = db.prepare(
      `SELECT id, slug, vessel_name, builder, year, source_url, created_at, is_pocket_listing, vessel_data
       FROM brochures WHERE id = ?`
    ).get(brochureId) as any;
    if (!row) return null;
    const parsed = parseJSON<{ vessel?: object }>(row.vessel_data, {});
    return {
      id: row.id, slug: row.slug, vessel_name: row.vessel_name,
      builder: row.builder, year: row.year, source_url: row.source_url,
      created_at: row.created_at, is_pocket_listing: row.is_pocket_listing ?? 0,
      vessel: (parsed.vessel ?? {}) as ConnectBrochure['vessel'],
    };
  } finally { db.close(); }
}

export function getAllActiveBrochures(): ConnectBrochure[] {
  const db = getConnectDb();
  try {
    const rows = db.prepare(
      `SELECT id, slug, vessel_name, builder, year, source_url, created_at, is_pocket_listing, vessel_data
       FROM brochures ORDER BY created_at DESC`
    ).all() as any[];
    return rows.map(row => {
      const parsed = parseJSON<{ vessel?: object }>(row.vessel_data, {});
      return {
        id: row.id, slug: row.slug, vessel_name: row.vessel_name,
        builder: row.builder, year: row.year, source_url: row.source_url,
        created_at: row.created_at, is_pocket_listing: row.is_pocket_listing ?? 0,
        vessel: (parsed.vessel ?? {}) as ConnectBrochure['vessel'],
      };
    });
  } finally { db.close(); }
}

// ─── Lead loader ─────────────────────────────────────────────────────────────

export function getAllActiveLeads(): ConnectLead[] {
  const db = getConnectDb();
  try {
    const activeStatuses = ['active','warm','hot','qualified','interested','pipeline','new'];
    const placeholders = activeStatuses.map(() => '?').join(',');
    return db.prepare(
      `SELECT id, name, email, phone, status, notes,
              budget_min, budget_max, loa_min, loa_max, year_min, year_max,
              make_preference, preferred_location, vessel_type_pref,
              flybridge_pref, stabilizers_pref, min_cabins, engine_type_pref,
              last_contacted_at, updated_at, created_at
       FROM leads
       WHERE status IN (${placeholders})
       ORDER BY updated_at DESC`
    ).all(...activeStatuses) as ConnectLead[];
  } finally { db.close(); }
}

export function getLeadById(leadId: number): ConnectLead | null {
  const db = getConnectDb();
  try {
    return db.prepare(
      `SELECT id, name, email, phone, status, notes,
              budget_min, budget_max, loa_min, loa_max, year_min, year_max,
              make_preference, preferred_location, vessel_type_pref,
              flybridge_pref, stabilizers_pref, min_cabins, engine_type_pref,
              last_contacted_at, updated_at, created_at
       FROM leads WHERE id = ?`
    ).get(leadId) as ConnectLead | null;
  } finally { db.close(); }
}

// ─── Exposure helpers ────────────────────────────────────────────────────────

export function getExposureSummary(leadId: number, brochureId: number): { sent_count: number; last_sent_at: string | null } {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(
      `SELECT sent_count, last_sent_at FROM connect_exposure_summary WHERE lead_id = ? AND brochure_id = ?`
    ).get(leadId, brochureId) as any;
    return { sent_count: row?.sent_count ?? 0, last_sent_at: row?.last_sent_at ?? null };
  } finally { db.close(); }
}

export function getEngagementCount(leadId: number, brochureId: number, withinDays = 30): number {
  const db = getConnectDb();
  try {
    initConnectTables();
    const since = new Date(Date.now() - withinDays * 86_400_000).toISOString();
    const row = db.prepare(
      `SELECT COUNT(*) as c FROM connect_engagement_events
       WHERE lead_id = ? AND brochure_id = ? AND occurred_at >= ?`
    ).get(leadId, brochureId, since) as any;
    return row?.c ?? 0;
  } finally { db.close(); }
}

// ─── Override / suppression helpers ──────────────────────────────────────────

export function getActiveOverride(leadId: number, brochureId: number): OverrideRow | null {
  const db = getConnectDb();
  try {
    initConnectTables();
    return db.prepare(
      `SELECT id, override_type, boost_value, reason, expires_at, created_at
       FROM connect_broker_overrides
       WHERE lead_id = ? AND brochure_id = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC LIMIT 1`
    ).get(leadId, brochureId) as OverrideRow | null;
  } finally { db.close(); }
}

export function isSuppressionActive(leadId: number, brochureId: number): boolean {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(
      `SELECT 1 FROM connect_suppression_rules
       WHERE lead_id = ? AND brochure_id = ?
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       LIMIT 1`
    ).get(leadId, brochureId);
    return !!row;
  } finally { db.close(); }
}

// ─── Score a single pair and persist ─────────────────────────────────────────

export function scoreAndPersistPair(leadId: number, brochureId: number): MatchRow | null {
  const lead = getLeadById(leadId);
  const brochure = getBrochureForScoring(brochureId);
  if (!lead || !brochure) return null;

  const { sent_count } = getExposureSummary(leadId, brochureId);
  const engagementCount = getEngagementCount(leadId, brochureId, 30);
  const suppressionActive = isSuppressionActive(leadId, brochureId);
  const override = getActiveOverride(leadId, brochureId);

  const brokerBoost = (override?.override_type === 'boost') ? (override.boost_value ?? 15) : 0;

  const result = calculateConnectScore(lead, brochure, {
    sentCount: sent_count,
    engagementCount,
    brokerBoost,
    suppressionActive: suppressionActive || override?.override_type === 'suppress',
  });

  const priorityScore = computePriorityScore(
    result.score,
    !!(brochure.is_pocket_listing),
    brokerBoost,
    sent_count,
    engagementCount
  );

  const db = getConnectDb();
  try {
    initConnectTables();
    const upsert = db.prepare(`
      INSERT INTO connect_match_scores
        (lead_id, brochure_id, score, confidence, routing, manual_priority_score, is_stale, scored_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(lead_id, brochure_id) DO UPDATE SET
        score = excluded.score,
        confidence = excluded.confidence,
        routing = excluded.routing,
        manual_priority_score = excluded.manual_priority_score,
        is_stale = 0,
        scored_at = excluded.scored_at
    `);
    upsert.run(leadId, brochureId, result.score, result.confidence, result.routing, priorityScore, now());

    const row = db.prepare(
      `SELECT * FROM connect_match_scores WHERE lead_id = ? AND brochure_id = ?`
    ).get(leadId, brochureId) as MatchRow;

    // Upsert explanation
    const exp = result.explanation;
    db.prepare(`
      INSERT INTO connect_match_explanations
        (match_id, summary_sentence, top_reasons, top_penalties, caution_flags,
         next_best_action, score_breakdown, routing_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        summary_sentence = excluded.summary_sentence,
        top_reasons      = excluded.top_reasons,
        top_penalties    = excluded.top_penalties,
        caution_flags    = excluded.caution_flags,
        next_best_action = excluded.next_best_action,
        score_breakdown  = excluded.score_breakdown,
        routing_reason   = excluded.routing_reason,
        created_at       = excluded.created_at
    `).run(
      row.id,
      exp.summary_sentence,
      JSON.stringify(exp.top_reasons),
      JSON.stringify(exp.top_penalties),
      JSON.stringify(exp.caution_flags),
      JSON.stringify(exp.next_best_action),
      JSON.stringify(exp.score_breakdown),
      exp.routing_reason,
      now()
    );

    // Upsert routing queue if routable
    if (result.routing !== 'suppressed') {
      db.prepare(`
        INSERT INTO connect_routing_queue
          (lead_id, brochure_id, match_id, queue_type, status, priority, added_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
        ON CONFLICT DO NOTHING
      `).run(
        leadId, brochureId, row.id,
        result.routing === 'manual_queue' ? 'manual' : 'bot',
        100 - priorityScore,
        now()
      );
    }

    return row;
  } finally { db.close(); }
}

// ─── Run full rescore (all active leads × all brochures) ─────────────────────

export function runFullRescore(): { pairs: number; errors: number } {
  const leads = getAllActiveLeads();
  const brochures = getAllActiveBrochures();
  let pairs = 0; let errors = 0;
  for (const lead of leads) {
    for (const brochure of brochures) {
      try {
        scoreAndPersistPair(lead.id, brochure.id);
        pairs++;
      } catch { errors++; }
    }
  }
  return { pairs, errors };
}

export function rescoreForLead(leadId: number): { pairs: number; errors: number } {
  const brochures = getAllActiveBrochures();
  let pairs = 0; let errors = 0;
  for (const b of brochures) {
    try { scoreAndPersistPair(leadId, b.id); pairs++; } catch { errors++; }
  }
  return { pairs, errors };
}

export function rescoreForBrochure(brochureId: number): { pairs: number; errors: number } {
  const leads = getAllActiveLeads();
  let pairs = 0; let errors = 0;
  for (const l of leads) {
    try { scoreAndPersistPair(l.id, brochureId); pairs++; } catch { errors++; }
  }
  return { pairs, errors };
}

// ─── Paginated match list ─────────────────────────────────────────────────────

export type GetMatchesParams = {
  queueType?: 'manual' | 'bot' | 'all';
  minScore?: number;
  confidence?: string;
  leadId?: number;
  brochureId?: number;
  page?: number;
  perPage?: number;
};

export function getMatches(params: GetMatchesParams = {}): { data: MatchListItem[]; total: number } {
  const {
    queueType = 'all', minScore = 0, confidence,
    leadId, brochureId, page = 1, perPage = 25,
  } = params;

  const db = getConnectDb();
  try {
    initConnectTables();

    const conditions: string[] = ['cms.score >= ?'];
    const args: (string | number)[] = [minScore];

    if (queueType !== 'all') {
      conditions.push('cms.routing = ?');
      args.push(queueType === 'manual' ? 'manual_queue' : 'bot_queue');
    } else {
      conditions.push("cms.routing != 'suppressed'");
    }
    if (confidence) { conditions.push('cms.confidence = ?'); args.push(confidence); }
    if (leadId)     { conditions.push('cms.lead_id = ?'); args.push(leadId); }
    if (brochureId) { conditions.push('cms.brochure_id = ?'); args.push(brochureId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (db.prepare(
      `SELECT COUNT(*) as c FROM connect_match_scores cms ${where}`
    ).get(...args) as any).c;

    const offset = (page - 1) * perPage;
    const rows = db.prepare(`
      SELECT
        cms.id, cms.lead_id, cms.brochure_id, cms.score, cms.confidence,
        cms.routing, cms.manual_priority_score, cms.scored_at,
        l.name  AS lead_name, l.email AS lead_email, l.status AS lead_status,
        b.vessel_name, b.builder, b.year, b.slug,
        COALESCE(ces.sent_count, 0)  AS sent_count,
        ces.last_sent_at,
        cme.summary_sentence, cme.top_reasons
      FROM connect_match_scores cms
      JOIN leads    l ON l.id = cms.lead_id
      JOIN brochures b ON b.id = cms.brochure_id
      LEFT JOIN connect_match_explanations  cme ON cme.match_id = cms.id
      LEFT JOIN connect_exposure_summary    ces ON ces.lead_id = cms.lead_id
                                                AND ces.brochure_id = cms.brochure_id
      ${where}
      ORDER BY cms.manual_priority_score DESC, cms.scored_at DESC
      LIMIT ? OFFSET ?
    `).all(...args, perPage, offset) as any[];

    const data: MatchListItem[] = rows.map(r => ({
      ...r,
      top_reasons: parseJSON(r.top_reasons, []),
    }));

    return { data, total };
  } finally { db.close(); }
}

// ─── Match detail ─────────────────────────────────────────────────────────────

export function getMatchDetail(matchId: number): MatchDetail | null {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT * FROM connect_match_scores WHERE id = ?`).get(matchId) as MatchRow | null;
    if (!row) return null;

    const lead = getLeadById(row.lead_id);
    const brochure = getBrochureForScoring(row.brochure_id);
    if (!lead || !brochure) return null;

    const expRow = db.prepare(
      `SELECT * FROM connect_match_explanations WHERE match_id = ?`
    ).get(matchId) as any;

    const explanation = expRow ? {
      summary_sentence: expRow.summary_sentence as string,
      top_reasons:      parseJSON<ExplanationReason[]>(expRow.top_reasons, []),
      top_penalties:    parseJSON<ExplanationReason[]>(expRow.top_penalties, []),
      caution_flags:    parseJSON<CautionFlag[]>(expRow.caution_flags, []),
      next_best_action: parseJSON<NextAction>(expRow.next_best_action, { action: '', label: '', reason: '' }),
      score_breakdown:  parseJSON<ScoreBreakdown>(expRow.score_breakdown, {} as ScoreBreakdown),
      routing_reason:   (expRow.routing_reason ?? '') as string,
    } : null;

    const exposureHistory = db.prepare(
      `SELECT id, sent_at, channel, sent_by, score_at_send
       FROM connect_exposure_history
       WHERE lead_id = ? AND brochure_id = ?
       ORDER BY sent_at DESC LIMIT 10`
    ).all(row.lead_id, row.brochure_id) as ExposureEntry[];

    const activeOverride = getActiveOverride(row.lead_id, row.brochure_id);

    return { ...row, lead, brochure, explanation, exposure_history: exposureHistory, active_override: activeOverride };
  } finally { db.close(); }
}

// ─── Mark sent ───────────────────────────────────────────────────────────────

export function markSent(matchId: number, channel: string, sentBy: string): void {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT lead_id, brochure_id, score FROM connect_match_scores WHERE id = ?`).get(matchId) as any;
    if (!row) return;

    const t = now();
    db.prepare(
      `INSERT INTO connect_exposure_history (lead_id, brochure_id, sent_at, channel, sent_by, score_at_send)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(row.lead_id, row.brochure_id, t, channel, sentBy, row.score);

    // Update summary
    db.prepare(`
      INSERT INTO connect_exposure_summary (lead_id, brochure_id, sent_count, first_sent_at, last_sent_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(lead_id, brochure_id) DO UPDATE SET
        sent_count   = sent_count + 1,
        last_sent_at = excluded.last_sent_at
    `).run(row.lead_id, row.brochure_id, t, t);

    // Mark routing queue item as sent
    db.prepare(
      `UPDATE connect_routing_queue SET status = 'sent', actioned_at = ?, actioned_by = ?
       WHERE lead_id = ? AND brochure_id = ? AND status = 'pending'`
    ).run(t, sentBy, row.lead_id, row.brochure_id);
  } finally { db.close(); }
}

// ─── Suppress / boost / override ─────────────────────────────────────────────

export function suppressMatch(matchId: number, reason: string, brokerId: string, expiresAt?: string): void {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT lead_id, brochure_id FROM connect_match_scores WHERE id = ?`).get(matchId) as any;
    if (!row) return;
    db.prepare(
      `INSERT INTO connect_suppression_rules (rule_type, lead_id, brochure_id, reason, created_by, created_at, expires_at)
       VALUES ('pair', ?, ?, ?, ?, ?, ?)`
    ).run(row.lead_id, row.brochure_id, reason, brokerId, now(), expiresAt ?? null);
    db.prepare(
      `UPDATE connect_match_scores SET routing = 'suppressed', is_stale = 1 WHERE id = ?`
    ).run(matchId);
    db.prepare(
      `UPDATE connect_routing_queue SET status = 'skipped', actioned_at = ?, actioned_by = ?
       WHERE lead_id = ? AND brochure_id = ? AND status = 'pending'`
    ).run(now(), brokerId, row.lead_id, row.brochure_id);
  } finally { db.close(); }
}

export function boostMatch(matchId: number, boostValue: number, reason: string, brokerId: string): number {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT lead_id, brochure_id, score, manual_priority_score FROM connect_match_scores WHERE id = ?`).get(matchId) as any;
    if (!row) return 0;
    const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
    db.prepare(
      `INSERT INTO connect_broker_overrides (lead_id, brochure_id, broker_id, override_type, boost_value, reason, expires_at, is_active)
       VALUES (?, ?, ?, 'boost', ?, ?, ?, 1)`
    ).run(row.lead_id, row.brochure_id, brokerId, boostValue, reason, expiresAt);
    const newPriority = Math.min(110, (row.manual_priority_score ?? row.score) + boostValue);
    db.prepare(`UPDATE connect_match_scores SET manual_priority_score = ? WHERE id = ?`).run(newPriority, matchId);
    return newPriority;
  } finally { db.close(); }
}

export function moveToBot(matchId: number, brokerId: string): void {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT lead_id, brochure_id FROM connect_match_scores WHERE id = ?`).get(matchId) as any;
    if (!row) return;
    db.prepare(`UPDATE connect_match_scores SET routing = 'bot_queue' WHERE id = ?`).run(matchId);
    db.prepare(`UPDATE connect_routing_queue SET queue_type = 'bot', actioned_by = ?, actioned_at = ?
       WHERE lead_id = ? AND brochure_id = ? AND status = 'pending'`
    ).run(brokerId, now(), row.lead_id, row.brochure_id);
    db.prepare(
      `INSERT INTO connect_broker_overrides (lead_id, brochure_id, broker_id, override_type, expires_at, is_active)
       VALUES (?, ?, ?, 'demote', ?, 1)`
    ).run(row.lead_id, row.brochure_id, brokerId, new Date(Date.now() + 30 * 86_400_000).toISOString());
  } finally { db.close(); }
}

export function escalateToManual(matchId: number, brokerId: string): void {
  const db = getConnectDb();
  try {
    initConnectTables();
    const row = db.prepare(`SELECT lead_id, brochure_id FROM connect_match_scores WHERE id = ?`).get(matchId) as any;
    if (!row) return;
    db.prepare(`UPDATE connect_match_scores SET routing = 'manual_queue' WHERE id = ?`).run(matchId);
    db.prepare(`UPDATE connect_routing_queue SET queue_type = 'manual', status = 'pending', actioned_by = NULL
       WHERE lead_id = ? AND brochure_id = ?`
    ).run(row.lead_id, row.brochure_id);
  } finally { db.close(); }
}
