"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useToast } from "../components/ToastProvider";
import PageShell from "../components/PageShell";

// ── Parse vessel + reason metadata out of a match email_draft ──────────────
function parseMatchMeta(todo: { text: string; email_draft?: string | null }) {
  const draft = todo.email_draft || "";
  const lines = draft.split("\n");
  const get = (prefix: string) => {
    const l = lines.find(x => x.trimStart().startsWith(prefix));
    return l ? l.slice(l.indexOf(prefix) + prefix.length).trim() : "";
  };

  const subjLine = lines.find(l => l.startsWith("Subject:")) || "";
  const boatTitle = subjLine
    .replace("Subject:", "").replace(/\s*—\s*I Think This One.*$/, "").trim();

  const year      = get("Year:").replace(/'/g, "");
  const loa       = get("LOA:").replace(/'/g, "");
  const price     = get("Asking:");
  const location  = get("Location:");
  const brokerage = get("Listed by:");

  const bwLine = lines.find(l => l.includes("View listing:")) || lines.find(l => l.includes("BoatWizard listing:")) || "";
  const listingUrl = (() => {
    const m = bwLine.match(/(https?:\/\/[^\s]+)/);
    return m ? m[1] : "";
  })();
  const denisonUrl = (() => {
    const l = lines.find(x => x.includes("denisonyachtsales.com")) || "";
    const m = l.match(/(https?:\/\/[^\s]+)/);
    return m ? m[1] : "";
  })();
  const ywUrl = (() => {
    const l = lines.find(x => x.includes("yachtworld.com")) || "";
    const m = l.match(/(https?:\/\/[^\s]+)/);
    return m ? m[1] : "";
  })();

  // top reason — last (...) in todo text
  const reasonMatch = todo.text.match(/\(([^)]+)\)\s*$/);
  const topReason = reasonMatch ? reasonMatch[1] : "";

  return { boatTitle, year, loa, price, location, brokerage, listingUrl, denisonUrl, ywUrl, topReason };
}

type Todo = {
  id: number; text: string; completed: number; priority: string;
  lead_id: number | null; due_date: string | null; created_at: string;
  completed_at: string | null; assignee: string;
  email_draft?: string | null; lead_name?: string; lead_email?: string;
};
type Filter = "all" | "active" | "completed";
type Person = "will" | "paolo";

type FollowUpType = { icon: string; label: string; prefix: string; };
const FOLLOW_UPS: FollowUpType[] = [
  { icon: "📞", label: "Call",    prefix: "Call"          },
  { icon: "✉️", label: "Email",   prefix: "Email"         },
  { icon: "💬", label: "Text",    prefix: "Text"          },
  { icon: "📅", label: "Meeting", prefix: "Schedule meeting with" },
  { icon: "📝", label: "Note",    prefix: "Follow up:"    },
];

export default function TodosPage() {
  const { toast } = useToast();
  const [todos, setTodos] = React.useState<Todo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newText, setNewText] = React.useState("");
  const [newPriority, setNewPriority] = React.useState<"normal" | "high">("normal");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [activePerson, setActivePerson] = React.useState<Person>("will");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editText, setEditText] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [expandedDraft, setExpandedDraft] = React.useState<number | null>(null);
  const [copiedDraftId, setCopiedDraftId] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  // Follow-up modal state
  const [followUpTodo, setFollowUpTodo] = React.useState<Todo | null>(null);
  const [followUpType, setFollowUpType] = React.useState<FollowUpType | null>(null);
  const [followUpText, setFollowUpText] = React.useState("");
  const [followUpDue, setFollowUpDue] = React.useState("");
  const [followUpPriority, setFollowUpPriority] = React.useState<"normal"|"high">("normal");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const fetchTodos = React.useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      if (data.ok) setTodos(data.todos);
    } catch { /**/ } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchTodos(); }, [fetchTodos]);
  React.useEffect(() => {
    const i = setInterval(fetchTodos, 30000);
    return () => clearInterval(i);
  }, [fetchTodos]);

  // Voice dictation
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => { setNewText(p => (p ? p + " " : "") + e.results[0][0].transcript); setListening(false); inputRef.current?.focus(); };
    r.onerror = () => setListening(false);
    r.onend   = () => setListening(false);
    recognitionRef.current = r;
  }, []);

  function toggleVoice() {
    if (!recognitionRef.current) { toast("Voice dictation not supported","info"); return; }
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else { recognitionRef.current.start(); setListening(true); }
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newText.trim(); if (!text) return;
    try {
      const res = await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"create", text, priority:newPriority, assignee:activePerson }) });
      const data = await res.json();
      if (data.ok) { setTodos(p => [data.todo, ...p]); setNewText(""); setNewPriority("normal"); toast("Added"); }
    } catch { toast("Failed to add","error"); }
  }

  async function toggleComplete(todo: Todo) {
    const nc = !todo.completed;
    try {
      await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"update", id:todo.id, fields:{ completed:nc } }) });
      setTodos(p => p.map(t => t.id===todo.id ? { ...t, completed:nc?1:0, completed_at:nc?new Date().toISOString():null } : t));
      // Only prompt follow-up when marking DONE (not un-doing), and only when tied to a client
      if (nc && todo.lead_id) {
        setFollowUpTodo(todo);
        setFollowUpType(null);
        setFollowUpText("");
        setFollowUpDue("");
        setFollowUpPriority("normal");
      }
    } catch { toast("Failed to update","error"); }
  }

  function pickFollowUpType(ft: FollowUpType) {
    setFollowUpType(ft);
    const name = followUpTodo?.lead_name?.trim() || "";
    setFollowUpText(name ? `${ft.prefix} ${name}` : ft.prefix + " ");
  }

  async function createFollowUp() {
    if (!followUpTodo || !followUpType || !followUpText.trim()) return;
    try {
      const res = await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"create", text:followUpText.trim(),
          priority:followUpPriority, due_date:followUpDue||null,
          lead_id:followUpTodo.lead_id, assignee:followUpTodo.assignee }) });
      const data = await res.json();
      if (data.ok) {
        setTodos(p => [data.todo, ...p]);
        toast(`Follow-up added: ${followUpType.icon} ${followUpType.label}`);
      }
    } catch { toast("Failed to add follow-up","error"); }
    setFollowUpTodo(null);
  }

  async function saveEdit(id: number) {
    const text = editText.trim(); if (!text) return;
    try {
      await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"update", id, fields:{ text } }) });
      setTodos(p => p.map(t => t.id===id ? { ...t, text } : t));
      setEditingId(null);
    } catch { toast("Failed to save","error"); }
  }

  async function deleteTodo(id: number) {
    try {
      await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"delete", id }) });
      setTodos(p => p.filter(t => t.id!==id));
      setSelected(p => { const n=new Set(p); n.delete(id); return n; });
      toast("Deleted");
    } catch { toast("Failed to delete","error"); }
  }

  async function deleteSelected() {
    if (selected.size===0) return;
    const ids = [...selected];
    try {
      await Promise.all(ids.map(id => fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"delete", id }) })));
      setTodos(p => p.filter(t => !ids.includes(t.id)));
      setSelected(new Set());
      setSelectMode(false);
      toast(`Deleted ${ids.length} item${ids.length!==1?"s":""}`);
    } catch { toast("Failed to delete","error"); }
  }

  async function clearCompleted() {
    try {
      await fetch("/api/todos", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"clear_completed", assignee:activePerson }) });
      setTodos(p => p.filter(t => !((t.assignee||"will")===activePerson && t.completed)));
      toast("Cleared completed");
    } catch { toast("Failed to clear","error"); }
  }

  function copyDraft(todo: Todo) {
    if (!todo.email_draft) return;
    navigator.clipboard.writeText(todo.email_draft).then(() => {
      setCopiedDraftId(todo.id);
      setTimeout(() => setCopiedDraftId(null), 2500);
      toast("Email draft copied — paste into Apple Mail");
    }, () => toast("Copy failed","error"));
  }

  // Selection helpers
  const personTodos = React.useMemo(() => todos.filter(t => (t.assignee||"will")===activePerson), [todos, activePerson]);
  const filtered = React.useMemo(() => {
    if (filter==="active")    return personTodos.filter(t => !t.completed);
    if (filter==="completed") return personTodos.filter(t =>  t.completed);
    return personTodos;
  }, [personTodos, filter]);

  function toggleSelect(id: number) { setSelected(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function selectAll()  { setSelected(new Set(filtered.map(t=>t.id))); }
  function selectNone() { setSelected(new Set()); }

  const activeCount    = personTodos.filter(t => !t.completed).length;
  const completedCount = personTodos.filter(t =>  t.completed).length;
  const willCount  = todos.filter(t => (t.assignee||"will")==="will"  && !t.completed).length;
  const paoloCount = todos.filter(t =>  t.assignee==="paolo"          && !t.completed).length;

  const today    = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const formatDate = (d: string|null) => {
    if (!d) return "No due date";
    if (d===today)    return "Today";
    if (d===tomorrow) return "Tomorrow";
    const date = new Date(d+"T12:00:00");
    const isPast = d < today;
    const label = date.toLocaleDateString("en-US",{ weekday:"short", month:"short", day:"numeric" });
    return isPast ? `Overdue — ${label}` : label;
  };

  // Switch person → clear selection
  function switchPerson(p: Person) { setActivePerson(p); setFilter("all"); setSelected(new Set()); setSelectMode(false); }

  return (
    <>
    <PageShell
      title="To Do"
      subtitle={`${activeCount} item${activeCount!==1?"s":""} remaining`}
      maxWidth="narrow"
      actions={
        completedCount>0 ? (
          <button onClick={clearCompleted} className="btn-ghost text-[var(--navy-300)] hover:text-[var(--coral-500)] text-sm">
            Clear {completedCount} done
          </button>
        ) : undefined
      }
    >
      {/* Person Tabs */}
      <div className="flex gap-2 mb-4">
        {([["will","Will",willCount],["paolo","Paolo",paoloCount]] as const).map(([key,label,count])=>(
          <button key={key} onClick={()=>switchPerson(key)} className={`tab-bar-item ${activePerson===key?"active":""}`}>
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Add Todo */}
      <form onSubmit={addTodo} className="card-elevated p-4 mb-4">
        <div className="flex gap-2 items-center mb-2">
          <input ref={inputRef} value={newText} onChange={e=>setNewText(e.target.value)}
            placeholder={listening?"Listening...": `Add a to do for ${activePerson==="will"?"Will":"Paolo"}...`}
            className="form-input flex-1 min-w-0" style={{fontSize:"16px",minHeight:"44px"}} />
        </div>
        <div className="flex gap-2 items-center">
          <button type="button" onClick={toggleVoice}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${listening?"bg-[var(--coral-500)] text-white animate-pulse":"bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-400)] hover:bg-[var(--sand-200)]"}`}
            title={listening?"Stop":"Voice"}>
            {listening?"⏹":"🎤"}
          </button>
          <select value={newPriority} onChange={e=>setNewPriority(e.target.value as "normal"|"high")}
            className="form-input shrink-0 w-auto px-2" style={{fontSize:"16px",minHeight:"44px"}}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <div className="flex-1" />
          <button type="submit" className="btn-primary shrink-0 px-5" style={{minHeight:"44px"}}>Add</button>
        </div>
        {listening && (
          <div className="mt-2 text-xs text-[var(--coral-500)] flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[var(--coral-500)] rounded-full animate-pulse" />
            Listening… speak your item
          </div>
        )}
      </form>

      {/* Filter tabs row — normal mode */}
      {!selectMode && (
        <div className="flex items-center gap-2 mb-4">
          <div className="tab-bar flex-1">
            {(["all","active","completed"] as Filter[]).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} className={`tab-bar-item capitalize ${filter===f?"active":""}`}>
                {f} {f==="all"?`(${personTodos.length})`:f==="active"?`(${activeCount})`:`(${completedCount})`}
              </button>
            ))}
          </div>
          {filtered.length > 0 && (
            <button
              onClick={() => { setSelectMode(true); selectNone(); }}
              className="shrink-0 text-xs font-medium text-[var(--navy-300)] hover:text-[var(--navy-600)] dark:hover:text-[var(--navy-100)] px-2 py-1 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* Selection toolbar — replaces filter row in select mode */}
      {selectMode && (
        <div className="flex items-center gap-2 mb-4 p-1 rounded-2xl bg-[var(--sand-100)] dark:bg-[var(--navy-800)]">
          {/* Cancel */}
          <button
            onClick={() => { setSelectMode(false); selectNone(); }}
            className="shrink-0 px-3 py-2 rounded-xl text-sm font-medium text-[var(--navy-500)] dark:text-[var(--navy-300)] hover:bg-white dark:hover:bg-[var(--navy-700)] transition-colors"
          >
            Cancel
          </button>

          <div className="flex-1" />

          {/* Select All toggle */}
          <button
            onClick={() => selected.size === filtered.length ? selectNone() : selectAll()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white dark:hover:bg-[var(--navy-700)]"
            style={{ color: selected.size === filtered.length ? "var(--sea-500)" : "var(--navy-400)" }}
          >
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-all ${selected.size === filtered.length ? "bg-[var(--sea-500)] border-[var(--sea-500)] text-white" : "border-current"}`}>
              {selected.size === filtered.length ? "✓" : ""}
            </span>
            {selected.size === filtered.length ? "All" : "Select All"}
          </button>

          {/* Count pill */}
          {selected.size > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--brass-400)] text-white">
              {selected.size}
            </span>
          )}

          {/* Delete */}
          <button
            onClick={deleteSelected}
            disabled={selected.size === 0}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              selected.size > 0
                ? "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                : "text-[var(--navy-300)] opacity-40 cursor-not-allowed"
            }`}
          >
            🗑 Delete{selected.size > 0 ? ` ${selected.size}` : ""}
          </button>
        </div>
      )}

      {/* Todo List */}
      {loading ? (
        <div className="text-center py-12 text-[var(--navy-400)] text-sm">Loading...</div>
      ) : filtered.length===0 ? (
        <div className="empty-state">
          <div className="text-4xl mb-2">🎉</div>
          <div className="empty-state-text">
            {filter==="all" ? `No items for ${activePerson==="will"?"Will":"Paolo"} yet.` : `No ${filter} items.`}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(todo => {
            const hasDraft = !!todo.email_draft;
            const isExpanded = expandedDraft === todo.id;
            const isSelected = selected.has(todo.id);
            const meta = hasDraft ? parseMatchMeta(todo) : null;

            // ── Checkbox (shared) ──────────────────────────────────
            const checkbox = selectMode ? (
              <button onClick={() => toggleSelect(todo.id)}
                className={`shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? "bg-[var(--brass-400)] border-[var(--brass-400)] text-white" : "border-[var(--sand-300)] dark:border-[var(--navy-600)]"}`}>
                {isSelected ? "✓" : ""}
              </button>
            ) : (
              <button onClick={() => toggleComplete(todo)}
                className={`shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center transition-all ${todo.completed ? "bg-[var(--sea-500)] border-[var(--sea-500)] text-white" : "border-[var(--sand-300)] dark:border-[var(--navy-600)] hover:border-[var(--sea-400)]"}`}>
                {todo.completed ? "✓" : ""}
              </button>
            );

            // ── Draft email panel (shared) ─────────────────────────
            const draftPanel = todo.email_draft && (
              <div className="rounded-xl overflow-hidden border border-[#bae6fd]" style={{ background: "#f0f9ff" }}>
                <div className="flex items-center justify-between px-4 py-2 bg-[#0e7490] text-white">
                  <span className="text-xs font-bold tracking-wide">✉️ Draft Email — Copy & Paste into Apple Mail</span>
                  <button onClick={() => copyDraft(todo)}
                    className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${copiedDraftId === todo.id ? "bg-green-500 text-white" : "bg-white text-[#0e7490] hover:bg-blue-50"}`}>
                    {copiedDraftId === todo.id ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <div className="px-4 py-3 text-xs text-[#0c4a6e] whitespace-pre-wrap font-mono leading-relaxed select-all">
                  {todo.email_draft.split("\n").map((line, i) => {
                    const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                      const before = line.slice(0, line.indexOf(urlMatch[1]));
                      const url = urlMatch[1];
                      return (
                        <div key={i}>{before}
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="underline text-[#0369a1] hover:text-[#0e7490] transition-colors break-all"
                            onClick={e => e.stopPropagation()}>{url}</a>
                        </div>
                      );
                    }
                    return <div key={i}>{line || "\u00A0"}</div>;
                  })}
                </div>
              </div>
            );

            // ══════════════════════════════════════════════════════
            // MATCH-STYLE CARD (todos with email draft)
            // ══════════════════════════════════════════════════════
            if (hasDraft && meta) {
              return (
                <div key={todo.id}
                  className={`rounded-xl overflow-hidden transition-shadow ${todo.completed ? "opacity-60" : ""} ${isSelected ? "ring-2 ring-[var(--brass-400)]" : ""}`}
                  style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: isExpanded ? "0 4px 24px rgba(10,17,40,0.13)" : "none" }}>

                  {/* ── Card Header ── */}
                  <div className="flex items-start gap-3 p-4">
                    {checkbox}

                    {/* Clickable summary area */}
                    <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedDraft(isExpanded ? null : todo.id)}>
                      {/* Name + status badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                          {todo.lead_name?.trim() || "Unknown"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                          New
                        </span>
                        {todo.priority === "high" && !todo.completed && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                            High Priority
                          </span>
                        )}
                      </div>
                      {/* Boat summary line */}
                      <p className="text-sm mt-1" style={{ color: "var(--navy-500)" }}>
                        {meta.boatTitle}
                        {meta.loa ? ` · ${meta.loa}` : ""}
                        {meta.price ? ` · ${meta.price}` : ""}
                        {meta.location ? ` · ${meta.location}` : ""}
                      </p>
                      {/* Reason + due date tags */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {meta.topReason && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>
                            ✓ {meta.topReason}
                          </span>
                        )}
                        {todo.due_date && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${todo.due_date < today && !todo.completed ? "bg-red-50 text-red-600" : ""}`}
                            style={!(todo.due_date < today && !todo.completed) ? { background: "var(--sand-100)", color: "var(--navy-500)" } : {}}>
                            📅 {formatDate(todo.due_date)}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Score-style badge (HIGH priority indicator) */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      {todo.priority === "high" && !todo.completed ? (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626", border: "2px solid rgba(239,68,68,0.3)" }}>
                          HIGH
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{ background: "rgba(16,185,129,0.08)", border: "2px solid rgba(16,185,129,0.2)" }}>
                          🚢
                        </div>
                      )}
                      <span className="text-[10px] font-semibold" style={{ color: todo.priority === "high" ? "#dc2626" : "#059669" }}>
                        {todo.priority === "high" ? "high" : "match"}
                      </span>
                    </div>
                  </div>

                  {/* ── Expanded Detail Panel ── */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0" style={{ borderTop: "1px solid var(--border)" }}>

                      {/* PROSPECT + VESSEL two-column */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Prospect</h4>
                          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{todo.lead_name?.trim() || "Unknown"}</p>
                          {todo.lead_email && <p className="text-xs" style={{ color: "var(--navy-500)" }}>{todo.lead_email}</p>}
                          {todo.lead_id && (
                            <Link href={`/clients/${todo.lead_id}`}
                              className="inline-flex items-center gap-1 text-xs mt-1"
                              style={{ color: "var(--brass-400)" }}>
                              View client profile <ExternalLink className="w-3 h-3" />
                            </Link>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Vessel</h4>
                          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{meta.boatTitle}</p>
                          {meta.price    && <p className="text-xs" style={{ color: "var(--navy-500)" }}>Price: {meta.price}</p>}
                          {meta.loa      && <p className="text-xs" style={{ color: "var(--navy-500)" }}>LOA: {meta.loa}</p>}
                          {meta.location && <p className="text-xs" style={{ color: "var(--navy-500)" }}>Location: {meta.location}</p>}
                          {meta.brokerage && <p className="text-xs" style={{ color: "var(--navy-500)" }}>Broker: {meta.brokerage}</p>}
                          {meta.listingUrl && (
                            <a href={meta.listingUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "var(--brass-400)" }}>
                              View Listing <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Match Reasoning */}
                      {meta.topReason && (
                        <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                          <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Match Reasoning</h4>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-1 rounded text-xs" style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>✓ {meta.topReason}</span>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                        {todo.lead_email && (
                          <a href={`mailto:${todo.lead_email}`}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 44 }}>
                            ✉️ Email
                          </a>
                        )}
                        {meta.denisonUrl && (
                          <a href={meta.denisonUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "rgba(180,142,60,0.1)", color: "var(--brass-400)", minHeight: 44 }}>
                            🏢 Search Denison
                          </a>
                        )}
                        {meta.ywUrl && (
                          <a href={meta.ywUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: "rgba(14,116,144,0.1)", color: "#0e7490", minHeight: 44 }}>
                            ⚓ Search YachtWorld
                          </a>
                        )}
                        <button onClick={() => deleteTodo(todo.id)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ml-auto"
                          style={{ background: "rgba(107,114,128,0.1)", color: "#6b7280", minHeight: 44 }}>
                          ✕ Dismiss
                        </button>
                      </div>

                      {/* Draft email */}
                      <div className="mt-3">{draftPanel}</div>
                    </div>
                  )}
                </div>
              );
            }

            // ══════════════════════════════════════════════════════
            // SIMPLE CARD (regular todos without a draft)
            // ══════════════════════════════════════════════════════
            return (
              <div key={todo.id}
                className={`group card-elevated transition-all ${todo.completed ? "opacity-60" : ""} ${todo.priority === "high" && !todo.completed ? "border-l-4 border-l-[var(--coral-500)]" : ""} ${isSelected ? "ring-2 ring-[var(--brass-400)] bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>

                <div className="flex items-start gap-3 p-4">
                  {checkbox}
                  <div className="flex-1 min-w-0">
                    {editingId === todo.id ? (
                      <div className="flex gap-2">
                        <input value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(todo.id); if (e.key === "Escape") setEditingId(null); }}
                          autoFocus className="form-input flex-1" />
                        <button onClick={() => saveEdit(todo.id)} className="btn-primary text-xs">Save</button>
                        <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div>
                        <p className={`text-sm ${todo.completed ? "line-through text-[var(--navy-300)]" : "text-[var(--navy-800)] dark:text-[var(--navy-100)]"}`}
                          onDoubleClick={() => { setEditingId(todo.id); setEditText(todo.text); }}>
                          {todo.text}
                        </p>
                        <div className="flex items-center flex-wrap gap-2 mt-1.5">
                          {todo.priority === "high" && !todo.completed && <span className="badge badge-withdrawn">HIGH</span>}
                          {todo.lead_id && (
                            <Link href={`/clients/${todo.lead_id}`} className="badge badge-contacted hover:opacity-80 transition-opacity">
                              {todo.lead_name?.trim() || todo.lead_email || "Lead"}
                            </Link>
                          )}
                          {todo.due_date && (
                            <span className={`badge ${todo.due_date < today && !todo.completed ? "badge-withdrawn font-bold" : "badge-sold"}`}>
                              {formatDate(todo.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {!selectMode && (
                    <div className="shrink-0 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(todo.id); setEditText(todo.text); }} className="btn-ghost text-xs" title="Edit">✏️</button>
                      <button onClick={() => deleteTodo(todo.id)} className="btn-ghost text-xs" title="Delete">🗑</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>

      {/* ── Follow-up Modal ── */}
      {followUpTodo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background:"rgba(10,17,40,0.6)", backdropFilter:"blur(4px)" }}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            style={{ background:"var(--card)", border:"1px solid var(--border)" }}>

            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{color:"var(--sea-500)"}}>
                    ✓ Done
                  </p>
                  <h3 className="text-base font-bold leading-snug" style={{color:"var(--navy-800) "}}>
                    Add a follow-up?
                  </h3>
                  {followUpTodo.lead_name && (
                    <p className="text-sm mt-0.5" style={{color:"var(--navy-400)"}}>
                      for {followUpTodo.lead_name.trim()}
                    </p>
                  )}
                </div>
                <button onClick={()=>setFollowUpTodo(null)}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors"
                  style={{color:"var(--navy-400)"}}>×</button>
              </div>
            </div>

            {/* Follow-up type picker */}
            <div className="px-5 pb-3">
              <div className="flex gap-2 flex-wrap">
                {FOLLOW_UPS.map(ft => (
                  <button key={ft.label} onClick={()=>pickFollowUpType(ft)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: followUpType?.label===ft.label ? "var(--sea-500)" : "var(--sand-100)",
                      color: followUpType?.label===ft.label ? "#fff" : "var(--navy-600)",
                    }}>
                    {ft.icon} {ft.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detail form — appears after picking type */}
            {followUpType && (
              <div className="px-5 pb-5 space-y-3">
                <input
                  value={followUpText}
                  onChange={e=>setFollowUpText(e.target.value)}
                  placeholder="Describe the follow-up..."
                  className="form-input w-full"
                  style={{fontSize:"16px", minHeight:"44px"}}
                  autoFocus
                />
                <div className="flex gap-2">
                  <input type="date" value={followUpDue} onChange={e=>setFollowUpDue(e.target.value)}
                    className="form-input flex-1 text-sm" style={{minHeight:"40px"}}
                    min={new Date().toISOString().slice(0,10)} />
                  <select value={followUpPriority} onChange={e=>setFollowUpPriority(e.target.value as "normal"|"high")}
                    className="form-input text-sm w-auto px-2" style={{minHeight:"40px"}}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={()=>setFollowUpTodo(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{background:"var(--sand-100)", color:"var(--navy-500)"}}>
                    Skip
                  </button>
                  <button onClick={createFollowUp}
                    disabled={!followUpText.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={{
                      background: followUpText.trim() ? "var(--sea-500)" : "var(--sand-200)",
                      color: followUpText.trim() ? "#fff" : "var(--navy-300)"
                    }}>
                    Add Follow-up
                  </button>
                </div>
              </div>
            )}

            {/* Skip-only footer when no type picked yet */}
            {!followUpType && (
              <div className="px-5 pb-5">
                <button onClick={()=>setFollowUpTodo(null)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{background:"var(--sand-100)", color:"var(--navy-500)"}}>
                  No thanks, skip
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
