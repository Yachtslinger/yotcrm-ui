"use client";
import { useState, useEffect, useCallback } from "react";
import PageShell from "../components/PageShell";
import {
  Bot, CheckCircle, Circle, Play, RotateCcw,
  ChevronDown, ChevronUp, Mail, AlertCircle, Clock, ArrowUp, X,
} from "lucide-react";

type Todo = {
  id: number; text: string; priority: string; assignee: string;
  lead_id?: number | null; listing_id?: number | null;
  lead_name?: string; lead_email?: string; created_at: string;
  email_draft?: string; bot_status?: string; sent_at?: string; send_error?: string;
};
type Counts = { bot_status: string; cnt: number }[];

function extractScore(text: string) {
  return parseInt(text.match(/\[Score:\s*(\d+)\]/)?.[1] || "0");
}
function cleanText(text: string) {
  return text.replace(/\s*\[Score:\s*\d+\]/, "").replace(/\n/g, " ").trim();
}

// ── Parse match metadata section from email_draft ──────────────────────────
function parseMatchMeta(draft: string) {
  const lines = draft.split("\n");

  const to      = lines.find(l => l.startsWith("To:"))?.replace("To:", "").trim() || "";
  const subject = lines.find(l => l.startsWith("Subject:"))?.replace("Subject:", "").trim() || "";
  const bodyIdx = lines.findIndex(l => l.startsWith("Hi "));

  // Strip metadata section from body for display / sending
  const metaStart = lines.indexOf("---match-metadata---");
  const bodyLines = metaStart >= 0 ? lines.slice(0, metaStart) : lines;
  const body = bodyIdx >= 0
    ? bodyLines.slice(bodyIdx).join("\n").trimEnd()
    : bodyLines.slice(3).join("\n").trimEnd();

  // Parse machine-readable metadata
  let matchScore = 0, allSignals: string[] = [], allConflicts: string[] = [], allPenalties: string[] = [];
  if (metaStart >= 0) {
    for (const ml of lines.slice(metaStart + 1)) {
      if (ml.startsWith("---")) break;
      if (ml.startsWith("score:"))     matchScore   = parseInt(ml.slice(6)) || 0;
      if (ml.startsWith("signals:"))   allSignals   = ml.slice(8).split(" | ").filter(Boolean);
      if (ml.startsWith("conflicts:")) allConflicts = ml.slice(10).split(" | ").filter(Boolean);
      if (ml.startsWith("penalties:")) allPenalties = ml.slice(10).split(" | ").filter(Boolean);
    }
  }

  // Boat specs from text lines
  const year     = lines.find(l => l.startsWith("Year:"))?.replace("Year:", "").trim() || "";
  const loa      = lines.find(l => l.startsWith("LOA:"))?.replace("LOA:", "").replace(/'/g,"").trim() || "";
  const price    = lines.find(l => l.startsWith("Asking:"))?.replace("Asking:", "").trim() || "";
  const location = lines.find(l => l.startsWith("Location:"))?.replace("Location:", "").trim() || "";

  const noEmail = to === "[client email]" || !to;

  return { to, subject, body, noEmail, matchScore, allSignals, allConflicts, allPenalties, year, loa, price, location };
}

export default function BotQueuePage() {
  const [todos, setTodos]           = useState<Todo[]>([]);
  const [counts, setCounts]         = useState<Counts>([]);
  const [tab, setTab]               = useState<"pending"|"approved">("pending");
  const [expanded, setExpanded]     = useState<Set<number>>(new Set());
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [executing, setExecuting]   = useState(false);
  const [execResult, setExecResult] = useState<{sent:number;failed:number;results:any[]} | null>(null);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/botqueue?status=${tab}`)
      .then(r => r.json())
      .then(d => { if (d.ok) { setTodos(d.todos); setCounts(d.counts || []); } })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); setSelected(new Set()); setExecResult(null); }, [load]);

  const countFor = (s: string) => counts.find(c => c.bot_status === s || (!c.bot_status && s === "pending"))?.cnt || 0;
  const pendingN  = countFor("pending");
  const approvedN = countFor("approved");
  const sentN     = countFor("sent");

  async function approve(ids: number[]) {
    await fetch("/api/botqueue", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", ids }) });
    setSelected(new Set()); load();
  }
  async function unapprove(ids: number[]) {
    await fetch("/api/botqueue", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unapprove", ids }) });
    setSelected(new Set()); load();
  }
  async function promote(todo: Todo) {
    await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote", id: todo.id }) });
    load();
  }
  async function dismiss(todo: Todo) {
    await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "dismiss_match",
        todo: { id: todo.id, listing_id: todo.listing_id, lead_id: todo.lead_id, assignee: todo.assignee },
      }) });
    setTodos(p => p.filter(t => t.id !== todo.id));
  }
  async function execute() {
    setExecuting(true); setExecResult(null);
    const res = await fetch("/api/botqueue", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "execute" }) });
    const d = await res.json();
    setExecResult(d); setExecuting(false); load();
  }

  function toggleExpand(id: number) { setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleSelect(id: number) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const allSel = todos.length > 0 && todos.every(t => selected.has(t.id));
  function toggleAll() { setSelected(allSel ? new Set() : new Set(todos.map(t => t.id))); }

  return (
    <PageShell title="Bot Queue" subtitle="Review, promote, or execute automated outreach">

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Pending Review", val: pendingN,  color: "text-[var(--navy-500)]",    icon: <Clock className="w-4 h-4" /> },
          { label: "Approved ✓",     val: approvedN, color: "text-emerald-500",           icon: <CheckCircle className="w-4 h-4" /> },
          { label: "Sent",           val: sentN,     color: "text-[var(--brass-500)]",    icon: <Mail className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="card-elevated px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)] mt-0.5 flex items-center justify-center gap-1">
              {s.icon}{s.label}
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-4 py-3 mb-5 flex gap-3 items-start">
        <Bot className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
        <div className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
          <span className="font-bold">Score 75–87:</span> Solid match but not quite strong enough for your personal queue.
          Review the draft → <strong>Approve</strong> to queue for bot send, <strong>↑ Promote</strong> to move to your To Do list,
          or <strong>✕ Dismiss</strong> to permanently exclude this listing for this buyer.
        </div>
      </div>

      {/* Tabs + actions */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-[var(--sand-300)] dark:border-[var(--navy-600)]">
          {(["pending","approved"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${tab === t ? "bg-[var(--navy-800)] text-white" : "text-[var(--navy-400)] hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]"}`}>
              {t} {t === "pending" ? `(${pendingN})` : `(${approvedN})`}
            </button>
          ))}
        </div>
        <button onClick={toggleAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-600)] text-xs font-medium text-[var(--navy-500)] hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors">
          {allSel ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5" />}
          {allSel ? "Deselect All" : "Select All"}
        </button>
        {selected.size > 0 && tab === "pending" && (
          <button onClick={() => approve([...selected])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors">
            <CheckCircle className="w-3.5 h-3.5" /> Approve {selected.size}
          </button>
        )}
        {selected.size > 0 && tab === "approved" && (
          <button onClick={() => unapprove([...selected])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--sand-300)] dark:bg-[var(--navy-700)] text-[var(--navy-600)] dark:text-[var(--navy-200)] text-xs font-semibold hover:opacity-80 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Move to Pending
          </button>
        )}
        {tab === "approved" && approvedN > 0 && (
          <button onClick={execute} disabled={executing}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20">
            <Play className="w-4 h-4" />
            {executing ? "Sending…" : `Execute Approved (${approvedN})`}
          </button>
        )}
      </div>

      {/* Execute result */}
      {execResult && (
        <div className={`rounded-xl border px-4 py-3 mb-4 text-sm ${execResult.failed === 0 ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 text-amber-700 dark:text-amber-300"}`}>
          <strong>{execResult.sent} sent</strong>{execResult.failed > 0 ? `, ${execResult.failed} failed` : " — all good!"}
          {execResult.results?.filter((r:any) => r.status === "error").map((r:any) => (
            <div key={r.id} className="text-xs mt-1 opacity-75">✗ {r.name}: {r.error}</div>
          ))}
        </div>
      )}

      {/* Todo list */}
      {loading ? (
        <div className="text-center py-16 text-[var(--navy-400)] text-sm">Loading…</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-16 text-[var(--navy-400)]">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <div className="font-medium text-sm">{tab === "approved" ? "Nothing approved yet" : "Queue is empty"}</div>
          <div className="text-xs mt-1 opacity-70">{tab === "pending" ? "Bot matches (score 75–87) appear here after each batch" : "Go to Pending tab to approve items"}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map(t => {
            const score   = extractScore(t.text);
            const display = cleanText(t.text);
            const isSel   = selected.has(t.id);
            const isExp   = expanded.has(t.id);
            const meta    = t.email_draft ? parseMatchMeta(t.email_draft) : null;

            return (
              <div key={t.id} className={`card-elevated overflow-hidden transition-all ${isSel ? "ring-2 ring-emerald-400" : ""}`}>
                {/* Header row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <button onClick={() => toggleSelect(t.id)} className="mt-0.5 shrink-0">
                    {isSel ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-[var(--navy-300)]" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--navy-700)] dark:text-[var(--navy-200)] leading-snug">{display}</div>

                    {/* Boat specs line */}
                    {meta && (meta.year || meta.loa || meta.price || meta.location) && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {meta.year     && <span className="text-[10px] text-[var(--navy-400)]">📅 {meta.year}</span>}
                        {meta.loa      && <span className="text-[10px] text-[var(--navy-400)]">📏 {meta.loa}′</span>}
                        {meta.price    && <span className="text-[10px] text-[var(--navy-400)]">💰 {meta.price}</span>}
                        {meta.location && <span className="text-[10px] text-[var(--navy-400)]">📍 {meta.location}</span>}
                      </div>
                    )}

                    {/* Match signals strip */}
                    {meta && (meta.allSignals.length > 0 || meta.allConflicts.length > 0 || meta.allPenalties.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {meta.allSignals.slice(0, 3).map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>✓ {s}</span>
                        ))}
                        {meta.allSignals.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ color: "#059669", opacity: 0.7 }}>+{meta.allSignals.length - 3}</span>
                        )}
                        {meta.allConflicts.slice(0, 2).map((c, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: "rgba(245,158,11,0.08)", color: "#d97706" }}>⚠ {c}</span>
                        ))}
                        {meta.allPenalties.slice(0, 1).map((p, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: "rgba(239,68,68,0.07)", color: "#ef4444" }}>↓ {p}</span>
                        ))}
                      </div>
                    )}

                    {/* Lead info */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.lead_name  && <span className="text-[10px] text-[var(--navy-400)]">{t.lead_name}</span>}
                      {meta && !meta.noEmail && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ email</span>}
                      {meta?.noEmail && <span className="text-[10px] text-amber-500 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />no email</span>}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.assignee === "will" ? "bg-[var(--sea-400)]/15 text-[var(--sea-600)]" : "bg-[var(--brass-400)]/15 text-[var(--brass-600)]"}`}>
                        {t.assignee}
                      </span>
                    </div>
                  </div>

                  {/* Score badge */}
                  {score > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded shrink-0 bg-[var(--sand-200)] text-[var(--navy-600)] dark:bg-[var(--navy-700)] dark:text-[var(--navy-200)]">
                      {score}
                    </span>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {tab === "pending" ? (
                      <button onClick={() => approve([t.id])} title="Approve for bot send"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                    ) : (
                      <button onClick={() => unapprove([t.id])} title="Move back to pending"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] text-[10px] font-bold hover:opacity-80 transition-colors border border-[var(--sand-300)] dark:border-[var(--navy-600)]">
                        <RotateCcw className="w-3 h-3" /> Undo
                      </button>
                    )}
                    <button onClick={() => promote(t)} title="Promote to your human To Do queue"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors"
                      style={{ background: "rgba(59,130,246,0.06)", color: "#3b82f6", borderColor: "rgba(59,130,246,0.2)" }}>
                      <ArrowUp className="w-3.5 h-3.5" /> Promote
                    </button>
                    <button onClick={() => dismiss(t)} title="Permanently dismiss — won't resurface for this buyer"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors"
                      style={{ background: "rgba(107,114,128,0.06)", color: "#6b7280", borderColor: "rgba(107,114,128,0.2)" }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {meta && (
                      <button onClick={() => toggleExpand(t.id)} className="text-[var(--navy-400)] hover:text-[var(--navy-600)] transition-colors p-1">
                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded draft */}
                {isExp && meta && (
                  <div className="border-t border-[var(--sand-200)] dark:border-[var(--navy-700)] mx-4 mb-3 pt-3">
                    {/* Full signals */}
                    {(meta.allSignals.length > 0 || meta.allConflicts.length > 0 || meta.allPenalties.length > 0) && (
                      <div className="mb-3">
                        <div className="text-[10px] font-bold tracking-widest uppercase text-[var(--navy-400)] mb-1.5">
                          Match Reasoning {meta.matchScore > 0 && <span style={{ color: meta.matchScore >= 88 ? "#059669" : "#d97706" }}>· Score {meta.matchScore}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {meta.allSignals.map((s, i) => <span key={i} className="px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>✓ {s}</span>)}
                          {meta.allConflicts.map((c, i) => <span key={i} className="px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(245,158,11,0.08)", color: "#d97706" }}>⚠ {c}</span>)}
                          {meta.allPenalties.map((p, i) => <span key={i} className="px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(239,68,68,0.07)", color: "#ef4444" }}>↓ {p}</span>)}
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] font-bold tracking-widest uppercase text-[var(--navy-400)] mb-2">Email Draft</div>
                    <div className="text-xs text-[var(--navy-500)] mb-1"><span className="font-semibold">To:</span> {meta.to}</div>
                    <div className="text-xs text-[var(--navy-500)] mb-2"><span className="font-semibold">Subject:</span> {meta.subject}</div>
                    <div className="text-xs text-[var(--navy-600)] dark:text-[var(--navy-300)] whitespace-pre-wrap leading-relaxed bg-[var(--sand-50)] dark:bg-[var(--navy-900)] rounded-lg p-3 max-h-48 overflow-y-auto">
                      {meta.body}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
