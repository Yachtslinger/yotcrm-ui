"use client";
import React, { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import Link from "next/link";

type Thread = {
  id: number; subject: string; status: string; message_count: number;
  last_activity: string; extraction_status?: string; from_address?: string; from_name?: string; lead_id?: number;
  match_method?: string; match_confidence?: number;
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "#f59e0b",
  reviewed:  "#10b981",
  dismissed: "#6b7280",
};
const EXTRACT_COLORS: Record<string, string> = {
  pending:   "#f59e0b",
  approved:  "#10b981",
  rejected:  "#6b7280",
  corrected: "#3b82f6",
};

export default function CommsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [summary, setSummary] = useState<{ needs_attention: number; review_captures: number; pending_extractions: number } | null>(null);

  useEffect(() => { loadThreads(); }, [statusFilter]);
  useEffect(() => {
    fetch("/api/comms/review-summary").then(r => r.json()).then(d => { if (d.ok) setSummary(d); }).catch(() => {});
  }, []);

  async function loadThreads() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const r = await fetch(`/api/comms/threads?${params}`);
      const d = await r.json();
      if (d.ok) { setThreads(d.threads); setTotal(d.total); }
    } finally { setLoading(false); }
  }

  async function refreshSummary() {
    try { const d = await (await fetch("/api/comms/review-summary")).json(); if (d.ok) setSummary(d); } catch { /* ignore */ }
  }
  async function captureAction(threadId: number, action: "keep" | "toss") {
    try {
      await fetch("/api/comms/capture-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, action }),
      });
    } catch { /* ignore */ }
    loadThreads(); refreshSummary();
  }

  function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <PageShell title="Comms Capture">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "serif", fontSize: 26, marginBottom: 4 }}>Communication Capture</h1>
            <p style={{ fontSize: 13, color: "#888" }}>
              BCC or forward emails to <strong>yotbot@denisonyachting.com</strong> — YotBot captures, parses, and extracts lead intelligence automatically.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([["pending","Needs Review"],["","All"],["reviewed","Reviewed"],["dismissed","Dismissed"]] as [string,string][]).map(([s,label]) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: statusFilter === s ? "var(--brass-400, #b8933a)" : "var(--card, #1e293b)",
                  border: "1px solid var(--border, #334155)", color: statusFilter === s ? "#fff" : "var(--foreground)" }}>
                {label}{s === "pending" && summary && summary.needs_attention > 0 ? ` (${summary.needs_attention})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {([
            ["Needs Review", summary?.needs_attention ?? "—"],
            ["Confirm Contact", summary?.review_captures ?? "—"],
            ["Verify Reading", summary?.pending_extractions ?? "—"],
            ["Total Threads", total],
          ] as [string, string | number][]).map(([label, val]) => (
            <div key={String(label)} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 20px", minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif" }}>{val}</div>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Thread list */}
        {loading ? (
          <p style={{ color: "#888", textAlign: "center", padding: 40 }}>Loading…</p>
        ) : threads.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "var(--card)", border: "1px dashed var(--border)", borderRadius: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
            <p style={{ fontSize: 15, fontWeight: 600 }}>No emails captured yet</p>
            <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>
              BCC <strong>yotbot@denisonyachting.com</strong> on any client email to start capturing
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {threads.map(t => (
              <div key={t.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px",
                transition: "border-color .15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#b8933a")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                <Link href={`/comms/${t.id}`} style={{ textDecoration: "none", color: "inherit", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, cursor: "pointer" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.subject || "(no subject)"}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, letterSpacing: "0.08em",
                        background: STATUS_COLORS[t.status] + "22", color: STATUS_COLORS[t.status] }}>
                        {t.status.toUpperCase()}
                      </span>
                      {t.extraction_status && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20,
                          background: (EXTRACT_COLORS[t.extraction_status] ?? "#888") + "22",
                          color: EXTRACT_COLORS[t.extraction_status] ?? "#888" }}>
                          {t.extraction_status === "pending" ? "⏳ Awaiting Review" : t.extraction_status === "approved" ? "✓ Reviewed" : t.extraction_status}
                        </span>
                      )}
                      {t.match_method === "created_new_review" && (
                        <span title="Captured from a role/shared address (e.g. info@, sales@) — confirm whether this should be a contact"
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                          background: "#f59e0b22", color: "#f59e0b" }}>
                          ⚠ Confirm contact
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      From: <strong style={{ color: "var(--foreground)" }}>{t.from_name || t.from_address}</strong>
                      {t.from_name && <span> &lt;{t.from_address}&gt;</span>}
                      {" · "}{t.message_count} message{t.message_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", textAlign: "right", whiteSpace: "nowrap" }}>
                    {relTime(t.last_activity)}
                  </div>
                </Link>
                {t.match_method === "created_new_review" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, color: "#888", alignSelf: "center", marginRight: "auto" }}>
                      Borderline capture — keep as a contact or toss it?
                    </span>
                    <button onClick={() => captureAction(t.id, "keep")}
                      style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: "#10b981", border: "none", color: "#fff" }}>
                      ✓ Keep contact
                    </button>
                    <button onClick={() => captureAction(t.id, "toss")}
                      style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: "transparent", border: "1px solid var(--border)", color: "#ef4444" }}>
                      Toss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
