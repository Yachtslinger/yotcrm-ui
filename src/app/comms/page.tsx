"use client";
import React, { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import Link from "next/link";

type Thread = {
  id: number; subject: string; status: string; message_count: number;
  last_activity: string; extraction_status?: string; from_address?: string; from_name?: string; lead_id?: number;
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
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => { loadThreads(); }, [statusFilter]);

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
            {["", "pending", "reviewed", "dismissed"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: statusFilter === s ? "var(--brass-400, #b8933a)" : "var(--card, #1e293b)",
                  border: "1px solid var(--border, #334155)", color: statusFilter === s ? "#fff" : "var(--foreground)" }}>
                {s || "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {[["Total Threads", total], ["Pending Review", threads.filter(t => t.status === "pending").length]].map(([label, val]) => (
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
              <Link key={t.id} href={`/comms/${t.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px",
                  display: "grid", gridTemplateColumns: "1fr auto", gap: 12, cursor: "pointer",
                  transition: "border-color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#b8933a")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
