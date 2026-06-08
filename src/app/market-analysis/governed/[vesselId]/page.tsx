"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Download, AlertTriangle } from "lucide-react";
import PageShell from "../../../components/PageShell";

/* Governed Deal Workspace — vessel detail (read-only, Slice 1).
   Powered entirely by GET /vessels/[id]/export, which returns the full audit
   read-model for one vessel. No writes; resolve/review/finalize come in Slice 2. */

type Row = Record<string, any>;
interface VesselExport {
  exportSchemaVersion: number;
  generatedAt: string;
  governanceSchemaVersion: number;
  schemaMeta: Record<string, string>;
  vessel: Row;
  liveFields: Row[];
  fieldHistory: Row[];
  sources: Row[];
  extractions: Row[];
  proposals: Row[];
  comps: Row[];
  compHistory: Row[];
  reports: Row[];
  reportSections: Row[];
  reportVersions: Row[];
  counts: Record<string, number>;
}

const STATUS_COLOR: Record<string, string> = {
  verified: "#059669", ai_accepted: "#0e7490", overridden: "#d97706",
  pending: "#6b7280", approved: "#059669", rejected: "#dc2626",
  edited_accepted: "#d97706", draft: "#6b7280", generated: "#0e7490",
  edited: "#d97706", approved_section: "#059669", finalized: "#7c3aed",
  empty: "#9ca3af", active: "#0e7490", closed: "#374151",
};
function Badge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "#6b7280";
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: `${c}1a`, color: c, border: `1px solid ${c}33` }}>
      {status || "—"}
    </span>
  );
}
const money = (v: any) =>
  v == null || v === "" ? "—" : typeof v === "number" ? `$${v.toLocaleString()}` : String(v);
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");

const TABS = ["Overview", "Fields", "Proposals", "Comps", "Reports", "Deal File (JSON)"] as const;
type Tab = (typeof TABS)[number];

