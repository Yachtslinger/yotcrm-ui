"use client";

import React, { useEffect, useState } from "react";
import { Shield, ChevronRight, AlertTriangle } from "lucide-react";
import PageShell from "../../components/PageShell";

/* Governed Deal Workspace — vessel list (read-only, Slice 1).
   Self-gates on the MA_GOVERNANCE_ENABLED flag via GET /status: when the flag
   is off the API returns { enabled:false } and we render an informational
   notice instead of erroring. Data is read-only; no create/edit here. */

interface VesselRow {
  id: number;
  display_name: string;
  status: string;
  created_by: string | null;
  created_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#0e7490", draft: "#6b7280", archived: "#374151",
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "#6b7280";
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: `${c}1a`, color: c, border: `1px solid ${c}33` }}>
      {status || "—"}
    </span>
  );
}

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

type Gate = "loading" | "enabled" | "disabled" | "error";

export default function GovernedWorkspaceList() {
  const [gate, setGate] = useState<Gate>("loading");
  const [vessels, setVessels] = useState<VesselRow[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/market-analysis/governance/status");
        const sj = await s.json();
        if (!sj?.enabled) { setGate("disabled"); return; }
        const r = await fetch("/api/market-analysis/governance/vessels");
        const rj = await r.json();
        if (!rj?.ok) throw new Error(rj?.error || "Failed to load vessels");
        setVessels(rj.vessels || []);
        setGate("enabled");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setGate("error");
      }
    })();
  }, []);

  return (
    <PageShell
      title="Governed Deal Workspace"
      subtitle="Read-only audit view of governed vessels, proposals, comps, reports, and finalized versions"
      maxWidth="wide"
      loading={gate === "loading"}
    >
      {gate === "disabled" && (
        <div className="empty-state">
          <div className="empty-state-icon"><Shield size={28} /></div>
          <div className="empty-state-text">Governed valuation isn&apos;t enabled</div>
          <div className="empty-state-sub">
            This workspace activates when MA_GOVERNANCE_ENABLED is set. The standard
            Market Analysis tools are unaffected.
          </div>
        </div>
      )}

      {gate === "error" && (
        <div className="card-elevated" style={{ padding: 20, borderLeft: "3px solid #dc2626" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#dc2626", fontWeight: 600 }}>
            <AlertTriangle size={18} /> Couldn&apos;t load the workspace
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>{err}</div>
        </div>
      )}

      {gate === "enabled" && vessels.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Shield size={28} /></div>
          <div className="empty-state-text">No governed vessels yet</div>
          <div className="empty-state-sub">Governed vessels will appear here once created.</div>
        </div>
      )}

      {gate === "enabled" && vessels.length > 0 && (
        <div className="card-elevated" style={{ overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr><th>Vessel</th><th>Status</th><th>Created</th><th>By</th><th></th></tr>
            </thead>
            <tbody>
              {vessels.map((v) => (
                <tr key={v.id} className="card-interactive"
                  style={{ cursor: "pointer" }}
                  onClick={() => { window.location.href = `/market-analysis/governed/${v.id}`; }}>
                  <td style={{ fontWeight: 600 }}>{v.display_name || `Vessel #${v.id}`}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>{fmtDate(v.created_at)}</td>
                  <td style={{ opacity: 0.7 }}>{v.created_by || "—"}</td>
                  <td style={{ textAlign: "right", opacity: 0.5 }}><ChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
