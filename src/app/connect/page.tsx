"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap, Filter, ChevronDown, ChevronUp, X, Send, Check,
  AlertTriangle, TrendingUp, TrendingDown, Clock, RefreshCw,
  ChevronRight, ArrowUpRight, EyeOff, Bot, User, BarChart2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Reason = { label: string; impact: number; field: string };
type CautionFlag = { label: string; severity: string };
type NextAction = { action: string; label: string; reason: string };

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
  id: number; score: number; confidence: string; routing: string; scored_at: string;
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
  exposure_history: Array<{ id: number; sent_at: string; channel: string; sent_by: string; score_at_send: number }>;
  active_override: { override_type: string; boost_value: number; reason: string; expires_at: string | null } | null;
};

type Pagination = { page: number; per_page: number; total: number; total_pages: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 70) return "#059669";
  if (s >= 45) return "#d97706";
  return "#6b7280";
}
function confidenceStyle(c: string) {
  if (c === "high")   return { bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.3)", text: "#059669" };
  if (c === "medium") return { bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.3)", text: "#d97706" };
  return { bg: "rgba(107,114,128,.12)", border: "rgba(107,114,128,.3)", text: "#6b7280" };
}
function routingIcon(r: string) {
  if (r === "manual_queue") return <User size={12} />;
  if (r === "bot_queue")    return <Bot size={12} />;
  return <EyeOff size={12} />;
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
  const radius = (size - 6) / 2;
  const circ = 2 * Math.PI * radius;
  const fill = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={5}
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
  onAction: (matchId: number, action: string, params?: object) => Promise<void>;
}) {
  const cs = confidenceStyle(m.confidence);
  const [acting, setActing] = useState<string | null>(null);

  async function act(action: string, params?: object) {
    setActing(action);
    await onAction(m.id, action, params);
    setActing(null);
  }

  return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
      borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14,
      alignItems: "flex-start", cursor: "default",
      transition: "border-color .15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.14)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.07)")}
    >
      <ScoreBadge score={m.score} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--navy-100, #e2e8f0)" }}>
            {m.lead_name}
          </span>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 12 }}>→</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
            {m.year ? `${m.year} ` : ""}{m.builder} {m.vessel_name}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 7px", borderRadius: 99,
            fontSize: 11, fontWeight: 600,
            background: cs.bg, border: `1px solid ${cs.border}`, color: cs.text,
          }}>
            {routingIcon(m.routing)}
            {m.confidence}
          </span>
          {m.sent_count > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", display: "flex", alignItems: "center", gap: 3 }}>
              <Send size={10} /> {m.sent_count}×
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 8px", lineHeight: 1.5 }}>
          {m.summary_sentence || "—"}
        </p>

        {m.top_reasons?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {m.top_reasons.slice(0, 2).map((r, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99,
                background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)",
                color: "#34d399",
              }}>{r.label}</span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => onSelect(m.id)} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
            color: "rgba(255,255,255,.8)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>Detail <ChevronRight size={11} /></button>

          <button onClick={() => act("mark_sent", { channel: "email" })} disabled={!!acting} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            background: acting === "mark_sent" ? "rgba(16,185,129,.15)" : "rgba(16,185,129,.08)",
            border: "1px solid rgba(16,185,129,.2)", color: "#34d399", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}><Send size={10} /> Sent</button>

          {m.routing === "manual_queue" && (
            <button onClick={() => act("move_to_bot")} disabled={!!acting} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6,
              background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)",
              color: "#818cf8", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}><Bot size={10} /> → Bot</button>
          )}

          <button onClick={() => act("suppress", { reason: "dismissed" })} disabled={!!acting} style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)",
            color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          }}><EyeOff size={10} /> Suppress</button>
        </div>
      </div>
    </div>
  );
}

// ─── Match Detail Drawer ─────────────────────────────────────────────────────

