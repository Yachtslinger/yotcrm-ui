/**
 * GET /api/clients/[id]/comms
 * Returns all communications + aggregated yacht intelligence for one lead.
 *
 * Response shape:
 * {
 *   threads:   [{ id, subject, status, message_count, first_seen, last_activity }],
 *   messages:  [{ id, thread_id, from_address, from_name, subject, body_plain, sent_at, direction }],
 *   intelligence: {
 *     intent: {value, confidence, source_message_id, source_date}[],
 *     budget: { ... },
 *     timeline: { ... },
 *     makes: string[],
 *     models: string[],
 *     features: string[],
 *     locations: string[],
 *     categories: string[],
 *     summaries: { date, text }[],
 *     tasks: { text, priority, status, due_date }[]
 *   }
 * }
 *
 * This endpoint is the heart of "client memory" — every approved extraction
 * across every thread is aggregated into a single intelligence picture.
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

type ExtractionRow = {
  id: number;
  message_id: number;
  status: string;
  reviewed_at: string | null;
  intent: string | null; intent_conf: number | null;
  budget_range: string | null; budget_conf: number | null;
  timeline: string | null; timeline_conf: number | null;
  yacht_makes: string;
  yacht_models: string;
  yacht_length_range: string | null;
  year_range: string | null;
  location_pref: string | null;
  features_mentioned: string;
  lead_category: string | null;
  tags: string;
  summary: string | null;
  suggested_tasks: string;
  draft_reply: string | null; draft_subject: string | null;
  sent_at: string;
};

function safeParseArray<T = unknown>(s: string | null | undefined, fb: T[] = []): T[] {
  if (!s) return fb;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fb; } catch { return fb; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ ok: false, error: "invalid lead id" }, { status: 400 });

  const db = new Database(DB_PATH);
  try {
    // Confirm tables exist (no-op if Railway already initialized)
    try {
      db.prepare("SELECT 1 FROM comms_threads LIMIT 1").get();
    } catch {
      return NextResponse.json({ ok: true, threads: [], messages: [], intelligence: emptyIntelligence() });
    }

    const threads = db.prepare(`
      SELECT id, subject, status, message_count, first_seen, last_activity
      FROM comms_threads WHERE lead_id = ? ORDER BY last_activity DESC
    `).all(leadId) as Array<{ id: number; subject: string; status: string; message_count: number; first_seen: string; last_activity: string }>;

    if (threads.length === 0) {
      return NextResponse.json({ ok: true, threads: [], messages: [], intelligence: emptyIntelligence() });
    }

    const threadIds = threads.map(t => t.id);
    const placeholders = threadIds.map(() => "?").join(",");

    const messages = db.prepare(`
      SELECT id, thread_id, from_address, from_name, subject, body_plain, sent_at, direction
      FROM comms_messages WHERE thread_id IN (${placeholders}) ORDER BY sent_at ASC
    `).all(...threadIds) as Array<{ id: number; thread_id: number; from_address: string; from_name: string; subject: string; body_plain: string; sent_at: string; direction: string }>;

    if (messages.length === 0) {
      return NextResponse.json({ ok: true, threads, messages: [], intelligence: emptyIntelligence() });
    }

    const messageIds = messages.map(m => m.id);
    const msgPlaceholders = messageIds.map(() => "?").join(",");

    // Pull all extractions for these messages (approved + corrected = trusted; pending = not yet aggregated)
    const extractions = db.prepare(`
      SELECT e.*, m.sent_at
      FROM comms_extractions e
      JOIN comms_messages m ON m.id = e.message_id
      WHERE e.message_id IN (${msgPlaceholders})
        AND e.status IN ('approved','corrected','pending')
      ORDER BY m.sent_at ASC
    `).all(...messageIds) as ExtractionRow[];

    // Aggregate intelligence across all extractions
    const intel = {
      intent: [] as { value: string; confidence: number; source_message_id: number; source_date: string }[],
      budget: [] as { value: string; confidence: number; source_message_id: number; source_date: string }[],
      timeline: [] as { value: string; confidence: number; source_message_id: number; source_date: string }[],
      length_range: [] as { value: string; source_message_id: number; source_date: string }[],
      year_range: [] as { value: string; source_message_id: number; source_date: string }[],
      makes: new Set<string>(),
      models: new Set<string>(),
      features: new Set<string>(),
      locations: new Set<string>(),
      categories: new Set<string>(),
      tags: new Set<string>(),
      summaries: [] as { date: string; text: string; message_id: number; status: string }[],
      tasks: [] as { text: string; priority: string; due_days: number; status: string; source_message_id: number }[],
      drafts: [] as { subject: string; body: string; message_id: number; status: string }[],
      approved_count: 0,
      pending_count: 0,
    };

    for (const e of extractions) {
      if (e.status === "approved" || e.status === "corrected") intel.approved_count++;
      else if (e.status === "pending") intel.pending_count++;

      if (e.intent) intel.intent.push({ value: e.intent, confidence: e.intent_conf ?? 0, source_message_id: e.message_id, source_date: e.sent_at });
      if (e.budget_range) intel.budget.push({ value: e.budget_range, confidence: e.budget_conf ?? 0, source_message_id: e.message_id, source_date: e.sent_at });
      if (e.timeline) intel.timeline.push({ value: e.timeline, confidence: e.timeline_conf ?? 0, source_message_id: e.message_id, source_date: e.sent_at });
      if (e.yacht_length_range) intel.length_range.push({ value: e.yacht_length_range, source_message_id: e.message_id, source_date: e.sent_at });
      if (e.year_range) intel.year_range.push({ value: e.year_range, source_message_id: e.message_id, source_date: e.sent_at });

      for (const m of safeParseArray<string>(e.yacht_makes)) intel.makes.add(m);
      for (const m of safeParseArray<string>(e.yacht_models)) intel.models.add(m);
      for (const f of safeParseArray<string>(e.features_mentioned)) intel.features.add(f);
      for (const t of safeParseArray<string>(e.tags)) intel.tags.add(t);
      if (e.location_pref) intel.locations.add(e.location_pref);
      if (e.lead_category) intel.categories.add(e.lead_category);

      if (e.summary) intel.summaries.push({ date: e.sent_at, text: e.summary, message_id: e.message_id, status: e.status });

      for (const t of safeParseArray<{ text: string; priority?: string; due_days?: number }>(e.suggested_tasks)) {
        intel.tasks.push({ text: t.text, priority: t.priority ?? "medium", due_days: t.due_days ?? 1, status: e.status, source_message_id: e.message_id });
      }
      if (e.draft_reply) {
        intel.drafts.push({ subject: e.draft_subject ?? "", body: e.draft_reply, message_id: e.message_id, status: e.status });
      }
    }

    return NextResponse.json({
      ok: true,
      threads,
      messages,
      intelligence: {
        intent: intel.intent,
        budget: intel.budget,
        timeline: intel.timeline,
        length_range: intel.length_range,
        year_range: intel.year_range,
        makes: Array.from(intel.makes),
        models: Array.from(intel.models),
        features: Array.from(intel.features),
        locations: Array.from(intel.locations),
        categories: Array.from(intel.categories),
        tags: Array.from(intel.tags),
        summaries: intel.summaries,
        tasks: intel.tasks,
        drafts: intel.drafts,
        approved_count: intel.approved_count,
        pending_count: intel.pending_count,
      },
    });
  } finally { db.close(); }
}

function emptyIntelligence() {
  return {
    intent: [], budget: [], timeline: [], length_range: [], year_range: [],
    makes: [], models: [], features: [], locations: [], categories: [], tags: [],
    summaries: [], tasks: [], drafts: [], approved_count: 0, pending_count: 0,
  };
}
