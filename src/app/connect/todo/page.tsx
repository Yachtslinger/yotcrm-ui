"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckSquare, Send, EyeOff, TrendingUp, Bot,
  AlertTriangle, Zap, RefreshCw, ArrowUpRight, User,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Reason    = { label: string; impact: number; field: string };
type NextAction = { action: string; label: string; reason: string };
type Caution   = { label: string; severity: string };

type TodoItem = {
  id: number; lead_id: number; brochure_id: number;
  score: number; confidence: string; manual_priority_score: number;
  lead_name: string; lead_email: string; lead_status: string;
  last_contacted_at: string | null;
  vessel_name: string; builder: string; year: number | null; slug: string;
  summary_sentence: string;
  top_reasons: Reason[]; next_best_action: NextAction; caution_flags: Caution[];
  sent_count: number; last_sent_at: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 70) return "#059669";
  if (s >= 45) return "#d97706";
  return "#6b7280";
}

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

function ScorePill({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 38, height: 38, borderRadius: "50%",
      border: `2px solid ${color}20`, background: `${color}12`,
      fontSize: 13, fontWeight: 700, color, flexShrink: 0,
    }}>{score}</span>
  );
}

// ─── Todo Item Card ───────────────────────────────────────────────────────────

function TodoCard({ item, rank, onAction, onLog }: {
  item: TodoItem; rank: number;
  onAction: (id: number, action: string, params?: object) => Promise<void>;
  onLog: (id: number, event: string) => Promise<void>;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function act(action: string, params?: object) {
    setActing(action);
    await onAction(item.id, action, params);
    if (action === 'mark_sent' || action === 'suppress') setDone(true);
    setActing(null);
  }

  if (done) return null;

  const na = item.next_best_action;
  const hasCautions = item.caution_flags?.length > 0;

  return (
    <div style={{
      background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14, padding: "16px 18px",
      display: "flex", gap: 14, alignItems: "flex-start",
      transition: "border-color .15s, opacity .15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.15)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,.08)")}
    >
      {/* Rank + score */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,.2)", fontWeight: 700 }}>#{rank}</span>
        <ScorePill score={item.score} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Buyer → Vessel */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{item.lead_name}</span>
          <span style={{ color: "rgba(255,255,255,.25)", fontSize: 13 }}>→</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
            {item.year ? `${item.year} ` : ""}{item.builder} {item.vessel_name}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,.3)", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <User size={10} /> Last contact: {daysAgo(item.last_contacted_at)}
          </span>
          {item.sent_count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Send size={10} /> Sent {item.sent_count}×
            </span>
          )}
          <span style={{ color: "rgba(255,255,255,.2)" }}>Priority {item.manual_priority_score}</span>
        </div>

        {/* Summary */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 8px", lineHeight: 1.55 }}>
          {item.summary_sentence || "—"}
        </p>

        {/* Top reasons */}
        {item.top_reasons?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {item.top_reasons.slice(0, 2).map((r, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99,
                background: "rgba(16,185,129,.09)", border: "1px solid rgba(16,185,129,.2)", color: "#34d399",
              }}>{r.label}</span>
            ))}
          </div>
        )}

        {/* Cautions */}
        {hasCautions && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {item.caution_flags.slice(0, 2).map((c, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99, display: "flex", alignItems: "center", gap: 3,
                background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.15)", color: "#fbbf24",
              }}><AlertTriangle size={9} /> {c.label}</span>
            ))}
          </div>
        )}

        {/* Next action hint */}
        {na?.label && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.25)", margin: "0 0 10px", fontStyle: "italic" }}>
            → {na.label}: {na.reason}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button onClick={() => act("mark_sent", { channel: "email" })} disabled={!!acting} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.25)", color: "#34d399",
            display: "flex", alignItems: "center", gap: 5, opacity: acting ? 0.5 : 1,
          }}><Send size={11} /> {acting === "mark_sent" ? "Logging…" : "Mark Sent"}</button>

          <button onClick={() => onLog(item.id, "phone_call")} disabled={!!acting} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.2)", color: "#60a5fa",
            display: "flex", alignItems: "center", gap: 5,
          }}>📞 Called</button>

          <button onClick={() => act("move_to_bot")} disabled={!!acting} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", color: "#818cf8",
            display: "flex", alignItems: "center", gap: 5,
          }}><Bot size={11} /> Bot</button>

          <button onClick={() => act("boost", { boost_value: 15, reason: "Broker prioritized from todo" })} disabled={!!acting} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", color: "#fbbf24",
            display: "flex", alignItems: "center", gap: 5,
          }}><TrendingUp size={11} /> Boost</button>

          <button onClick={() => act("suppress", { reason: "Dismissed from todo queue" })} disabled={!!acting} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", color: "#f87171",
            display: "flex", alignItems: "center", gap: 5,
          }}><EyeOff size={11} /> Skip</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConnectTodoPage() {
  const [items, setItems]     = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/connect/matches/todo").then(r => r.json());
      if (r.ok) { setItems(r.data); setLastFetch(new Date().toLocaleTimeString()); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(matchId: number, action: string, params: object = {}) {
    await fetch(`/api/connect/matches/${matchId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    });
    // Re-fetch to keep queue fresh after any action
    await load();
  }

  async function handleLog(matchId: number, eventType: string) {
    // Find the item so we know lead/brochure IDs
    const item = items.find(i => i.id === matchId);
    if (!item) return;
    await fetch("/api/connect/engagement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: item.lead_id, brochure_id: item.brochure_id,
        event_type: eventType, event_source: "broker_log",
      }),
    });
    await load();
  }

  const visible = items.filter(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: "var(--navy-950,#080e1a)", color: "var(--navy-100,#e2e8f0)", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckSquare size={20} color="#059669" />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Connect — To Do</h1>
            {!loading && (
              <span style={{
                padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                background: visible.length > 0 ? "rgba(16,185,129,.12)" : "rgba(255,255,255,.05)",
                border: `1px solid ${visible.length > 0 ? "rgba(16,185,129,.25)" : "rgba(255,255,255,.08)"}`,
                color: visible.length > 0 ? "#34d399" : "rgba(255,255,255,.3)",
              }}>{visible.length} to action</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastFetch && <span style={{ fontSize: 11, color: "rgba(255,255,255,.25)" }}>Updated {lastFetch}</span>}
            <button onClick={load} disabled={loading} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)",
              color: "rgba(255,255,255,.6)",
            }}><RefreshCw size={12} /> Refresh</button>
            <a href="/connect" style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.2)",
              color: "#fbbf24", textDecoration: "none",
            }}><Zap size={12} /> All Matches <ArrowUpRight size={11} /></a>
          </div>
        </div>

        {/* Explanation */}
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)", marginBottom: 20, lineHeight: 1.6 }}>
          Top {visible.length > 0 ? visible.length : "—"} manual-queue matches ranked by priority score.
          Max 30. Items you mark sent, suppress, or move to bot are removed immediately.
        </p>

        {/* Content */}
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "rgba(255,255,255,.25)" }}>
            Loading your queue…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "80px 0", textAlign: "center" }}>
            <CheckSquare size={40} style={{ color: "#059669", opacity: 0.4, marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,.6)", marginBottom: 8 }}>
              You&apos;re all caught up
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", marginBottom: 20 }}>
              No manual-queue matches with fewer than 3 sends.
            </div>
            <a href="/connect" style={{
              padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.2)",
              color: "#fbbf24", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
            }}><Zap size={14} /> Run Rescore</a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map((item, i) => (
              <TodoCard
                key={item.id} item={item} rank={i + 1}
                onAction={handleAction} onLog={handleLog}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
