"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import PageShell from "../components/PageShell";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, X, Search,
  Filter, Clock, MapPin, User, Ship, Phone, Mail, MessageSquare,
  Check, Trash2, Download, Edit2, AlertTriangle, ChevronDown,
  RefreshCw, ExternalLink, Eye, Target, Flag,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

type CalEvent = {
  id: number; title: string; event_type: string;
  start_at: string; end_at: string; timezone: string;
  location: string; notes: string; checklist: string;
  reminder_rules: string; prospect_id: number | null;
  vessel_id: number | null; deal_id: number | null;
  assigned_users: string; status: string;
  outcome: string; feedback_notes: string;
  created_by: string; updated_by: string;
  created_at: string; updated_at: string;
  prospect_name?: string; prospect_email?: string;
  prospect_phone?: string; vessel_name?: string;
  sync_status?: string;
};

type Lookup = { id: number; name: string };

type Deal = {
  id: number; name: string; stage: string;
  prospect_id: number | null; vessel_id: number | null;
  asking_price: string; offer_price: string; broker: string;
  notes: string; stage_deadlines: string;
  prospect_name?: string; vessel_name?: string;
  created_at: string; updated_at: string;
};

type Milestone = {
  stage: string; label: string; deadline: string | null;
  event: CalEvent | null;
  status: "completed" | "upcoming" | "overdue" | "urgent" | "not_set";
  hoursUntil: number | null;
};

const MILESTONE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  completed: { bg: "rgba(16,185,129,0.12)", text: "#059669", border: "rgba(16,185,129,0.4)" },
  upcoming: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", border: "rgba(59,130,246,0.4)" },
  urgent: { bg: "rgba(245,158,11,0.15)", text: "#d97706", border: "rgba(245,158,11,0.5)" },
  overdue: { bg: "rgba(239,68,68,0.15)", text: "#dc2626", border: "rgba(239,68,68,0.5)" },
  not_set: { bg: "rgba(107,114,128,0.08)", text: "#6b7280", border: "rgba(107,114,128,0.3)" },
};

const EVENT_TYPES = [
  { value: "showing", label: "Showing", color: "#3b82f6" },
  { value: "broker_showing", label: "Broker Showing", color: "#6366f1" },
  { value: "owner_showing", label: "Owner Showing", color: "#8b5cf6" },
  { value: "survey", label: "Survey", color: "#f59e0b" },
  { value: "haul_out", label: "Haul-Out", color: "#ef4444" },
  { value: "sea_trial", label: "Sea Trial", color: "#06b6d4" },
  { value: "yard_visit", label: "Yard Visit", color: "#84cc16" },
  { value: "closing_milestone", label: "Closing", color: "#10b981" },
  { value: "client_call", label: "Client Call", color: "#f97316" },
  { value: "follow_up", label: "Follow-Up", color: "#ec4899" },
  { value: "boat_show", label: "Boat Show", color: "#14b8a6" },
  { value: "travel_block", label: "Travel Block", color: "#6b7280" },
];

function typeColor(t: string) {
  return EVENT_TYPES.find(e => e.value === t)?.color || "#6b7280";
}
function typeLabel(t: string) {
  return EVENT_TYPES.find(e => e.value === t)?.label || t;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function sameDay(a: string, b: string) { return a.substring(0, 10) === b.substring(0, 10); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
function startOfWeek(d: Date) { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); return s; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const weeks: Date[][] = [];
  let current = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current = addDays(current, 1);
    }
    weeks.push(week);
    if (current.getMonth() !== month && w >= 4) break;
  }
  return weeks;
}

const SYNC_LABELS: Record<string, { label: string; color: string }> = {
  not_pushed: { label: "Not synced", color: "#6b7280" },
  pushed: { label: "Synced", color: "#10b981" },
  updated_locally: { label: "Needs sync", color: "#f59e0b" },
  conflict: { label: "Conflict", color: "#ef4444" },
};

// ═══ MAIN COMPONENT ═══════════════════════════════════

type ViewMode = "month" | "week" | "day" | "agenda" | "deal";

