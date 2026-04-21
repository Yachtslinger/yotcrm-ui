"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "../components/ToastProvider";
import type { NoteCategory, NoteRecordParsed, FollowUpRecord } from "@/lib/notes/storage";

// ─── Category config ─────────────────────────────────────────────────────────

const ALL_CATEGORIES: NoteCategory[] = [
  "buyer_preference","seller_motivation","family","timeline",
  "budget","boat_history","hot_lead","objection","deal_blocker",
];

const CAT_CONFIG: Record<NoteCategory, { label: string; color: string; bg: string }> = {
  buyer_preference:  { label: "Buyer Pref",   color: "#2563eb", bg: "rgba(37,99,235,0.1)"  },
  seller_motivation: { label: "Seller",        color: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
  family:            { label: "Family",        color: "#e11d48", bg: "rgba(225,29,72,0.1)"  },
  timeline:          { label: "Timeline",      color: "#d97706", bg: "rgba(217,119,6,0.1)"  },
  budget:            { label: "Budget",        color: "#059669", bg: "rgba(5,150,105,0.1)"  },
  boat_history:      { label: "Boat History",  color: "#0891b2", bg: "rgba(8,145,178,0.1)"  },
  hot_lead:          { label: "🔥 Hot Lead",   color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  objection:         { label: "Objection",     color: "#ea580c", bg: "rgba(234,88,12,0.1)"  },
  deal_blocker:      { label: "⚠ Deal Block",  color: "#991b1b", bg: "rgba(153,27,27,0.1)"  },
  general:           { label: "Note",          color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function importanceDot(score: number) {
  if (score >= 75) return { color: "#dc2626", title: "High importance" };
  if (score >= 55) return { color: "#d97706", title: "Medium importance" };
  return { color: "#d1d5db", title: "Low importance" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDue(date: string | null, confidence: string): string {
  if (!date) return confidence === "suggested" ? "Date TBD" : "No date";
  const d = new Date(date + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function dueColor(date: string | null): string {
  if (!date) return "#6b7280";
  const d = new Date(date + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return "#dc2626";
  if (diff <= 1) return "#d97706";
  return "#059669";
}

// ─── Types ───────────────────────────────────────────────────────────────────

type NoteWithFollowUp = NoteRecordParsed & { followUp?: FollowUpRecord };
type Props = { leadId: number; createdBy?: string };

// ─── Main component ──────────────────────────────────────────────────────────

export default function ClientNotesPanel({ leadId, createdBy = "will" }: Props) {
  const { toast } = useToast();
  const [notes, setNotes]         = useState<NoteWithFollowUp[]>([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [listening, setListening] = useState(false);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [editingCatsId, setEditingCatsId] = useState<number | null>(null);
  const [editingDueId, setEditingDueId]   = useState<number | null>(null); // followup id
  const [editingDueVal, setEditingDueVal] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recogRef    = useRef<any>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?lead_id=${leadId}`);
      const d   = await res.json();
      if (d.ok) setNotes(d.notes || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setText(prev => prev + (prev && !prev.endsWith(" ") ? " " : "") + t);
      setListening(false);
      textareaRef.current?.focus();
    };
    r.onerror = () => setListening(false);
    r.onend   = () => setListening(false);
    recogRef.current = r;
  }, []);

  const toggleVoice = () => {
    if (!recogRef.current) { toast("Voice not supported in this browser", "info"); return; }
    if (listening) { recogRef.current.stop(); setListening(false); }
    else { recogRef.current.start(); setListening(true); }
  };

  // ── Save note ──────────────────────────────────────────────────────────────
  const saveNote = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, text: trimmed, created_by: createdBy }),
      });
      const data = await res.json();
      if (!data.ok) { toast("Failed to save note", "error"); return; }
      setNotes(prev => [{ ...data.note, followUp: data.followUp ?? undefined }, ...prev]);
      setText("");
      if (data.followUp) {
        const due = data.followUp.due_date
          ? ` · Due ${new Date(data.followUp.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : "";
        toast(`Follow-up created${due}`, "success");
      } else {
        toast("Note saved", "success");
      }
    } catch { toast("Failed to save note", "error"); }
    finally { setSaving(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); saveNote(); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteNote = async (noteId: number) => {
    if (!confirm("Delete this note?")) return;
    setDeletingId(noteId);
    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      const d   = await res.json();
      if (d.ok) setNotes(prev => prev.filter(n => n.id !== noteId));
      else toast("Failed to delete", "error");
    } catch { toast("Failed to delete", "error"); }
    finally { setDeletingId(null); }
  };

  // ── Follow-up complete / dismiss ───────────────────────────────────────────
  const updateFollowUp = async (noteId: number, followUpId: number, action: "complete" | "dismiss") => {
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, followup_id: followUpId }),
      });
      setNotes(prev => prev.map(n => n.id !== noteId ? n : { ...n, followUp: undefined }));
      toast(action === "complete" ? "Follow-up complete ✓" : "Follow-up dismissed", "success");
    } catch { toast("Failed to update", "error"); }
  };

  // ── Category override ──────────────────────────────────────────────────────
  const saveCategories = async (noteId: number, categories: NoteCategory[]) => {
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_categories", categories }),
      });
      setNotes(prev => prev.map(n => n.id !== noteId ? n : { ...n, categories }));
      setEditingCatsId(null);
      toast("Categories updated", "success");
    } catch { toast("Failed to save categories", "error"); }
  };

  const toggleCategory = (noteId: number, currentCats: NoteCategory[], cat: NoteCategory) => {
    const next = currentCats.includes(cat)
      ? currentCats.filter(c => c !== cat)
      : [...currentCats, cat];
    const final = next.length === 0 ? ["general" as NoteCategory] : next.filter(c => c !== "general");
    setNotes(prev => prev.map(n => n.id !== noteId ? n : { ...n, categories: final }));
  };

  // ── Due date override ──────────────────────────────────────────────────────
  const saveDueDate = async (noteId: number, followUpId: number, dueDate: string | null) => {
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_due_date", followup_id: followUpId, due_date: dueDate }),
      });
      setNotes(prev => prev.map(n => {
        if (n.id !== noteId || !n.followUp) return n;
        return { ...n, followUp: { ...n.followUp, due_date: dueDate, due_confidence: dueDate ? "explicit" : "none" } };
      }));
      setEditingDueId(null);
      toast("Due date updated", "success");
    } catch { toast("Failed to update due date", "error"); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Input area */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            📋 Client Notes
          </h2>
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              listening ? "bg-red-500 text-white animate-pulse"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
            style={{ minHeight: "36px" }}
          >
            {listening ? "⏹ Stop" : "🎤 Dictate"}
          </button>
        </div>

        {listening && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Listening… speak now
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a note — preferences, follow-ups, budget, timing, anything…&#10;Hint: include action words (call, send, follow up) to auto-create a task."
          className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-800 dark:text-gray-100 text-sm p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 leading-relaxed"
          style={{ minHeight: "100px", fontSize: "16px" }}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-gray-400">⌘ + Enter to save</p>
          <button onClick={saveNote} disabled={!text.trim() || saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors"
            style={{ minHeight: "36px" }}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading && <div className="text-sm text-gray-400 py-4 text-center">Loading notes…</div>}

      {!loading && notes.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No notes yet.</p>
          <p className="text-xs mt-1">Add the first note above — it will be categorized automatically.</p>
        </div>
      )}

      {!loading && notes.length > 0 && (
        <div className="space-y-3">
          {notes.map(note => {
            const dot        = importanceDot(note.importance);
            const isDeleting = deletingId === note.id;
            const isEditCats = editingCatsId === note.id;
            const visibleCats = note.categories.filter(c => c !== "general");

            return (
              <div key={note.id}
                className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 transition-opacity"
                style={{ opacity: isDeleting ? 0.4 : 1 }}
              >
                {/* ── Category row ── */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                      style={{ background: dot.color }} title={dot.title} />

                    {!isEditCats && (
                      <>
                        {visibleCats.map(cat => {
                          const cfg = CAT_CONFIG[cat] ?? CAT_CONFIG.general;
                          return (
                            <span key={cat}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ color: cfg.color, background: cfg.bg }}>
                              {cfg.label}
                            </span>
                          );
                        })}
                        {visibleCats.length === 0 && (
                          <span className="text-[10px] text-gray-400">uncategorized</span>
                        )}
                        <button
                          onClick={() => setEditingCatsId(note.id)}
                          className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
                          title="Edit categories">
                          ✏
                        </button>
                      </>
                    )}

                    {isEditCats && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {ALL_CATEGORIES.map(cat => {
                          const cfg = CAT_CONFIG[cat];
                          const active = note.categories.includes(cat);
                          return (
                            <button key={cat}
                              onClick={() => toggleCategory(note.id, note.categories, cat)}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all"
                              style={active
                                ? { color: cfg.color, background: cfg.bg, borderColor: cfg.color }
                                : { color: "#9ca3af", background: "transparent", borderColor: "#e5e7eb" }}>
                              {active ? `✓ ${cfg.label}` : cfg.label}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => saveCategories(note.id, note.categories)}
                          className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-600 text-white ml-1">
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingCatsId(null); fetchNotes(); }}
                          className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                          cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={() => deleteNote(note.id)} disabled={isDeleting}
                    className="text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                    title="Delete note">✕</button>
                </div>

                {/* ── Note text ── */}
                <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                  {note.raw_text}
                </p>

                {/* ── Follow-up chip ── */}
                {note.followUp && (() => {
                  const fu = note.followUp!;
                  const isEditDue = editingDueId === fu.id;
                  return (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {!isEditDue ? (
                        <button
                          onClick={() => {
                            setEditingDueId(fu.id);
                            setEditingDueVal(fu.due_date ?? "");
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-75"
                          style={{ color: dueColor(fu.due_date), background: dueColor(fu.due_date) + "18" }}
                          title="Click to change date">
                          📅 {formatDue(fu.due_date, fu.due_confidence)}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={editingDueVal}
                            onChange={e => setEditingDueVal(e.target.value)}
                            className="text-xs border border-gray-300 dark:border-neutral-600 rounded-lg px-2 py-1 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") saveDueDate(note.id, fu.id, editingDueVal || null);
                              if (e.key === "Escape") setEditingDueId(null);
                            }}
                          />
                          <button
                            onClick={() => saveDueDate(note.id, fu.id, editingDueVal || null)}
                            className="text-[10px] font-semibold px-2 py-1 rounded-md bg-blue-600 text-white">
                            Set
                          </button>
                          <button
                            onClick={() => saveDueDate(note.id, fu.id, null)}
                            className="text-[10px] text-gray-400 hover:text-red-400 transition-colors"
                            title="Clear date">
                            clear
                          </button>
                          <button
                            onClick={() => setEditingDueId(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                            cancel
                          </button>
                        </div>
                      )}

                      {!isEditDue && (
                        <>
                          <button onClick={() => updateFollowUp(note.id, fu.id, "complete")}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 transition-colors">
                            ✓ Done
                          </button>
                          <button onClick={() => updateFollowUp(note.id, fu.id, "dismiss")}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-neutral-800 text-gray-500 hover:bg-gray-200 transition-colors">
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ── Footer + Why? ── */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-400">{note.created_by}</span>
                  <span className="text-[10px] text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400">{timeAgo(note.created_at)}</span>
                  {note.intent === "action_required" && !note.followUp && (
                    <><span className="text-[10px] text-gray-300">·</span>
                    <span className="text-[10px] text-indigo-400">task created</span></>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                    className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors ml-auto">
                    {expandedId === note.id ? "▲ hide" : "why?"}
                  </button>
                </div>

                {/* ── Parse reason disclosure ── */}
                {expandedId === note.id && (() => {
                  let reason: Record<string, any> = {};
                  try { reason = JSON.parse((note as any).parse_reason || "{}"); } catch {}
                  return (
                    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 p-3 text-[11px] space-y-1.5">
                      <p className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">Parse reasoning</p>
                      {reason.intent && <div><span className="text-gray-400">Intent: </span><span className="text-gray-700 dark:text-gray-300">{reason.intent}</span></div>}
                      {reason.importance && <div><span className="text-gray-400">Score: </span><span className="text-gray-700 dark:text-gray-300">{reason.importance}</span></div>}
                      {reason.date && <div><span className="text-gray-400">Date: </span><span className="text-gray-700 dark:text-gray-300">{reason.date}</span></div>}
                      {reason.categories && Object.keys(reason.categories).length > 0 && (
                        <div>
                          <span className="text-gray-400">Categories:</span>
                          <ul className="mt-0.5 space-y-0.5 pl-2">
                            {Object.entries(reason.categories).map(([cat, why]) => (
                              <li key={cat} className="text-gray-700 dark:text-gray-300">
                                <span className="font-semibold">{cat}</span> — {why as string}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
