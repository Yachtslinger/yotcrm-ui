"use client";
import { useState, useEffect, useCallback } from "react";
import PageShell from "../components/PageShell";
import { Bot, CheckCircle, Circle, Play, RotateCcw, ChevronDown, ChevronUp, Mail, AlertCircle, Clock } from "lucide-react";

type Todo = {
  id: number; text: string; priority: string; assignee: string;
  lead_name?: string; lead_email?: string; created_at: string;
  email_draft?: string; bot_status?: string; sent_at?: string; send_error?: string;
};
type Counts = { bot_status: string; cnt: number }[];

function extractScore(text: string) { return parseInt(text.match(/\[Score:\s*(\d+)\]/)?.[1] || "0"); }
function cleanText(text: string) { return text.replace(/\s*\[Score:\s*\d+\]/, ""); }
function parseEmailDraft(draft: string) {
  const lines = draft.split("\n");
  const to      = lines.find(l => l.startsWith("To:"))?.replace("To:", "").trim() || "";
  const subject = lines.find(l => l.startsWith("Subject:"))?.replace("Subject:", "").trim() || "";
  const bodyIdx = lines.findIndex(l => l.startsWith("Hi "));
  const body    = bodyIdx >= 0 ? lines.slice(bodyIdx).join("\n") : lines.slice(3).join("\n");
  return { to, subject, body };
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
    <PageShell title="Bot Queue" subtitle="Review, green-light, and execute automated outreach">

      {/* Status strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Pending Review", val: pendingN, color: "text-[var(--navy-500)]", icon: <Clock className="w-4 h-4" /> },
          { label: "Approved ✓",     val: approvedN, color: "text-emerald-500",      icon: <CheckCircle className="w-4 h-4" /> },
          { label: "Sent",           val: sentN,     color: "text-[var(--brass-500)]", icon: <Mail className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="card-elevated px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)] mt-0.5 flex items-center justify-center gap-1">
              {s.icon}{s.label}
            </div>
          </div>
        ))}
      </div>

      {/* How it works banner */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-4 py-3 mb-5 flex gap-3 items-start">
        <Bot className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
        <div className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
          <span className="font-bold">How it works:</span> The system scores incoming listings against your leads. Strong matches (75–84) land here.
          Review the draft email → Approve the ones you like → Hit <strong>Execute Approved</strong> and the bot sends them all in one shot.
          Score 85+ goes straight to your <strong>To Do</strong> list for personal outreach.
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

        {/* Select all */}
        <button onClick={toggleAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-600)] text-xs font-medium text-[var(--navy-500)] hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors">
          {allSel ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Circle className="w-3.5 h-3.5" />}
          {allSel ? "Deselect All" : "Select All"}
        </button>

        {/* Bulk actions based on current tab */}
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

        {/* Execute button — only on approved tab */}
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

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-[var(--navy-400)] text-sm">Loading…</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-16 text-[var(--navy-400)]">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <div className="font-medium text-sm">{tab === "approved" ? "Nothing approved yet" : "Queue is empty"}</div>
          <div className="text-xs mt-1">{tab === "pending" ? "New match alerts will appear here after each nightly digest" : "Go to Pending tab to approve items"}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map(t => {
            const score   = extractScore(t.text);
            const display = cleanText(t.text);
            const isSel   = selected.has(t.id);
            const isExp   = expanded.has(t.id);
            const draft   = t.email_draft ? parseEmailDraft(t.email_draft) : null;
            const noEmail = draft?.to === "[client email]" || !draft?.to;

            return (
              <div key={t.id} className={`card-elevated overflow-hidden transition-all ${isSel ? "ring-2 ring-emerald-400" : ""}`}>
                {/* Row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(t.id)} className="mt-0.5 shrink-0">
                    {isSel ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-[var(--navy-300)]" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)] leading-snug">{display}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {t.lead_name && <span className="text-[10px] text-[var(--navy-400)]">{t.lead_name}</span>}
                      {t.lead_email && !noEmail && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ has email</span>}
                      {noEmail && <span className="text-[10px] text-amber-500 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />no email</span>}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.assignee === "will" ? "bg-[var(--sea-400)]/15 text-[var(--sea-600)]" : "bg-[var(--brass-400)]/15 text-[var(--brass-600)]"}`}>
                        {t.assignee}
                      </span>
                    </div>
                  </div>

                  {/* Score badge */}
                  {score > 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded shrink-0 ${score >= 80 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-[var(--sand-200)] text-[var(--navy-500)]"}`}>
                      {score}
                    </span>
                  )}

                  {/* Approve / unapprove toggle */}
                  {tab === "pending" ? (
                    <button onClick={() => approve([t.id])} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                  ) : (
                    <button onClick={() => unapprove([t.id])} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] text-[10px] font-bold hover:opacity-80 transition-colors border border-[var(--sand-300)] dark:border-[var(--navy-600)]">
                      <RotateCcw className="w-3 h-3" /> Undo
                    </button>
                  )}

                  {/* Expand draft */}
                  {draft && (
                    <button onClick={() => toggleExpand(t.id)} className="shrink-0 text-[var(--navy-400)] hover:text-[var(--navy-600)] transition-colors">
                      {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Draft preview */}
                {isExp && draft && (
                  <div className="border-t border-[var(--sand-200)] dark:border-[var(--navy-700)] mx-4 mb-3 pt-3">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-[var(--navy-400)] mb-2">Email Draft</div>
                    <div className="text-xs text-[var(--navy-500)] mb-1"><span className="font-semibold">To:</span> {draft.to}</div>
                    <div className="text-xs text-[var(--navy-500)] mb-2"><span className="font-semibold">Subject:</span> {draft.subject}</div>
                    <div className="text-xs text-[var(--navy-600)] dark:text-[var(--navy-300)] whitespace-pre-wrap leading-relaxed bg-[var(--sand-50)] dark:bg-[var(--navy-900)] rounded-lg p-3 max-h-48 overflow-y-auto font-mono">
                      {draft.body}
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
