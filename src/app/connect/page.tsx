"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Zap, X, Send, AlertTriangle, TrendingUp, TrendingDown,
  RefreshCw, ChevronRight, EyeOff, Bot, User, BarChart2,
} from "lucide-react";

// ─── Error boundary ───────────────────────────────────────────────────────────

class MatchListErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(err: Error) {
    console.error("[ConnectPage] render error:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,.4)" }}>
          <AlertTriangle size={28} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>Failed to render match list</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.25)", marginBottom: 16 }}>{this.state.message}</div>
          <button onClick={() => this.setState({ hasError: false, message: "" })} style={{
            padding: "7px 16px", borderRadius: 7, fontSize: 12, cursor: "pointer",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
            color: "rgba(255,255,255,.6)",
          }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Reason     = { label: string; impact: number; field: string };
type CautionFlag = { label: string; severity: string };
type NextAction  = { action: string; label: string; reason: string };

type MatchItem = {
  id: number; lead_id: number; brochure_id: number;
  score: number; confidence: string; routing: string;
  manual_priority_score: number; scored_at: string;
  lead_name: string; lead_email: string; lead_status: string;
  vessel_name: string; builder: string; year: number | null; slug: string;
  summary_sentence: string; top_reasons: Reason[];
  sent_count: number; last_sent_at: string | null;
};

type MatchDetail = {
  id: number; score: number; confidence: string; routing: string;
  lead_id: number; brochure_id: number;
  lead: {
    id: number; name: string; email: string; phone: string; status: string;
    budget_min: string; budget_max: string; loa_min: string; loa_max: string;
    vessel_type_pref: string; flybridge_pref: string; preferred_location: string;
  };
  brochure: {
    id: number; vessel_name: string; builder: string; year: number | null;
    slug: string; source_url: string;
    vessel: { price?: string; loa?: string; location?: string };
  };
  explanation: {
    summary_sentence: string; routing_reason: string;
    top_reasons: Reason[]; top_penalties: Reason[];
    caution_flags: CautionFlag[]; next_best_action: NextAction;
    score_breakdown: Record<string, number>;
  } | null;
  exposure_history: Array<{
    id: number; sent_at: string; channel: string;
    sent_by: string; score_at_send: number;
  }>;
  active_override: {
    override_type: string; boost_value: number;
    reason: string; expires_at: string | null;
  } | null;
};

type Pagination = {
  page: number; per_page: number; total: number; total_pages: number;
};

type DashMetrics = {
  manual_queue_count: number; bot_queue_count: number;
  high_score_count: number; avg_score: number; sent_this_week: number;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 70) return "#059669";
  if (s >= 45) return "#d97706";
  return "#6b7280";
}

function csStyle(c: string) {
  if (c === "high")   return { bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.3)",  text: "#059669" };
  if (c === "medium") return { bg: "rgba(245,158,11,.12)",  border: "rgba(245,158,11,.3)",  text: "#d97706" };
  return                     { bg: "rgba(107,114,128,.12)", border: "rgba(107,114,128,.3)", text: "#6b7280" };
}