function MatchDetailDrawer({ matchId, onClose, onAction }: {
  matchId: number; onClose: () => void;
  onAction: (matchId: number, action: string, params?: object) => Promise<void>;
}) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/connect/matches/${matchId}`)
      .then(r => r.json())
      .then(r => { if (r.ok) setDetail(r.data); })
      .finally(() => setLoading(false));
  }, [matchId]);

  async function act(action: string, params?: object) {
    setActing(action);
    await onAction(matchId, action, params);
    if (action !== "suppress") {
      // Reload detail after non-destructive actions
      const r = await fetch(`/api/connect/matches/${matchId}`).then(r => r.json());
      if (r.ok) setDetail(r.data);
    } else {
      onClose();
    }
    setActing(null);
  }

  const exp = detail?.explanation;
  const cs = detail ? confidenceStyle(detail.confidence) : confidenceStyle("low");

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)",
      background: "var(--navy-900, #0f172a)", borderLeft: "1px solid rgba(255,255,255,.1)",
      zIndex: 1000, overflowY: "auto", padding: "24px 20px",
      boxShadow: "-8px 0 40px rgba(0,0,0,.5)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.6)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Match Detail
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,.3)" }}>
          Loading match detail…
        </div>
      )}

      {!loading && detail && (
        <>
          {/* Score + vessel */}
          <div style={{
            background: "rgba(255,255,255,.04)", borderRadius: 12,
            border: "1px solid rgba(255,255,255,.08)", padding: "16px", marginBottom: 16,
            display: "flex", gap: 16, alignItems: "center",
          }}>
            <ScoreBadge score={detail.score} size={56} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy-100, #e2e8f0)", marginBottom: 2 }}>
                {detail.brochure.year} {detail.brochure.builder} {detail.brochure.vessel_name}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>
                {fmtPrice(detail.brochure.vessel?.price)} · {detail.brochure.vessel?.loa || "—"} · {detail.brochure.vessel?.location || "—"}
              </div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                background: cs.bg, border: `1px solid ${cs.border}`, color: cs.text,
              }}>
                {routingIcon(detail.routing)} {detail.confidence} · {detail.routing.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Buyer snapshot */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
              Buyer
            </h3>
            <div style={{
              background: "rgba(255,255,255,.03)", borderRadius: 10,
              border: "1px solid rgba(255,255,255,.07)", padding: "12px 14px",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy-100, #e2e8f0)", marginBottom: 4 }}>{detail.lead.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                {detail.lead.budget_min || detail.lead.budget_max ? (
                  <span>Budget: {fmtPrice(detail.lead.budget_min)} – {fmtPrice(detail.lead.budget_max)}</span>
                ) : <span style={{ color: "rgba(255,255,255,.2)" }}>No budget set</span>}
                {(detail.lead.loa_min || detail.lead.loa_max) && (
                  <span>LOA: {detail.lead.loa_min || "—"}–{detail.lead.loa_max || "—"}ft</span>
                )}
                {detail.lead.vessel_type_pref && <span>Type: {detail.lead.vessel_type_pref}</span>}
                {detail.lead.preferred_location && <span>Location: {detail.lead.preferred_location}</span>}
              </div>
            </div>
          </section>
        </>
      )}

      {!loading && detail && exp && (
        <>
          {/* Explanation */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
              Why this match
            </h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginBottom: 10, lineHeight: 1.6 }}>
              {exp.summary_sentence}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {exp.top_reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", borderRadius: 8, background: "rgba(16,185,129,.07)",
                  border: "1px solid rgba(16,185,129,.15)" }}>
                  <span style={{ fontSize: 12, color: "#34d399", display: "flex", alignItems: "center", gap: 5 }}>
                    <TrendingUp size={11} /> {r.label}
                  </span>
                  <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>+{r.impact}</span>
                </div>
              ))}
              {exp.top_penalties.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", borderRadius: 8, background: "rgba(239,68,68,.07)",
                  border: "1px solid rgba(239,68,68,.15)" }}>
                  <span style={{ fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 5 }}>
                    <TrendingDown size={11} /> {p.label}
                  </span>
                  <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{p.impact}</span>
                </div>
              ))}
              {exp.caution_flags.map((c, i) => (
                <div key={i} style={{ padding: "5px 10px", borderRadius: 8,
                  background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.15)" }}>
                  <span style={{ fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 5 }}>
                    <AlertTriangle size={11} /> {c.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && detail && (
        <>
          {/* Exposure history */}
          {detail.exposure_history.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                Sent history ({detail.exposure_history.length})
              </h3>
              {detail.exposure_history.slice(0, 5).map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between",
                  padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)",
                  fontSize: 12, color: "rgba(255,255,255,.45)" }}>
                  <span>{fmtDate(e.sent_at)} · {e.channel}</span>
                  <span>Score at send: {e.score_at_send}</span>
                </div>
              ))}
            </section>
          )}

          {/* Next action + CTA bar */}
          {detail.explanation?.next_best_action && (
            <div style={{
              position: "sticky", bottom: 0, background: "var(--navy-900,#0f172a)",
              borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, marginTop: 8,
            }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>
                {detail.explanation.next_best_action.reason}
              </div>
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
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 25, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  // Filters
  const [queueType, setQueueType] = useState<"all" | "manual" | "bot">("all");
  const [minScore, setMinScore] = useState(25);
  const [page, setPage] = useState(1);

  const fetchMatches = useCallback(async (p = page, qt = queueType, ms = minScore) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        queue_type: qt, min_score: String(ms),
        page: String(p), per_page: "25",
      });
      const r = await fetch(`/api/connect/matches?${params}`).then(r => r.json());
      if (r.ok) {
        setMatches(r.data);
        setPagination(r.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [page, queueType, minScore]);

  useEffect(() => { fetchMatches(1, queueType, minScore); }, [queueType, minScore]);

  async function handleRescore() {
    setRescoring(true);
    try {
      await fetch("/api/connect/matches", { method: "POST" });
      await fetchMatches(1, queueType, minScore);
    } finally {
      setRescoring(false);
    }
  }

  async function handleAction(matchId: number, action: string, params: object = {}) {
    await fetch(`/api/connect/matches/${matchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
    // Refresh the list after any action
    await fetchMatches(page, queueType, minScore);
  }

  const manualCount = matches.filter(m => m.routing === "manual_queue").length;
  const botCount    = matches.filter(m => m.routing === "bot_queue").length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--navy-950,#080e1a)", color: "var(--navy-100,#e2e8f0)", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Zap size={20} color="#f59e0b" />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Connect</h1>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.35)" }}>Buyer–Vessel Matching Engine</span>
          </div>
          <button onClick={handleRescore} disabled={rescoring} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: rescoring ? "rgba(255,255,255,.05)" : "rgba(245,158,11,.12)",
            border: "1px solid rgba(245,158,11,.25)", color: rescoring ? "rgba(255,255,255,.3)" : "#fbbf24",
          }}>
            <RefreshCw size={13} className={rescoring ? "animate-spin" : ""} />
            {rescoring ? "Scoring…" : "Run Rescore"}
          </button>
        </div>

        {/* Stat bar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total matches", value: pagination.total, icon: <BarChart2 size={14} /> },
            { label: "Manual queue", value: manualCount, icon: <User size={14} /> },
            { label: "Bot queue",    value: botCount,    icon: <Bot size={14} /> },
          ].map(s => (
            <div key={s.label} style={{
              flex: "1 1 140px", padding: "12px 16px", borderRadius: 10,
              background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ color: "rgba(255,255,255,.35)" }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)" }}>
            {(["all","manual","bot"] as const).map(qt => (
              <button key={qt} onClick={() => { setQueueType(qt); setPage(1); }} style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: queueType === qt ? "rgba(255,255,255,.08)" : "transparent",
                border: "none", color: queueType === qt ? "#e2e8f0" : "rgba(255,255,255,.4)",
                textTransform: "capitalize",
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

        {/* Match list */}
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,.3)" }}>
            Loading matches…
          </div>
        ) : matches.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,.3)" }}>
            <Zap size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
            <div style={{ fontSize: 14 }}>No matches. Run a rescore to generate results.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map(m => (
              <MatchCard key={m.id} m={m} onSelect={setSelectedMatchId} onAction={handleAction} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
            <button onClick={() => { const p = page - 1; setPage(p); fetchMatches(p); }} disabled={page === 1} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
              color: page === 1 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
            }}>← Prev</button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>
              {page} / {pagination.total_pages} · {pagination.total} matches
            </span>
            <button onClick={() => { const p = page + 1; setPage(p); fetchMatches(p); }} disabled={page === pagination.total_pages} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
              color: page === pagination.total_pages ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
            }}>Next →</button>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedMatchId !== null && (
        <>
          <div onClick={() => setSelectedMatchId(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 999,
          }} />
          <MatchDetailDrawer
            matchId={selectedMatchId}
            onClose={() => setSelectedMatchId(null)}
            onAction={handleAction}
          />
        </>
      )}
    </div>
  );
}