export default function GovernedVesselWorkspace() {
  const params = useParams();
  const id = (params?.vesselId as string) || "";
  const [data, setData] = useState<VesselExport | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Overview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/market-analysis/governance/vessels/${id}/export`);
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error || (r.status === 404 ? "Vessel not found or governance disabled" : "Failed to load"));
        setData(j.export);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const copyJson = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const downloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `deal-file-vessel-${id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const v = data?.vessel || {};
  const title = (v.display_name as string) || `Vessel #${id}`;

  const tableCard = (head: React.ReactNode, body: React.ReactNode, empty: string, isEmpty: boolean) =>
    isEmpty ? (
      <div className="empty-state"><div className="empty-state-text">{empty}</div></div>
    ) : (
      <div className="card-elevated" style={{ overflow: "hidden" }}>
        <table className="data-table"><thead>{head}</thead><tbody>{body}</tbody></table>
      </div>
    );

  return (
    <PageShell
      title={title}
      subtitle={data ? <Badge status={(v.status as string) || ""} /> : undefined}
      maxWidth="wide"
      loading={loading}
      breadcrumb={[{ label: "Deal Workspace", href: "/market-analysis/governed" }, { label: title }]}
      toolbar={
        data ? (
          <div className="tab-bar">
            {TABS.map((t) => (
              <button key={t} className={`tab-bar-item ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        ) : undefined
      }
    >
      {err && (
        <div className="card-elevated" style={{ padding: 20, borderLeft: "3px solid #dc2626" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#dc2626", fontWeight: 600 }}>
            <AlertTriangle size={18} /> {err}
          </div>
        </div>
      )}

      {data && tab === "Overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {Object.entries(data.counts).map(([k, n]) => (
            <div key={k} className="stat-card">
              <div className="stat-card-value">{n}</div>
              <div className="stat-card-label">{k.replace(/([A-Z])/g, " $1")}</div>
            </div>
          ))}
        </div>
      )}

      {data && tab === "Fields" && tableCard(
        <tr><th>Field</th><th>Value</th><th>Status</th><th>Updated</th></tr>,
        data.liveFields.map((f) => (
          <tr key={f.id}><td style={{ fontWeight: 600 }}>{f.field_key}</td><td>{String(f.value ?? "—")}</td>
            <td><Badge status={f.status} /></td><td>{dt(f.updated_at)}</td></tr>
        )),
        "No live fields recorded.", data.liveFields.length === 0
      )}

      {data && tab === "Proposals" && tableCard(
        <tr><th>Field</th><th>Current</th><th>Proposed</th><th>Conflict</th><th>Status</th><th>Created</th></tr>,
        data.proposals.map((p) => (
          <tr key={p.id}><td style={{ fontWeight: 600 }}>{p.field_name}</td>
            <td style={{ opacity: 0.7 }}>{String(p.current_value_at_proposal ?? "—")}</td>
            <td>{String(p.proposed_value ?? "—")}</td>
            <td>{p.conflict ? <Badge status="rejected" /> : <span style={{ opacity: 0.4 }}>no</span>}</td>
            <td><Badge status={p.status} /></td><td>{dt(p.created_at)}</td></tr>
        )),
        "No proposals for this vessel.", data.proposals.length === 0
      )}

      {data && tab === "Comps" && tableCard(
        <tr><th>Type</th><th>Builder / Year / LOA</th><th>Asking</th><th>Sold</th><th>Discount</th><th>Status</th></tr>,
        data.comps.map((c) => (
          <tr key={c.id}><td><Badge status={c.type} /></td>
            <td>{[c.builder, c.year, c.loa].filter(Boolean).join(" · ") || "—"}</td>
            <td>{money(c.asking_price)}</td><td>{money(c.sold_price)}</td>
            <td>{c.discount == null ? "—" : String(c.discount)}</td>
            <td><Badge status={c.status} /></td></tr>
        )),
        "No comps for this vessel.", data.comps.length === 0
      )}

      {data && tab === "Reports" && (
        data.reports.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">No reports for this vessel.</div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.reports.map((r) => {
              const secs = data.reportSections.filter((s) => s.report_id === r.id);
              const vers = data.reportVersions.filter((x) => x.report_id === r.id);
              return (
                <div key={r.id} className="card-elevated" style={{ padding: 16 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700 }}>Report #{r.id}</span>
                    <Badge status={r.mode} /><Badge status={r.status} />
                    <span style={{ opacity: 0.6, fontSize: 12 }}>working v{r.version}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.6, margin: "8px 0 4px" }}>SECTIONS</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {secs.length === 0 ? <span style={{ opacity: 0.5 }}>none</span> :
                      secs.map((s) => (
                        <span key={s.id} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "var(--sand-100, #f3efe7)" }}>
                          {s.section_key} <Badge status={s.status} />
                        </span>
                      ))}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.6, margin: "12px 0 4px" }}>FINALIZED VERSIONS (frozen)</div>
                  {vers.length === 0 ? <span style={{ opacity: 0.5 }}>none</span> : (
                    <table className="data-table data-table-compact">
                      <thead><tr><th>Version</th><th>Finalized</th><th>Confidence</th><th>Closed comps</th></tr></thead>
                      <tbody>
                        {vers.map((x) => (
                          <tr key={x.id}><td>v{x.version}</td><td>{dt(x.finalized_at)}</td>
                            <td>{x.confidence ?? "—"}</td>
                            <td>{Array.isArray(x.closed_comps) ? x.closed_comps.length : "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {data && tab === "Deal File (JSON)" && (
        <div className="card-elevated" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="btn-secondary" onClick={copyJson}><Copy size={14} /> {copied ? "Copied" : "Copy"}</button>
            <button className="btn-secondary" onClick={downloadJson}><Download size={14} /> Download .json</button>
            <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 12 }}>
              export v{data.exportSchemaVersion} · {dt(data.generatedAt)}
            </span>
          </div>
          <pre style={{ maxHeight: 520, overflow: "auto", fontSize: 12, lineHeight: 1.5,
            background: "var(--navy-950, #0a1628)", color: "#cbd5e1", padding: 14, borderRadius: 8 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </PageShell>
  );
}
