"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "../components/ToastProvider";
import PageShell from "../components/PageShell";

type Todo = {
  id: number;
  text: string;
  completed: number;
  priority: string;
  lead_id: number | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  assignee: string;
  lead_name?: string;
  lead_email?: string;
};

type Filter = "all" | "active" | "completed";
type Person = "will" | "paolo";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Fetch todos
  const fetchTodos = React.useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      if (data.ok) setTodos(data.todos);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchTodos(); }, [fetchTodos]);

  // Auto-refresh every 30s (catches new lead todos)
  React.useEffect(() => {
    const interval = setInterval(fetchTodos, 30000);
    return () => clearInterval(interval);
  }, [fetchTodos]);

  // Voice dictation setup
  React.useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewText(prev => (prev ? prev + " " : "") + transcript);
      setListening(false);
      inputRef.current?.focus();
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  function toggleVoice() {
    if (!recognitionRef.current) {
      toast("Voice dictation not supported in this browser", "info");
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }

  // CRUD handlers
  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", text, priority: newPriority, assignee: activePerson }),
      });
      const data = await res.json();
      if (data.ok) {
        setTodos(prev => [data.todo, ...prev]);
        setNewText("");
        setNewPriority("normal");
        toast("Task added");
      }
    } catch { toast("Failed to add task", "error"); }
  }

  async function toggleComplete(todo: Todo) {
    const newCompleted = !todo.completed;
    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id: todo.id, fields: { completed: newCompleted } }),
      });
      setTodos(prev => prev.map(t =>
        t.id === todo.id ? { ...t, completed: newCompleted ? 1 : 0, completed_at: newCompleted ? new Date().toISOString() : null } : t
      ));
    } catch { toast("Failed to update task", "error"); }
  }

  async function saveEdit(id: number) {
    const text = editText.trim();
    if (!text) return;
    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id, fields: { text } }),
      });
      setTodos(prev => prev.map(t => t.id === id ? { ...t, text } : t));
      setEditingId(null);
    } catch { toast("Failed to save edit", "error"); }
  }

  async function deleteTodo(id: number) {
    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      setTodos(prev => prev.filter(t => t.id !== id));
      toast("Task deleted");
    } catch { toast("Failed to delete task", "error"); }
  }

  async function clearCompleted() {
    try {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_completed", assignee: activePerson }),
      });
      setTodos(prev => prev.filter(t => !((t.assignee || "will") === activePerson && t.completed)));
      toast("Completed tasks cleared");
    } catch { toast("Failed to clear tasks", "error"); }
  }

  // Filtering — scope by person first
  const personTodos = React.useMemo(() =>
    todos.filter(t => (t.assignee || "will") === activePerson),
    [todos, activePerson]
  );
  const filtered = React.useMemo(() => {
    if (filter === "active") return personTodos.filter(t => !t.completed);
    if (filter === "completed") return personTodos.filter(t => t.completed);
    return personTodos;
  }, [personTodos, filter]);

  const activeCount = personTodos.filter(t => !t.completed).length;
  const completedCount = personTodos.filter(t => t.completed).length;
  const willCount = todos.filter(t => (t.assignee || "will") === "will" && !t.completed).length;
  const paoloCount = todos.filter(t => t.assignee === "paolo" && !t.completed).length;

  // Group by date
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const formatDate = (d: string | null) => {
    if (!d) return "No due date";
    if (d === today) return "Today";
    if (d === tomorrow) return "Tomorrow";
    const date = new Date(d + "T12:00:00");
    const isPast = d < today;
    const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return isPast ? `Overdue — ${label}` : label;
  };

  return (
    <PageShell
      title="Tasks"
      subtitle={`${activeCount} task${activeCount !== 1 ? "s" : ""} remaining`}
      maxWidth="narrow"
      actions={completedCount > 0 ? (
        <button onClick={clearCompleted}
          className="btn-ghost text-[var(--navy-300)] hover:text-[var(--coral-500)]">
          Clear {completedCount} completed
        </button>
      ) : undefined}
    >

      {/* Person Tabs */}
      <div className="flex gap-2 mb-4">
        {([["will", "Will", willCount], ["paolo", "Paolo", paoloCount]] as const).map(([key, label, count]) => (
          <button key={key}
            onClick={() => { setActivePerson(key); setFilter("all"); }}
            className={`tab-bar-item ${activePerson === key ? "active" : ""}`}>
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Add Todo Form */}
      <form onSubmit={addTodo} className="card-elevated p-4 mb-4">
        <div className="flex gap-2 items-center mb-2">
          <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
            placeholder={listening ? "Listening..." : `Add a task for ${activePerson === "will" ? "Will" : "Paolo"}...`}
            className="form-input flex-1 min-w-0"
            style={{ fontSize: "16px", minHeight: "44px" }} />
        </div>
        <div className="flex gap-2 items-center">
          <button type="button" onClick={toggleVoice}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              listening
                ? "bg-[var(--coral-500)] text-white animate-pulse"
                : "bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-400)] hover:bg-[var(--sand-200)]"
            }`}
            title={listening ? "Stop dictation" : "Voice dictation"}>
            {listening ? "⏹" : "🎤"}
          </button>
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as "normal" | "high")}
            className="form-input shrink-0 w-auto px-2"
            style={{ fontSize: "16px", minHeight: "44px" }}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
          <div className="flex-1" />
          <button type="submit" className="btn-primary shrink-0 px-5" style={{ minHeight: "44px" }}>Add</button>
        </div>
        {listening && (
          <div className="mt-2 text-xs text-[var(--coral-500)] flex items-center gap-1.5">
            <span className="w-2 h-2 bg-[var(--coral-500)] rounded-full animate-pulse" />
            Listening... speak your task
          </div>
        )}
      </form>

      {/* Filter Tabs */}
      <div className="tab-bar mb-4">
        {(["all", "active", "completed"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`tab-bar-item capitalize ${filter === f ? "active" : ""}`}>
            {f} {f === "all" ? `(${personTodos.length})` : f === "active" ? `(${activeCount})` : `(${completedCount})`}
          </button>
        ))}
      </div>

      {/* Todo List */}
      {loading ? (
        <div className="text-center py-12 text-[var(--navy-400)] text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="text-4xl mb-2">🎉</div>
          <div className="empty-state-text">
            {filter === "all" ? `No tasks for ${activePerson === "will" ? "Will" : "Paolo"} yet. Add one above!` : `No ${filter} tasks.`}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(todo => (
            <div key={todo.id}
              className={`group card-elevated p-4 transition-all ${
                todo.completed ? "opacity-60" : ""
              } ${todo.priority === "high" && !todo.completed ? "border-l-4 border-l-[var(--coral-500)]" : ""}`}>
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button onClick={() => toggleComplete(todo)}
                  className={`shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center transition-all ${
                    todo.completed
                      ? "bg-[var(--sea-500)] border-[var(--sea-500)] text-white"
                      : "border-[var(--sand-300)] dark:border-[var(--navy-600)] hover:border-[var(--sea-400)]"
                  }`}>
                  {todo.completed ? "✓" : ""}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {editingId === todo.id ? (
                    <div className="flex gap-2">
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(todo.id); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                        className="form-input flex-1" />
                      <button onClick={() => saveEdit(todo.id)} className="btn-primary text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancel</button>
                    </div>
                  ) : (
                    <div>
                      <p className={`text-sm ${todo.completed ? "line-through text-[var(--navy-300)]" : "text-[var(--navy-800)] dark:text-[var(--navy-100)]"}`}
                        onDoubleClick={() => { setEditingId(todo.id); setEditText(todo.text); }}>
                        {todo.text}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {todo.priority === "high" && !todo.completed && (
                          <span className="badge badge-withdrawn">HIGH</span>
                        )}
                        {todo.lead_id && (
                          <Link href={`/clients/${todo.lead_id}`}
                            className="badge badge-contacted hover:opacity-80 transition-opacity">
                            {todo.lead_name?.trim() || todo.lead_email || "Lead"}
                          </Link>
                        )}
                        {todo.due_date && (
                          <span className={`badge ${
                            todo.due_date < today && !todo.completed ? "badge-withdrawn font-bold" : "badge-sold"
                          }`}>
                            {formatDate(todo.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(todo.id); setEditText(todo.text); }}
                    className="btn-ghost text-xs" title="Edit">
                    ✏️
                  </button>
                  <button onClick={() => deleteTodo(todo.id)}
                    className="btn-ghost text-xs" title="Delete">
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
