"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "../../components/PageShell";

type Task = { text: string; due_days: number; priority: string };
type Extraction = {
  id: number; status: string; summary: string | null;
  contact_name: string | null; contact_name_conf: number | null;
  contact_email: string | null; contact_email_conf: number | null;
  contact_phone: string | null; contact_phone_conf: number | null;
  contact_company: string | null; contact_company_conf: number | null;
  intent: string | null; intent_conf: number | null;
  yacht_makes: string[]; yacht_models: string[];
  budget_range: string | null; budget_conf: number | null;
  timeline: string | null; timeline_conf: number | null;
  yacht_length_range: string | null; year_range: string | null;
  location_pref: string | null; features_mentioned: string[];
  lead_category: string | null; tags: string[];
  suggested_tasks: Task[];
  draft_reply: string | null; draft_subject: string | null;
};
type Message = {
  id: number; from_address: string; from_name: string; subject: string;
  body_plain: string; sent_at: string; direction: string;
};
type Thread = { id: number; subject: string; status: string; lead_id: number | null };

function Conf({ v }: { v: number | null }) {
  if (!v) return null;
  const color = v >= 0.9 ? "#10b981" : v >= 0.7 ? "#f59e0b" : "#ef4444";
  return <span style={{ fontSize: 10, color, marginLeft: 6 }}>{Math.round(v * 100)}%</span>;
}

function FieldRow({ label, value, conf, editable, onEdit }: { label: string; value: string | null; conf?: number | null; editable?: boolean; onEdit?: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  if (!value && !editable) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 11, color: "#888", minWidth: 120, textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 2 }}>{label}</span>
      {editing ? (
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          <input value={val} onChange={e => setVal(e.target.value)} style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)", borderRadius: 6, padding: "4px 8px", fontSize: 13 }} />
          <button onClick={() => { onEdit?.(val); setEditing(false); }} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid var(--border)", color: "#888", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <span style={{ fontSize: 13 }}>{value || <em style={{ color: "#666" }}>not detected</em>}</span>
          {conf !== undefined && <Conf v={conf} />}
          {editable && <button onClick={() => { setVal(value ?? ""); setEditing(true); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 11 }}>✎</button>}
        </div>
      )}
    </div>
  );
}