function routingIcon(r: string) {
  if (r === "manual_queue") return <User size={11} />;
  if (r === "bot_queue")    return <Bot  size={11} />;
  return <EyeOff size={11} />;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtPrice(s?: string) {
  if (!s) return "—";
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (isNaN(n) || n === 0) return s;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size < 40 ? 10 : 12} fontWeight="700">{score}</text>
    </svg>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────

function MatchCard({ m, onSelect, onAction }: {
  m: MatchItem;
  onSelect: (id: number) => void;
  onAction: (id: number, action: string, params?: object) => Promise<void>;
}) {
  const cs = csStyle(m.confidence);
  const [acting, setActing] = useState<string | null>(null);

  async function act(action: string, params?: object) {
    setActing(action);
    await onAction(m.id, action, params);
    setActing(null);
  }

  return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
      borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.14)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.07)")}
    >
      <ScoreBadge score={m.score} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0" }}>{m.lead_name}</span>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>→</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
            {m.year ? `${m.year} ` : ""}{m.builder} {m.vessel_name}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px",
            borderRadius: 99, fontSize: 11, fontWeight: 600,
            background: cs.bg, border: `1px solid ${cs.border}`, color: cs.text,
          }}>{routingIcon(m.routing)} {m.confidence}</span>
          {m.sent_count > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", display: "flex", alignItems: "center", gap: 3 }}>
              <Send size={10} /> {m.sent_count}×
            </span>
          )}
        </div>
        {/* Summary */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 8px", lineHeight: 1.5 }}>
          {m.summary_sentence || "—"}
        </p>
        {/* Reasons */}
        {m.top_reasons?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {m.top_reasons.slice(0, 2).map((r, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99,
                background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)", color: "#34d399",
              }}>{r.label}</span>
            ))}
          </div>
        )}
        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => onSelect(m.id)} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.8)",
            display: "flex", alignItems: "center", gap: 4,
          }}>Detail <ChevronRight size={11} /></button>

          <button onClick={() => act("mark_sent", { channel: "email" })} disabled={!!acting} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", color: "#34d399",
            display: "flex", alignItems: "center", gap: 4,
          }}><Send size={10} /> Sent</button>

          {m.routing === "manual_queue" && (
            <button onClick={() => act("move_to_bot")} disabled={!!acting} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", color: "#818cf8",
              display: "flex", alignItems: "center", gap: 4,
            }}><Bot size={10} /> → Bot</button>
          )}

          <button onClick={() => act("suppress", { reason: "dismissed" })} disabled={!!acting} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", color: "#f87171",
            display: "flex", alignItems: "center", gap: 4,
          }}><EyeOff size={10} /> Suppress</button>
        </div>
      </div>
    </div>
  );
}

// ─── Match Detail Drawer ──────────────────────────────────────────────────────