const EMPTY_EVENT = {
  title: "", event_type: "showing", start_at: "", end_at: "",
  timezone: "America/New_York", location: "", notes: "",
  checklist: "[]", reminder_rules: '["24h","2h"]',
  prospect_id: null as number | null, vessel_id: null as number | null,
  deal_id: null as number | null, assigned_users: ["will", "paolo"],
  status: "scheduled", outcome: "", feedback_notes: "", actor: "will",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("month");
  const [curDate, setCurDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_EVENT });
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<CalEvent[]>([]);

  // Lookups
  const [prospects, setProspects] = useState<Lookup[]>([]);
  const [vessels, setVessels] = useState<Lookup[]>([]);

  // Deal timeline
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [dealEvents, setDealEvents] = useState<CalEvent[]>([]);
  const [dealLoading, setDealLoading] = useState(false);

  // Subscription / sync
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [bulkPushing, setBulkPushing] = useState(false);

  // Audit log
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<{ id: number; message: string; type: "warning" | "success" | "error" }[]>([]);

  // Quick Add
  const [quickText, setQuickText] = useState("");
  const [quickParsing, setQuickParsing] = useState(false);
  const [quickResult, setQuickResult] = useState<any>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Fetch range based on view
  const fetchRange = useMemo(() => {
    if (view === "month") {
      const s = startOfMonth(curDate);
      const e = endOfMonth(curDate);
      return { startDate: addDays(startOfWeek(s), 0).toISOString(), endDate: addDays(e, 7).toISOString() };
    }
    if (view === "week") {
      const s = startOfWeek(curDate);
      return { startDate: s.toISOString(), endDate: addDays(s, 7).toISOString() };
    }
    if (view === "day") {
      const s = new Date(curDate); s.setHours(0, 0, 0, 0);
      const e = new Date(curDate); e.setHours(23, 59, 59, 999);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    }
    // agenda: next 30 days
    const s = new Date(); s.setHours(0, 0, 0, 0);
    return { startDate: s.toISOString(), endDate: addDays(s, 30).toISOString() };
  }, [view, curDate]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("startDate", fetchRange.startDate);
      params.set("endDate", fetchRange.endDate);
      if (userFilter) params.set("user", userFilter);
      if (typeFilter) params.set("eventType", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/calendar?${params}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fetchRange, userFilter, typeFilter, search]);

  const fetchLookups = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar?lookups=1");
      const data = await res.json();
      setProspects(data.prospects || []);
      setVessels(data.vessels || []);
      setDeals(data.deals || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchDealTimeline = useCallback(async (dealId: number) => {
    setDealLoading(true);
    try {
      const res = await fetch(`/api/calendar?timeline=${dealId}`);
      const data = await res.json();
      if (data.ok) {
        setMilestones(data.milestones || []);
        setDealEvents(data.events || []);
      }
    } catch (e) { console.error(e); }
    setDealLoading(false);
  }, []);

  // Bulk push — downloads ICS + marks all visible events as pushed
  const handleBulkPush = async () => {
    if (events.length === 0) return;
    setBulkPushing(true);
    try {
      // Download bulk ICS
      const a = document.createElement("a");
      a.href = `/api/calendar?bulk_ics_start=${fetchRange.startDate}&bulk_ics_end=${fetchRange.endDate}`;
      a.download = "yotcrm-calendar.ics";
      a.click();
      // Mark all as pushed
      const ids = events.map(e => e.id);
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_push", eventIds: ids }),
      });
      addToast(`${ids.length} events pushed to Apple Calendar`, "success");
      fetchEvents();
    } catch (e) { console.error(e); }
    setBulkPushing(false);
  };

  // Push single event — download ICS + mark pushed
  const handlePushEvent = async (eventId: number) => {
    const a = document.createElement("a");
    a.href = `/api/calendar?ics=${eventId}`;
    a.download = `yotcrm-event-${eventId}.ics`;
    a.click();
    await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_pushed", id: eventId }),
    });
    addToast("Event pushed to Apple Calendar", "success");
    fetchEvents();
  };

  const feedUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/calendar/feed`
    : "/api/calendar/feed";

  const addToast = (message: string, type: "warning" | "success" | "error" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const fetchAuditLog = async (eventId: number) => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/calendar?audit=${eventId}`);
      const data = await res.json();
      setAuditLog(data.log || []);
    } catch (e) { console.error(e); }
    setAuditLoading(false);
  };

  // Quick Add — parse text and pre-fill event drawer
  const handleQuickParse = async () => {
    if (!quickText.trim()) return;
    setQuickParsing(true);
    try {
      const res = await fetch("/api/calendar/quickadd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText }),
      });
      const data = await res.json();
      if (data.ok) {
        setQuickResult(data);
      } else {
        addToast("Could not parse text", "error");
      }
    } catch (e) { console.error(e); addToast("Parse failed", "error"); }
    setQuickParsing(false);
  };

  const handleQuickConfirm = () => {
    if (!quickResult?.parsed) return;
    const p = quickResult.parsed;
    setForm({
      ...EMPTY_EVENT,
      title: p.title,
      event_type: p.event_type,
      start_at: p.start_at.slice(0, 16),
      end_at: p.end_at.slice(0, 16),
      location: p.location || "",
      notes: `Quick-added from: "${p.raw}"`,
      prospect_id: quickResult.prospect_id || null,
      vessel_id: quickResult.vessel_id || null,
      deal_id: null,
      assigned_users: ["will", "paolo"],
      status: "scheduled",
      outcome: "",
      feedback_notes: "",
      actor: "will",
    });
    setEditId(null);
    setConflicts([]);
    setAuditLog([]);
    setShowAudit(false);
    setDrawerOpen(true);
    setQuickResult(null);
    setQuickText("");
    setShowQuickAdd(false);
    addToast("Event pre-filled — review & save", "success");
  };

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchLookups(); }, [fetchLookups]);
  useEffect(() => { if (selectedDealId) fetchDealTimeline(selectedDealId); }, [selectedDealId, fetchDealTimeline]);

  // Navigation
  const navigate = (dir: number) => {
    setCurDate(prev => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const headerLabel = useMemo(() => {
    if (view === "month") return curDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(curDate);
      const e = addDays(s, 6);
      return `${fmtDate(s.toISOString())} – ${fmtDate(e.toISOString())}`;
    }
    if (view === "day") return curDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return "Upcoming Events";
  }, [view, curDate]);

  // Open new event
  const openNew = (date?: Date) => {
    const d = date || new Date();
    const start = new Date(d); start.setHours(10, 0, 0, 0);
    const end = new Date(d); end.setHours(11, 0, 0, 0);
    setForm({
      ...EMPTY_EVENT,
      start_at: start.toISOString().slice(0, 16),
      end_at: end.toISOString().slice(0, 16),
    });
    setEditId(null);
    setConflicts([]);
    setDrawerOpen(true);
  };

  // Open edit
  const openEdit = (evt: CalEvent) => {
    setForm({
      title: evt.title, event_type: evt.event_type,
      start_at: evt.start_at.slice(0, 16), end_at: evt.end_at.slice(0, 16),
      timezone: evt.timezone, location: evt.location, notes: evt.notes,
      checklist: evt.checklist, reminder_rules: evt.reminder_rules,
      prospect_id: evt.prospect_id, vessel_id: evt.vessel_id,
      deal_id: evt.deal_id,
      assigned_users: (() => { try { return JSON.parse(evt.assigned_users); } catch { return ["will", "paolo"]; } })(),
      status: evt.status, outcome: evt.outcome,
      feedback_notes: evt.feedback_notes, actor: "will",
    });
    setEditId(evt.id);
    setConflicts([]);
    setAuditLog([]);
    setShowAudit(false);
    setDrawerOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!form.title || !form.start_at || !form.end_at) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        action: editId ? "update" : "create",
        id: editId || undefined,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
      };
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setConflicts(data.conflicts || []);
        if ((data.conflicts || []).length > 0) {
          addToast(`⚠️ Time conflict with ${data.conflicts.length} event(s) — saved anyway`, "warning");
        } else {
          addToast(editId ? "Event updated" : "Event created", "success");
        }
        if ((data.conflicts || []).length === 0) {
          setDrawerOpen(false);
        }
        fetchEvents();
      } else {
        addToast(data.error || "Failed to save", "error");
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // Delete
  const handleDelete = async () => {
    if (!editId || !confirm("Delete this event?")) return;
    try {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: editId, actor: "will" }),
      });
      setDrawerOpen(false);
      addToast("Event deleted", "success");
      fetchEvents();
    } catch (e) { console.error(e); }
  };

  // Events grouped by day for month grid
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const key = e.start_at.substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const todayStr = isoDate(new Date());

  // Week view hours
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am-8pm

  // ═══ RENDER ══════════════════════════════════════════

  return (
    <PageShell
      title="Calendar"
      maxWidth="wide"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSubscribe(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(16,185,129,0.1)", color: "#059669", minHeight: 44, border: "1px solid rgba(16,185,129,0.3)" }}>
            <RefreshCw className="w-3.5 h-3.5" /> Subscribe
          </button>
          <button onClick={handleBulkPush} disabled={bulkPushing || events.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 44, border: "1px solid rgba(59,130,246,0.3)", opacity: bulkPushing || events.length === 0 ? 0.5 : 1 }}>
            <Download className="w-3.5 h-3.5" /> {bulkPushing ? "Pushing..." : "Bulk Push"}
          </button>
          <button onClick={() => openNew()} className="btn btn-primary flex items-center gap-2" style={{ minHeight: 44 }}>
            <Plus className="w-4 h-4" /> New Event
          </button>
        </div>
      }
    >
      {/* ── Controls Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Nav arrows + label */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", minHeight: 44, minWidth: 44 }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurDate(new Date())} className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--card)", border: "1px solid var(--border)", minHeight: 44 }}>
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", minHeight: 44, minWidth: 44 }}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold ml-2" style={{ color: "var(--foreground)" }}>{headerLabel}</h2>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* View toggles */}
          {(["month", "week", "day", "agenda", "deal"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize"
              style={{
                background: view === v ? "var(--brass-400)" : "var(--card)",
                color: view === v ? "#fff" : "var(--navy-600)",
                border: `1px solid ${view === v ? "var(--brass-400)" : "var(--border)"}`,
                minHeight: 44,
              }}>
              {v === "deal" ? "Deals" : v}
            </button>
          ))}

          {/* User filter */}
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
            className="form-input text-xs" style={{ fontSize: 16, minHeight: 44, minWidth: 100 }}>
            <option value="">All Users</option>
            <option value="will">Will</option>
            <option value="paolo">Paolo</option>
          </select>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="form-input text-xs" style={{ fontSize: 16, minHeight: 44, minWidth: 120 }}>
            <option value="">All Types</option>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--navy-400)" }} />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="form-input pl-7 text-xs" style={{ fontSize: 16, minHeight: 44, width: 150 }} />
          </div>
        </div>
      </div>

      {/* ════════════ QUICK ADD BAR ════════════ */}
      <div className="mb-4">
        {!showQuickAdd ? (
          <button onClick={() => setShowQuickAdd(true)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors"
            style={{ background: "var(--card)", border: "1px dashed var(--border)", color: "var(--navy-400)" }}>
            <MessageSquare className="w-4 h-4" />
            <span>Paste a text or message to quick-add an event...</span>
          </button>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--brass-400)" }}>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4" style={{ color: "var(--brass-400)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--brass-400)" }}>Quick Add from Text</span>
                <button onClick={() => { setShowQuickAdd(false); setQuickResult(null); setQuickText(""); }}
                  className="ml-auto p-1 rounded" style={{ color: "var(--navy-400)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={quickText}
                  onChange={e => { setQuickText(e.target.value); setQuickResult(null); }}
                  placeholder={'Paste a message like:\n"Survey Monday at 9am at LMC for the 72 Viking"'}
                  rows={2}
                  className="form-input flex-1 resize-none"
                  style={{ fontSize: 16, minHeight: 60 }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuickParse(); } }}
                />
                <button onClick={handleQuickParse}
                  disabled={quickParsing || !quickText.trim()}
                  className="self-end px-4 py-2 rounded-lg text-sm font-semibold shrink-0"
                  style={{ background: "var(--brass-400)", color: "#fff", minHeight: 44, opacity: quickParsing || !quickText.trim() ? 0.5 : 1 }}>
                  {quickParsing ? "..." : "Parse"}
                </button>
              </div>
            </div>

            {/* Parse result preview */}
            {quickResult?.parsed && (
              <div className="px-3 pb-3">
                <div className="rounded-lg p-3 mt-1" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: "#059669" }}>
                      ✓ Parsed — {Math.round(quickResult.parsed.confidence * 100)}% confidence
                    </span>
                    <button onClick={handleQuickConfirm}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: "#059669", color: "#fff", minHeight: 36 }}>
                      Confirm & Edit →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: "var(--navy-600)" }}>
                    <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Type:</span> {quickResult.parsed.event_type.replace(/_/g, " ")}</div>
                    <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Title:</span> {quickResult.parsed.title}</div>
                    <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Date:</span> {new Date(quickResult.parsed.start_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Time:</span> {fmtTime(quickResult.parsed.start_at)} – {fmtTime(quickResult.parsed.end_at)}</div>
                    {quickResult.parsed.location && <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Location:</span> {quickResult.parsed.location}</div>}
                    {quickResult.parsed.vessel_hint && <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Vessel:</span> {quickResult.parsed.vessel_hint}{quickResult.vessel_id ? " ✓" : ""}</div>}
                    {quickResult.prospect_id && <div><span className="font-medium" style={{ color: "var(--navy-400)" }}>Prospect:</span> Matched ✓</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════ MONTH VIEW ════════════ */}
      {view === "month" && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          {/* Day headers */}
          <div className="grid grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold"
                style={{ color: "var(--navy-400)", borderBottom: "1px solid var(--border)" }}>
                {d}
              </div>
            ))}
          </div>
          {/* Weeks */}
          {getMonthGrid(curDate.getFullYear(), curDate.getMonth()).map((week, wi) => (
            <div key={wi} className="grid grid-cols-7" style={{ minHeight: 90 }}>
              {week.map((day, di) => {
                const dayStr = isoDate(day);
                const isToday = dayStr === todayStr;
                const isCurrentMonth = day.getMonth() === curDate.getMonth();
                const dayEvents = eventsByDay.get(dayStr) || [];
                return (
                  <div key={di}
                    onClick={() => openNew(day)}
                    className="p-1 cursor-pointer transition-colors hover:bg-[rgba(201,165,92,0.04)]"
                    style={{
                      borderRight: di < 6 ? "1px solid var(--border)" : "none",
                      borderBottom: "1px solid var(--border)",
                      opacity: isCurrentMonth ? 1 : 0.4,
                    }}>
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "text-white" : ""}`}
                      style={{ background: isToday ? "var(--brass-400)" : "transparent", color: isToday ? "#fff" : "var(--navy-600)" }}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(evt => (
                        <button key={evt.id}
                          onClick={e => { e.stopPropagation(); openEdit(evt); }}
                          className="w-full text-left px-1 py-0.5 rounded text-[10px] font-medium truncate"
                          style={{ background: typeColor(evt.event_type) + "18", color: typeColor(evt.event_type) }}>
                          {fmtTime(evt.start_at)} {evt.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] px-1" style={{ color: "var(--navy-400)" }}>+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ════════════ WEEK VIEW ════════════ */}
      {view === "week" && (() => {
        const weekStart = startOfWeek(curDate);
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        return (
          <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            {/* Day headers */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] sticky top-0" style={{ background: "var(--card)", zIndex: 2 }}>
              <div style={{ borderBottom: "1px solid var(--border)" }} />
              {days.map((d, i) => {
                const isToday = isoDate(d) === todayStr;
                return (
                  <div key={i} className="px-1 py-2 text-center" style={{ borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>
                    <div className="text-[10px] font-semibold" style={{ color: "var(--navy-400)" }}>
                      {d.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "text-white" : ""}`}
                      style={{ background: isToday ? "var(--brass-400)" : "transparent", color: isToday ? "#fff" : "var(--foreground)" }}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Hour rows */}
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ minHeight: 52 }}>
                <div className="px-2 py-1 text-[10px] text-right font-medium" style={{ color: "var(--navy-400)", borderRight: "1px solid var(--border)" }}>
                  {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "p" : "a"}
                </div>
                {days.map((d, di) => {
                  const dayStr = isoDate(d);
                  const hourEvents = events.filter(e => {
                    const h = new Date(e.start_at).getHours();
                    return e.start_at.substring(0, 10) === dayStr && h === hour;
                  });
                  return (
                    <div key={di} className="relative p-0.5 cursor-pointer hover:bg-[rgba(201,165,92,0.04)]"
                      onClick={() => { const nd = new Date(d); nd.setHours(hour); openNew(nd); }}
                      style={{ borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                      {hourEvents.map(evt => (
                        <button key={evt.id} onClick={e => { e.stopPropagation(); openEdit(evt); }}
                          className="w-full text-left px-1 py-0.5 rounded text-[9px] font-medium truncate mb-0.5"
                          style={{ background: typeColor(evt.event_type) + "20", color: typeColor(evt.event_type) }}>
                          {evt.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ════════════ DAY VIEW ════════════ */}
      {view === "day" && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          {HOURS.map(hour => {
            const hourEvents = events.filter(e => {
              const h = new Date(e.start_at).getHours();
              return e.start_at.substring(0, 10) === isoDate(curDate) && h === hour;
            });
            return (
              <div key={hour} className="flex" style={{ minHeight: 56, borderBottom: "1px solid var(--border)" }}>
                <div className="w-16 px-2 py-2 text-xs text-right font-medium shrink-0" style={{ color: "var(--navy-400)", borderRight: "1px solid var(--border)" }}>
                  {hour > 12 ? hour - 12 : hour}:00 {hour >= 12 ? "PM" : "AM"}
                </div>
                <div className="flex-1 p-1 cursor-pointer hover:bg-[rgba(201,165,92,0.04)]"
                  onClick={() => { const nd = new Date(curDate); nd.setHours(hour); openNew(nd); }}>
                  {hourEvents.map(evt => (
                    <button key={evt.id} onClick={e => { e.stopPropagation(); openEdit(evt); }}
                      className="w-full text-left px-3 py-2 rounded-lg mb-1 text-sm font-medium"
                      style={{ background: typeColor(evt.event_type) + "15", color: typeColor(evt.event_type), border: `1px solid ${typeColor(evt.event_type)}30` }}>
                      <div className="font-semibold">{evt.title}</div>
                      <div className="text-xs opacity-80">{fmtTime(evt.start_at)} – {fmtTime(evt.end_at)}{evt.location ? ` · ${evt.location}` : ""}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ AGENDA VIEW ════════════ */}
      {view === "agenda" && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <CalendarDays className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
              <p className="text-sm" style={{ color: "var(--navy-500)" }}>No upcoming events</p>
            </div>
          ) : events.map(evt => {
            const color = typeColor(evt.event_type);
            const sync = SYNC_LABELS[evt.sync_status || "not_pushed"];
            return (
              <div key={evt.id}
                onClick={() => openEdit(evt)}
                className="flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-colors hover:shadow-md"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{evt.title}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: color + "18", color }}>{typeLabel(evt.event_type)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: sync.color + "18", color: sync.color }}>{sync.label}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--navy-500)" }}>
                    {fmtFull(evt.start_at)} – {fmtTime(evt.end_at)}
                    {evt.location ? ` · ${evt.location}` : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: "var(--navy-400)" }}>
                    {evt.prospect_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{evt.prospect_name}</span>}
                    {evt.vessel_name && evt.vessel_name.trim() && <span className="flex items-center gap-1"><Ship className="w-3 h-3" />{evt.vessel_name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ DEAL TIMELINE VIEW ════════════ */}
      {view === "deal" && (
        <div>
          {/* Deal selector */}
          <div className="flex items-center gap-3 mb-4">
            <select
              value={selectedDealId ?? ""}
              onChange={e => setSelectedDealId(e.target.value ? Number(e.target.value) : null)}
              className="form-input flex-1" style={{ fontSize: 16, minHeight: 44 }}
            >
              <option value="">Select a deal...</option>
              {deals.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.vessel_name ? ` — ${d.vessel_name.trim()}` : ""}{d.prospect_name ? ` (${d.prospect_name.trim()})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const name = prompt("Deal name:");
                if (!name) return;
                fetch("/api/calendar", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "create_deal", name }),
                }).then(r => r.json()).then(d => {
                  if (d.ok) { fetchLookups(); setSelectedDealId(d.deal.id); }
                });
              }}
              className="btn btn-primary flex items-center gap-1.5"
              style={{ minHeight: 44 }}
            >
              <Plus className="w-4 h-4" /> New Deal
            </button>
          </div>

          {!selectedDealId ? (
            <div className="text-center py-16 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <Target className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--navy-500)" }}>Select a deal to view its timeline</p>
              <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>Or create a new one to start tracking milestones</p>
            </div>
          ) : dealLoading ? (
            <div className="text-center py-12" style={{ color: "var(--navy-400)" }}>
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading timeline...
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {/* Timeline header */}
              <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold" style={{ color: "var(--foreground)" }}>
                      {deals.find(d => d.id === selectedDealId)?.name}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>
                      {milestones.filter(m => m.status === "completed").length} of {milestones.length} milestones complete
                      {milestones.some(m => m.status === "overdue") && (
                        <span style={{ color: "#dc2626" }}> · ⚠ Has overdue items</span>
                      )}
                    </p>
                  </div>
                  {/* Progress bar */}
                  <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: "var(--sand-100)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((milestones.filter(m => m.status === "completed").length / Math.max(milestones.length, 1)) * 100)}%`,
                        background: "var(--brass-400)",
                      }} />
                  </div>
                </div>
              </div>

              {/* Milestone list */}
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[23px] top-0 bottom-0 w-0.5" style={{ background: "var(--border)" }} />

                {milestones.map((m, i) => {
                  const mc = MILESTONE_COLORS[m.status];
                  return (
                    <div key={m.stage} className="relative flex items-start gap-4 px-4 py-3"
                      style={{ borderBottom: i < milestones.length - 1 ? "1px solid var(--border)" : "none" }}>
                      {/* Dot */}
                      <div className="relative z-10 w-[14px] h-[14px] rounded-full shrink-0 mt-1"
                        style={{ background: mc.bg, border: `2px solid ${mc.border}` }}>
                        {m.status === "completed" && (
                          <Check className="w-2.5 h-2.5 absolute top-[1px] left-[1px]" style={{ color: mc.text }} />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: mc.text }}>{m.label}</span>
                          {m.status === "overdue" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse"
                              style={{ background: "rgba(239,68,68,0.15)", color: "#dc2626" }}>
                              OVERDUE
                            </span>
                          )}
                          {m.status === "urgent" && m.hoursUntil !== null && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: "rgba(245,158,11,0.15)", color: "#d97706" }}>
                              {m.hoursUntil}h left
                            </span>
                          )}
                          {m.status === "completed" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                              Done
                            </span>
                          )}
                        </div>

                        {/* Deadline */}
                        {m.deadline && (
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--navy-400)" }}>
                            Deadline: {fmtFull(m.deadline)}
                            {m.hoursUntil !== null && m.status !== "completed" && (
                              <span style={{ color: m.hoursUntil <= 48 ? "#d97706" : "var(--navy-400)" }}>
                                {" "}({m.hoursUntil > 0 ? `${m.hoursUntil}h remaining` : `${Math.abs(m.hoursUntil)}h overdue`})
                              </span>
                            )}
                          </p>
                        )}

                        {/* Linked event */}
                        {m.event && (
                          <button onClick={() => openEdit(m.event!)}
                            className="text-[11px] mt-1 flex items-center gap-1 underline"
                            style={{ color: "var(--brass-400)" }}>
                            <CalendarDays className="w-3 h-3" /> {m.event.title} — {fmtDate(m.event.start_at)}
                          </button>
                        )}
                      </div>

                      {/* Quick action: create event for this milestone */}
                      {!m.event && m.status !== "completed" && (
                        <button
                          onClick={() => {
                            const d = m.deadline ? new Date(m.deadline) : new Date();
                            d.setHours(10, 0, 0, 0);
                            const end = new Date(d); end.setHours(11, 0, 0, 0);
                            setForm({
                              ...EMPTY_EVENT,
                              title: `${m.label} — ${deals.find(x => x.id === selectedDealId)?.name || "Deal"}`,
                              event_type: "closing_milestone",
                              start_at: d.toISOString().slice(0, 16),
                              end_at: end.toISOString().slice(0, 16),
                              notes: m.stage,
                              deal_id: selectedDealId,
                            });
                            setEditId(null);
                            setConflicts([]);
                            setDrawerOpen(true);
                          }}
                          className="shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                          style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 36 }}
                        >
                          + Event
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Deal events list */}
              {dealEvents.length > 0 && (
                <div className="p-4" style={{ borderTop: "2px solid var(--border)" }}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>
                    All Events for This Deal ({dealEvents.length})
                  </h4>
                  <div className="space-y-1.5">
                    {dealEvents.map(evt => (
                      <button key={evt.id} onClick={() => openEdit(evt)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                        style={{ background: typeColor(evt.event_type) + "08" }}>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor(evt.event_type) }} />
                        <span className="text-xs font-medium truncate" style={{ color: "var(--foreground)" }}>{evt.title}</span>
                        <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--navy-400)" }}>{fmtDate(evt.start_at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════ EVENT DRAWER ════════════ */}
      {drawerOpen && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[440px] overflow-y-auto"
            style={{ background: "var(--background)" }}>
            {/* Drawer header */}
            <div className="sticky top-0 flex items-center justify-between p-4"
              style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", zIndex: 2 }}>
              <h3 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
                {editId ? "Edit Event" : "New Event"}
              </h3>
              <div className="flex items-center gap-2">
                {editId && (
                  <>
                    {/* Sync status badge */}
                    {(() => {
                      const evt = events.find(e => e.id === editId);
                      const ss = evt?.sync_status || "not_pushed";
                      const sl = SYNC_LABELS[ss];
                      return (
                        <span className="px-2 py-1 rounded-full text-[10px] font-bold"
                          style={{ background: sl.color + "18", color: sl.color }}>
                          {sl.label}
                        </span>
                      );
                    })()}
                    <button onClick={() => handlePushEvent(editId)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 36 }}>
                      <Download className="w-3.5 h-3.5" /> Push to Calendar
                    </button>
                    <button onClick={handleDelete}
                      className="p-2 rounded-lg" style={{ color: "#ef4444", minHeight: 36 }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg" style={{ color: "var(--navy-400)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conflict warning */}
            {conflicts.length > 0 && (
              <div className="mx-4 mt-3 p-3 rounded-lg flex items-start gap-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#d97706" }}>Time conflict detected</p>
                  {conflicts.map(c => (
                    <p key={c.id} className="text-[11px] mt-0.5" style={{ color: "#92400e" }}>
                      {c.title} ({fmtTime(c.start_at)}–{fmtTime(c.end_at)})
                    </p>
                  ))}
                  <p className="text-[10px] mt-1" style={{ color: "#92400e" }}>Event was saved. Override logged.</p>
                </div>
              </div>
            )}

            {/* Drawer body */}
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Title</label>
                <input type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Showing — 72' Viking"
                  className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} />
              </div>

              {/* Type + Status row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Type</label>
                  <select value={form.event_type}
                    onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }}>
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Status</label>
                  <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }}>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>
              </div>

              {/* Start / End */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Start</label>
                  <input type="datetime-local" value={form.start_at}
                    onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} />
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>End</label>
                  <input type="datetime-local" value={form.end_at}
                    onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Location</label>
                <input type="text" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Marina, dock, address..."
                  className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} />
              </div>

              {/* Prospect + Vessel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Prospect</label>
                  <select value={form.prospect_id ?? ""}
                    onChange={e => setForm(f => ({ ...f, prospect_id: e.target.value ? Number(e.target.value) : null }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }}>
                    <option value="">None</option>
                    {prospects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Vessel</label>
                  <select value={form.vessel_id ?? ""}
                    onChange={e => setForm(f => ({ ...f, vessel_id: e.target.value ? Number(e.target.value) : null }))}
                    className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }}>
                    <option value="">None</option>
                    {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Deal link */}
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Deal</label>
                <select value={form.deal_id ?? ""}
                  onChange={e => setForm(f => ({ ...f, deal_id: e.target.value ? Number(e.target.value) : null }))}
                  className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }}>
                  <option value="">None</option>
                  {deals.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Assigned users */}
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Assigned To</label>
                <div className="flex gap-2 mt-1">
                  {["will", "paolo"].map(u => {
                    const active = form.assigned_users.includes(u);
                    return (
                      <button key={u}
                        onClick={() => setForm(f => ({
                          ...f,
                          assigned_users: active
                            ? f.assigned_users.filter(x => x !== u)
                            : [...f.assigned_users, u],
                        }))}
                        className="px-4 py-2 rounded-lg text-sm font-medium capitalize"
                        style={{
                          background: active ? "var(--brass-400)" : "var(--card)",
                          color: active ? "#fff" : "var(--navy-600)",
                          border: `1px solid ${active ? "var(--brass-400)" : "var(--border)"}`,
                          minHeight: 44,
                        }}>
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Notes</label>
                <textarea value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} placeholder="Dock instructions, access codes, prep notes..."
                  className="form-input w-full mt-1 resize-y" style={{ fontSize: 16, minHeight: 80 }} />
              </div>

              {/* Outcome + Feedback (only on edit) */}
              {editId && (
                <>
                  <div>
                    <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Outcome</label>
                    <input type="text" value={form.outcome}
                      onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
                      placeholder="e.g. Client wants to make offer"
                      className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Post-Event Feedback</label>
                    <textarea value={form.feedback_notes}
                      onChange={e => setForm(f => ({ ...f, feedback_notes: e.target.value }))}
                      rows={2} placeholder="How did it go? Next steps?"
                      className="form-input w-full mt-1 resize-y" style={{ fontSize: 16, minHeight: 60 }} />
                  </div>
                </>
              )}

              {/* Audit Log (only on edit) */}
              {editId && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <button
                    onClick={() => {
                      if (!showAudit) fetchAuditLog(editId);
                      setShowAudit(!showAudit);
                    }}
                    className="flex items-center gap-2 text-xs font-semibold w-full"
                    style={{ color: "var(--navy-400)" }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {showAudit ? "Hide" : "Show"} Audit Log
                    <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showAudit ? "rotate-180" : ""}`} />
                  </button>

                  {showAudit && (
                    <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
                      {auditLoading ? (
                        <p className="text-[11px]" style={{ color: "var(--navy-400)" }}>Loading...</p>
                      ) : auditLog.length === 0 ? (
                        <p className="text-[11px]" style={{ color: "var(--navy-400)" }}>No changes recorded</p>
                      ) : auditLog.map((entry: any) => {
                        let changes: Record<string, any> = {};
                        try { changes = JSON.parse(entry.changes || "{}"); } catch {}
                        const changedFields = Object.keys(changes).filter(k => k !== "title" && k !== "type");
                        return (
                          <div key={entry.id} className="p-2 rounded-lg" style={{ background: "var(--sand-100)" }}>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold capitalize" style={{ color: "var(--navy-600)" }}>
                                {entry.actor} · {entry.action}
                              </span>
                              <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>
                                {new Date(entry.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </span>
                            </div>
                            {changedFields.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {changedFields.map(field => (
                                  <p key={field} className="text-[10px]" style={{ color: "var(--navy-500)" }}>
                                    <span className="font-medium">{field}:</span>{" "}
                                    {changes[field]?.old !== undefined && (
                                      <span style={{ color: "#dc2626", textDecoration: "line-through" }}>
                                        {String(changes[field].old).substring(0, 40)}
                                      </span>
                                    )}
                                    {" → "}
                                    {changes[field]?.new !== undefined && (
                                      <span style={{ color: "#059669" }}>
                                        {String(changes[field].new).substring(0, 40)}
                                      </span>
                                    )}
                                  </p>
                                ))}
                              </div>
                            )}
                            {entry.action === "created" && changes.title && (
                              <p className="text-[10px] mt-0.5" style={{ color: "var(--navy-500)" }}>
                                Created: {changes.title}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div className="sticky bottom-0 p-4 flex items-center gap-2"
              style={{ background: "var(--card)", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--sand-100)", color: "var(--navy-600)", minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.title}
                className="btn btn-primary flex-1 py-2 text-sm font-semibold"
                style={{ minHeight: 48, opacity: saving || !form.title ? 0.5 : 1 }}>
                {saving ? "Saving..." : editId ? "Update Event" : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ TOAST NOTIFICATIONS ════════════ */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[10000] space-y-2" style={{ maxWidth: 360 }}>
          {toasts.map(toast => {
            const colors = {
              success: { bg: "rgba(16,185,129,0.95)", text: "#fff" },
              warning: { bg: "rgba(245,158,11,0.95)", text: "#fff" },
              error: { bg: "rgba(239,68,68,0.95)", text: "#fff" },
            };
            const c = colors[toast.type];
            return (
              <div key={toast.id}
                className="flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slideIn_0.3s_ease]"
                style={{ background: c.bg, color: c.text }}>
                {toast.type === "warning" && <AlertTriangle className="w-4 h-4 shrink-0" />}
                {toast.type === "success" && <Check className="w-4 h-4 shrink-0" />}
                {toast.type === "error" && <X className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{toast.message}</span>
                <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="shrink-0 opacity-70 hover:opacity-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ SUBSCRIBE MODAL ════════════ */}
      {showSubscribe && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSubscribe(false)} />
          <div className="relative mx-auto mt-[15vh] w-[92%] max-w-md rounded-2xl overflow-hidden"
            style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-bold" style={{ color: "var(--foreground)" }}>Subscribe to Calendar</h3>
              <button onClick={() => setShowSubscribe(false)} className="p-2 rounded-lg" style={{ color: "var(--navy-400)" }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Apple Calendar Subscription</p>
                <p className="text-xs mb-2" style={{ color: "var(--navy-400)" }}>
                  Add this URL as a calendar subscription in Apple Calendar. Events will auto-update.
                </p>
                <div className="flex items-center gap-2">
                  <input readOnly value={feedUrl} className="form-input flex-1 text-xs" style={{ fontSize: 14, minHeight: 44 }} />
                  <button onClick={() => { navigator.clipboard.writeText(feedUrl); addToast("Feed URL copied!", "success"); }}
                    className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0"
                    style={{ background: "var(--brass-400)", color: "#fff", minHeight: 44 }}>
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>One-Click Subscribe</p>
                <p className="text-xs mb-2" style={{ color: "var(--navy-400)" }}>
                  Open directly in Apple Calendar (macOS/iOS).
                </p>
                <a href={feedUrl.replace("https://", "webcal://").replace("http://", "webcal://")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "rgba(16,185,129,0.1)", color: "#059669", minHeight: 48, border: "1px solid rgba(16,185,129,0.3)" }}>
                  <CalendarDays className="w-4 h-4" /> Open in Apple Calendar
                </a>
              </div>
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>Filtered Feeds</p>
                <p className="text-xs mb-2" style={{ color: "var(--navy-400)" }}>
                  Subscribe to only your events or specific types.
                </p>
                <div className="space-y-1.5">
                  {["will", "paolo"].map(u => (
                    <div key={u} className="flex items-center justify-between py-1">
                      <span className="text-xs capitalize font-medium" style={{ color: "var(--navy-600)" }}>{u}&apos;s Events</span>
                      <button onClick={() => { navigator.clipboard.writeText(`${feedUrl}?user=${u}`); addToast(`${u}'s feed URL copied!`, "success"); }}
                        className="text-[10px] font-semibold px-2 py-1 rounded"
                        style={{ background: "var(--sand-100)", color: "var(--navy-600)" }}>
                        Copy URL
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg text-xs" style={{ background: "rgba(245,158,11,0.08)", color: "#92400e" }}>
                <strong>Note:</strong> Calendar subscriptions are read-only in Apple Calendar. 
                To edit events, use YotCRM directly. Changes sync automatically to subscribers.
              </div>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