export default function CommsThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [extractions, setExtractions] = useState<{ message_id: number; extraction: Extraction | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [extracting, setExtracting] = useState<number | null>(null);

  useEffect(() => { loadThread(); }, [id]);

  async function loadThread() {
    setLoading(true);
    try {
      const r = await fetch(`/api/comms/threads/${id}`);
      const d = await r.json();
      if (d.ok) { setThread(d.thread); setMessages(d.messages); setExtractions(d.extractions); }
    } finally { setLoading(false); }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function handleReview(extractionId: number, action: "approve" | "reject") {
    const r = await fetch(`/api/comms/review/${extractionId}?action=${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await r.json();
    if (d.ok) { showToast(action === "approve" ? "✓ Approved — tasks created, draft saved" : "Dismissed"); loadThread(); }
    else showToast("Error: " + d.error);
  }

  async function handleEditField(extractionId: number, field: string, value: string) {
    await fetch(`/api/comms/review/${extractionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }) });
    loadThread();
  }

  async function reExtract(messageId: number) {
    setExtracting(messageId);
    try {
      const r = await fetch(`/api/comms/extract/${messageId}`, { method: "POST" });
      const d = await r.json();
      if (d.ok) { showToast("✓ Re-extracted"); loadThread(); }
      else showToast("Error: " + d.error);
    } finally { setExtracting(null); }
  }

  if (loading) return <PageShell title="Comms"><p style={{ padding: 40, color: "#888", textAlign: "center" }}>Loading…</p></PageShell>;

  const latestExt = extractions.find(e => e.extraction?.status === "pending" || e.extraction?.status === "corrected")?.extraction
    ?? extractions[extractions.length - 1]?.extraction ?? null;
  const latestMsg = messages[messages.length - 1];

  return (
    <PageShell title="Comms">
      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: "#10b981", color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
        <button onClick={() => router.push("/comms")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, marginBottom: 16 }}>← Back to Comms</button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
          {/* Left — messages */}
          <div>
            <h2 style={{ fontFamily: "serif", fontSize: 20, marginBottom: 16 }}>{thread?.subject || "(no subject)"}</h2>
            {messages.map(msg => (
              <div key={msg.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{msg.from_name || msg.from_address}</strong>
                    {msg.from_name && <span style={{ fontSize: 12, color: "#888" }}> &lt;{msg.from_address}&gt;</span>}
                    <span style={{ fontSize: 11, marginLeft: 8, padding: "2px 8px", borderRadius: 20, background: msg.direction === "bcc" ? "#f59e0b22" : "#3b82f622", color: msg.direction === "bcc" ? "#f59e0b" : "#3b82f6" }}>{msg.direction}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#888" }}>{new Date(msg.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <pre style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--foreground)", margin: 0 }}>
                  {msg.body_plain.slice(0, 2000)}{msg.body_plain.length > 2000 ? "\n[…truncated]" : ""}
                </pre>
                {/* Re-extract button */}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => reExtract(msg.id)} disabled={extracting === msg.id}
                    style={{ fontSize: 11, padding: "4px 12px", borderRadius: 7, background: "rgba(184,147,58,.1)", border: "1px solid rgba(184,147,58,.3)", color: "#b8933a", cursor: "pointer" }}>
                    {extracting === msg.id ? "Extracting…" : "✦ Re-Extract"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right — extraction review */}
          {latestExt ? (
            <div>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", position: "sticky", top: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>YotBot Extraction</h3>
                  <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: latestExt.status === "pending" ? "#f59e0b22" : "#10b98122", color: latestExt.status === "pending" ? "#f59e0b" : "#10b981", fontWeight: 600 }}>
                    {latestExt.status.toUpperCase()}
                  </span>
                </div>

                {/* Summary */}
                {latestExt.summary && <p style={{ fontSize: 13, color: "#ccc", marginBottom: 14, lineHeight: 1.6, padding: "10px 12px", background: "rgba(184,147,58,.06)", borderRadius: 8, borderLeft: "3px solid #b8933a" }}>{latestExt.summary}</p>}

                {/* Category */}
                {latestExt.lead_category && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888" }}>Category: </span>
                    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, fontWeight: 700,
                      background: latestExt.lead_category === "hot" ? "#ef444422" : latestExt.lead_category === "warm" ? "#f59e0b22" : "#6b728022",
                      color: latestExt.lead_category === "hot" ? "#ef4444" : latestExt.lead_category === "warm" ? "#f59e0b" : "#9ca3af" }}>
                      {latestExt.lead_category.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Contact fields */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b8933a", marginBottom: 6 }}>Contact</p>
                  <FieldRow label="Name" value={latestExt.contact_name} conf={latestExt.contact_name_conf} editable onEdit={v => handleEditField(latestExt.id, "contact_name", v)} />
                  <FieldRow label="Email" value={latestExt.contact_email} conf={latestExt.contact_email_conf} editable onEdit={v => handleEditField(latestExt.id, "contact_email", v)} />
                  <FieldRow label="Phone" value={latestExt.contact_phone} conf={latestExt.contact_phone_conf} editable onEdit={v => handleEditField(latestExt.id, "contact_phone", v)} />
                  <FieldRow label="Company" value={latestExt.contact_company} conf={latestExt.contact_company_conf} editable onEdit={v => handleEditField(latestExt.id, "contact_company", v)} />
                </div>

                {/* Deal fields */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b8933a", marginBottom: 6 }}>Deal Context</p>
                  <FieldRow label="Intent" value={latestExt.intent} conf={latestExt.intent_conf} editable onEdit={v => handleEditField(latestExt.id, "intent", v)} />
                  <FieldRow label="Budget" value={latestExt.budget_range} conf={latestExt.budget_conf} editable onEdit={v => handleEditField(latestExt.id, "budget_range", v)} />
                  <FieldRow label="Timeline" value={latestExt.timeline} conf={latestExt.timeline_conf} editable onEdit={v => handleEditField(latestExt.id, "timeline", v)} />
                  <FieldRow label="Makes" value={latestExt.yacht_makes?.join(", ") || null} />
                  <FieldRow label="Models" value={latestExt.yacht_models?.join(", ") || null} />
                  <FieldRow label="Length" value={latestExt.yacht_length_range} />
                  <FieldRow label="Year Range" value={latestExt.year_range} />
                  <FieldRow label="Location" value={latestExt.location_pref} />
                  {latestExt.features_mentioned?.length > 0 && <FieldRow label="Features" value={latestExt.features_mentioned.join(", ")} />}
                </div>

                {/* Tags */}
                {latestExt.tags?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b8933a", marginBottom: 6 }}>Tags</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {latestExt.tags.map(t => <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(184,147,58,.1)", color: "#b8933a" }}>{t}</span>)}
                    </div>
                  </div>
                )}

                {/* Suggested tasks */}
                {latestExt.suggested_tasks?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b8933a", marginBottom: 6 }}>Suggested Tasks</p>
                    {latestExt.suggested_tasks.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, fontWeight: 700, flexShrink: 0, marginTop: 2,
                          background: t.priority === "high" ? "#ef444422" : t.priority === "medium" ? "#f59e0b22" : "#6b728022",
                          color: t.priority === "high" ? "#ef4444" : t.priority === "medium" ? "#f59e0b" : "#9ca3af" }}>
                          {t.priority?.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 12 }}>{t.text}</span>
                        <span style={{ fontSize: 11, color: "#888", flexShrink: 0, marginLeft: "auto" }}>+{t.due_days}d</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Draft reply */}
                {latestExt.draft_reply && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b8933a" }}>Draft Reply</p>
                      <button onClick={() => setShowDraft(p => !p)} style={{ fontSize: 11, background: "none", border: "none", color: "#888", cursor: "pointer" }}>{showDraft ? "Hide" : "Preview"}</button>
                    </div>
                    {showDraft && (
                      <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 8, padding: 12 }}>
                        <p style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>Subject: {latestExt.draft_subject}</p>
                        <pre style={{ fontFamily: "inherit", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, color: "var(--foreground)" }}>{latestExt.draft_reply}</pre>
                        <p style={{ fontSize: 10, color: "#f59e0b", marginTop: 8 }}>⚠ Requires human approval before sending</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {latestExt.status === "pending" || latestExt.status === "corrected" ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button onClick={() => handleReview(latestExt.id, "approve")}
                      style={{ flex: 1, background: "#10b981", color: "#fff", border: "none", borderRadius: 9, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      ✓ Approve All
                    </button>
                    <button onClick={() => handleReview(latestExt.id, "reject")}
                      style={{ background: "rgba(239,68,68,.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 9, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      ✗
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: "10px 0", textAlign: "center", fontSize: 13, color: latestExt.status === "approved" ? "#10b981" : "#888", fontWeight: 600 }}>
                    {latestExt.status === "approved" ? "✓ Approved" : "Dismissed"}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--card)", border: "1px dashed var(--border)", borderRadius: 12, padding: 24, textAlign: "center" }}>
              <p style={{ color: "#888", fontSize: 13 }}>No extraction yet</p>
              {latestMsg && (
                <button onClick={() => reExtract(latestMsg.id)} style={{ marginTop: 10, background: "rgba(184,147,58,.1)", border: "1px solid rgba(184,147,58,.3)", color: "#b8933a", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
                  ✦ Run Extraction
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