function MatchDetailDrawer({ matchId, onClose, onAction }: {
  matchId: number;
  onClose: () => void;
  onAction: (id: number, action: string, params?: object) => Promise<void>;
}) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    fetch(`/api/connect/matches/${matchId}`)
      .then(r => r.json())
      .then(r => { if (r.ok) setDetail(r.data); })
      .finally(() => setLoading(false));
  }, [matchId]);

  async function act(action: string, params?: object) {
    setActing(action);
    await onAction(matchId, action, params);
    if (action === "suppress") { onClose(); return; }
    const r = await fetch(`/api/connect/matches/${matchId}`).then(r => r.json());
    if (r.ok) setDetail(r.data);
    setActing(null);
  }

  const exp  = detail?.explanation;
  const cs   = csStyle(detail?.confidence ?? "low");

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)",
      background: "#0f172a", borderLeft: "1px solid rgba(255,255,255,.1)",
      zIndex: 1000, overflowY: "auto", padding: "24px 20px",
      boxShadow: "-8px 0 40px rgba(0,0,0,.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em" }}>
          Match Detail
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)" }}>
          <X size={18} />
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,.3)" }}>Loading…</div>
      )}

      {!loading && detail && (
        <>
          {/* Score + vessel */}
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)", padding: 16, marginBottom: 16, display: "flex", gap: 16, alignItems: "center" }}>
            <ScoreBadge score={detail.score} size={56} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
                {detail.brochure.year} {detail.brochure.builder} {detail.brochure.vessel_name}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>
                {fmtPrice(detail.brochure.vessel?.price)} · {detail.brochure.vessel?.loa || "—"} · {detail.brochure.vessel?.location || "—"}
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: cs.bg, border: `1px solid ${cs.border}`, color: cs.text }}>
                {routingIcon(detail.routing)} {detail.confidence} · {detail.routing.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Buyer */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Buyer</h3>
            <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{detail.lead.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                {(detail.lead.budget_min || detail.lead.budget_max)
                  ? <span>Budget: {fmtPrice(detail.lead.budget_min)} – {fmtPrice(detail.lead.budget_max)}</span>
                  : <span style={{ color: "rgba(255,255,255,.2)" }}>No budget set</span>}
                {(detail.lead.loa_min || detail.lead.loa_max) &&
                  <span>LOA: {detail.lead.loa_min || "—"}–{detail.lead.loa_max || "—"}ft</span>}
                {detail.lead.vessel_type_pref && <span>Type: {detail.lead.vessel_type_pref}</span>}
                {detail.lead.preferred_location && <span>📍 {detail.lead.preferred_location}</span>}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Explanation */}
      {!loading && detail && exp && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Why this match</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginBottom: 10, lineHeight: 1.6 }}>{exp.summary_sentence}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {exp.top_reasons.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 8, background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.15)" }}>
                <span style={{ fontSize: 12, color: "#34d399", display: "flex", alignItems: "center", gap: 5 }}><TrendingUp size={11} /> {r.label}</span>
                <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>+{r.impact}</span>
              </div>
            ))}
            {exp.top_penalties.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 8, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.15)" }}>
                <span style={{ fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 5 }}><TrendingDown size={11} /> {p.label}</span>
                <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{p.impact}</span>
              </div>
            ))}
            {exp.caution_flags.map((c, i) => (
              <div key={i} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.15)" }}>
                <span style={{ fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 5 }}><AlertTriangle size={11} /> {c.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exposure history */}
      {!loading && detail && detail.exposure_history.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Sent history ({detail.exposure_history.length})
          </h3>
          {detail.exposure_history.slice(0, 5).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
              <span>{fmtDate(e.sent_at)} · {e.channel}</span>
              <span>Score: {e.score_at_send}</span>
            </div>
          ))}
        </section>
      )}

      {/* Sticky CTA */}
      {!loading && detail && exp?.next_best_action && (
        <div style={{ position: "sticky", bottom: 0, background: "#0f172a", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginBottom: 8 }}>{exp.next_best_action.reason}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => act("mark_sent", { channel: "email" })} disabled={!!acting} style={{
              flex: 1, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)", color: "#34d399",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}><Send size={13} /> Mark Sent</button>
            <button onClick={() => act("boost", { boost_value: 15, reason: "Broker boost" })} disabled={!!acting} style={{
              padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.25)", color: "#fbbf24",
              display: "flex", alignItems: "center", gap: 6,
            }}><TrendingUp size={13} /> Boost</button>
            <button onClick={() => act("suppress", { reason: "Not a fit" })} disabled={!!acting} style={{
              padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171",
              display: "flex", alignItems: "center", gap: 6,
            }}><EyeOff size={13} /> Suppress</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const [matches,  setMatches]  = useState<MatchItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 25, total: 0, total_pages: 0 });
  const [loading,  setLoading]  = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metrics,  setMetrics]  = useState<DashMetrics | null>(null);
  const [queueType, setQueueType] = useState<"all" | "manual" | "bot">("all");
  const [minScore, setMinScore] = useState(25);
  const [page,     setPage]     = useState(1);

  const fetchMatches = useCallback(async (p: number, qt: string, ms: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ queue_type: qt, min_score: String(ms), page: String(p), per_page: "25" });
      const r = await fetch(`/api/connect/matches?${qs}`).then(r => r.json());
      if (r.ok) { setMatches(r.data); setPagination(r.pagination); }
    } finally { setLoading(false); }
  }, []);

  // Load dashboard metrics from precomputed endpoint — never blocks the list
  const fetchMetrics = useCallback(() => {
    fetch("/api/connect/dashboard").then(r => r.json())
      .then(r => { if (r.ok) setMetrics(r.data); }).catch(() => {});
  }, []);

  useEffect(() => { fetchMatches(1, queueType, minScore); }, [queueType, minScore, fetchMatches]);
  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  async function handleRescore() {
    setRescoring(true);
    try {
      await fetch("/api/connect/matches", { method: "POST" });
      await fetchMatches(1, queueType, minScore);
      fetchMetrics();
    } finally { setRescoring(false); }
  }

  async function handleAction(matchId: number, action: string, params: object = {}) {
    await fetch(`/api/connect/matches/${matchId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
    await fetchMatches(page, queueType, minScore);
  }

  const STATS = [
    { label: "Manual queue",    value: metrics?.manual_queue_count ?? "—", icon: <User     size={14} /> },
    { label: "Bot queue",       value: metrics?.bot_queue_count    ?? "—", icon: <Bot      size={14} /> },
    { label: "High confidence", value: metrics?.high_score_count   ?? "—", icon: <BarChart2 size={14} /> },
    { label: "Avg score",       value: metrics?.avg_score          ?? "—", icon: <TrendingUp size={14} /> },
    { label: "Sent this week",  value: metrics?.sent_this_week     ?? "—", icon: <Send     size={14} /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080e1a", color: "#e2e8f0", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Zap size={20} color="#f59e0b" />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Connect</h1>
            <a href="/connect/todo" style={{ fontSize: 12, color: "rgba(255,255,255,.35)", textDecoration: "none", padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,.08)" }}>
              To Do →
            </a>
          </div>
          <button onClick={handleRescore} disabled={rescoring} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: rescoring ? "default" : "pointer",
            background: rescoring ? "rgba(255,255,255,.05)" : "rgba(245,158,11,.12)",
            border: "1px solid rgba(245,158,11,.25)",
            color: rescoring ? "rgba(255,255,255,.3)" : "#fbbf24",
          }}>
            <RefreshCw size={13} style={rescoring ? { animation: "spin 1s linear infinite" } : {}} />
            {rescoring ? "Scoring…" : "Run Rescore"}
          </button>
        </div>

        {/* Stats — precomputed only, never from inline array counts */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {STATS.map(s => (
            <div key={s.label} style={{
              flex: "1 1 110px", padding: "12px 14px", borderRadius: 10,
              background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ color: "rgba(255,255,255,.3)" }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)" }}>
            {(["all", "manual", "bot"] as const).map(qt => (
              <button key={qt} onClick={() => { setQueueType(qt); setPage(1); }} style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                background: queueType === qt ? "rgba(255,255,255,.08)" : "transparent",
                color: queueType === qt ? "#e2e8f0" : "rgba(255,255,255,.4)",
              }}>{qt === "all" ? "All" : qt === "manual" ? "Manual" : "Bot"}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>Min score</span>
            <input type="range" min={0} max={90} step={5} value={minScore}
              onChange={e => { setMinScore(parseInt(e.target.value)); setPage(1); }}
              style={{ width: 90 }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)", width: 20 }}>{minScore}</span>
          </div>
        </div>

        {/* Match list — wrapped in error boundary */}
        <MatchListErrorBoundary>
          {loading ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,.3)" }}>Loading matches…</div>
          ) : matches.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,.3)" }}>
              <Zap size={32} style={{ opacity: 0.2, marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 14 }}>No matches. Run a rescore to generate results.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {matches.map(m => (
                <MatchCard key={m.id} m={m} onSelect={setSelectedId} onAction={handleAction} />
              ))}
            </div>
          )}
        </MatchListErrorBoundary>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
            <button onClick={() => { const p = page - 1; setPage(p); fetchMatches(p, queueType, minScore); }}
              disabled={page === 1} style={{
                padding: "6px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
                color: page === 1 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
              }}>← Prev</button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>
              {page} / {pagination.total_pages} · {pagination.total} matches
            </span>
            <button onClick={() => { const p = page + 1; setPage(p); fetchMatches(p, queueType, minScore); }}
              disabled={page === pagination.total_pages} style={{
                padding: "6px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
                color: page === pagination.total_pages ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
              }}>Next →</button>
          </div>
        )}
      </div>

      {/* Detail drawer + backdrop */}
      {selectedId !== null && (
        <>
          <div onClick={() => setSelectedId(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999,
          }} />
          <MatchDetailDrawer
            matchId={selectedId}
            onClose={() => setSelectedId(null)}
            onAction={handleAction}
          />
        </>
      )}
    </div>
  );
}
