"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ScreenshotUploadModal from "./ScreenshotUploadModal";
import AddLeadModal from "./AddLeadModal";
import type { Contact } from "./types";
import { LeadsTableSkeleton } from "../components/LeadsSkeleton";
import { useToast } from "../components/ToastProvider";
import PageShell from "../components/PageShell";
import { Camera, Plus, Search, Shield, RefreshCw, Filter, ChevronDown, X, SlidersHorizontal, Upload } from "lucide-react";

const CLIENTS_ENDPOINT = "/api/clients";

const STATUS_COLORS: Record<string, string> = {
  hot: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  warm: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cold: "bg-gray-200 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300",
  nurture: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  new: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  client: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
};

const STATUS_OPTIONS = ["new", "hot", "warm", "cold", "nurture", "client", "other"];

function normalizeContact(raw: any, idx: number): Contact {
  const tags = Array.isArray(raw?.tags)
    ? raw.tags
    : typeof raw?.tags === "string"
    ? raw.tags.split(/[;,]+/).map((t: string) => t.trim()).filter(Boolean)
    : [];

  return {
    id: raw?.id ?? String(idx),
    firstName: raw?.first_name ?? raw?.firstName ?? "",
    lastName: raw?.last_name ?? raw?.lastName ?? "",
    email: raw?.email ?? "",
    phone: raw?.phone ?? "",
    tags,
    status: raw?.status ?? "other",
    notes: raw?.notes ?? "",
    source: raw?.source ?? "",
    createdAt: raw?.created_at ?? raw?.createdAt ?? "",
    boat_make: raw?.boat_make ?? "",
    boat_model: raw?.boat_model ?? "",
    boat_year: raw?.boat_year ?? "",
    boat_length: raw?.boat_length ?? "",
    boat_price: raw?.boat_price ?? "",
    boat_location: raw?.boat_location ?? "",
    listing_url: raw?.listing_url ?? "",
    intel_score: raw?.intel_score ?? null,
    intel_band: raw?.intel_band ?? null,
  };
}

function IntelBadge({ score, band, loading, onClick }: {
  score?: number | null; band?: string | null; loading?: boolean; onClick?: (e: React.MouseEvent) => void;
}) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
        style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>
        <RefreshCw className="w-2.5 h-2.5 animate-spin" /> ...
      </div>
    );
  }
  if (score == null) {
    return (
      <button onClick={onClick}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors hover:bg-[var(--sand-200)] dark:hover:bg-[var(--navy-700)]"
        style={{ background: "var(--sand-100)", color: "var(--navy-500)" }}
        title="Run Lighthouse intelligence report">
        <Shield className="w-2.5 h-2.5" /> Run
      </button>
    );
  }
  const colors: Record<string, { bg: string; text: string }> = {
    high_confidence:   { bg: "rgba(16,185,129,0.15)", text: "#059669" },
    likely_legitimate: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
    unverified:        { bg: "rgba(245,158,11,0.15)", text: "#d97706" },
    elevated_risk:     { bg: "rgba(239,68,68,0.15)",  text: "#ef4444" },
  };
  const c = colors[band || ""] || colors.unverified;
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-opacity hover:opacity-80"
      style={{ background: c.bg, color: c.text }}
      title={`Lighthouse: ${score}/100 — ${(band || "unverified").replace(/_/g, " ")} (click to re-scan)`}>
      <Shield className="w-2.5 h-2.5" />
      {score}
    </button>
  );
}

export default function ClientsPage(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [intelFilter, setIntelFilter] = useState<string>("all");
  const [boatFilter, setBoatFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [batchEnriching, setBatchEnriching] = useState(false);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLeads(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };
  const toggleSelectAll = () => {
    if (selectedLeads.size === sorted.length) setSelectedLeads(new Set());
    else setSelectedLeads(new Set(sorted.map(c => c.id)));
  };

  const runBatchEnrich = async () => {
    if (selectedLeads.size === 0) return;
    setBatchEnriching(true);
    const ids = [...selectedLeads];
    let done = 0;
    toast(`Scanning ${ids.length} leads…`);
    for (const id of ids) {
      setEnriching(prev => new Set(prev).add(id));
      try {
        const res = await fetch("/api/intel/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: Number(id), action: "enrich" }),
        });
        const data = await res.json();
        done++;
        if (data.ok) toast(`${done}/${ids.length}: ${data.score}/100`);
      } catch { /* continue */ }
      finally { setEnriching(prev => { const s = new Set(prev); s.delete(id); return s; }); }
    }
    await fetchContacts();
    setSelectedLeads(new Set());
    setBatchEnriching(false);
    toast(`✅ Batch scan complete — ${done}/${ids.length} processed`);
  };

  const runEnrich = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEnriching(prev => new Set(prev).add(id));
    try {
      const res = await fetch("/api/intel/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: Number(id), action: "enrich" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Intel: ${data.score}/100 — ${(data.band || "").replace(/_/g, " ")}`);
        fetchContacts();
      } else {
        toast(data.error || "Enrichment failed", "error");
      }
    } catch { toast("Enrichment failed", "error"); }
    finally { setEnriching(prev => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(CLIENTS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      const normalized = Array.isArray(data.contacts)
        ? data.contacts.map((c: any, i: number) => normalizeContact(c, i))
        : [];
      setContacts(normalized);
    } catch (err) {
      console.error("Error fetching contacts", err);
      setError("Unable to load clients.");
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchContacts().finally(() => setIsLoading(false));
    const interval = setInterval(() => { fetchContacts(); }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchContacts();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchContacts]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
      toast(`Status updated to ${newStatus}`);
    } catch (err) {
      console.error("Status update failed", err);
      toast("Failed to update status", "error");
    }
  };

  const filtered = contacts.filter((c) => {
    const status = (c.status || "other").toLowerCase();
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (sourceFilter !== "all" && (c.source || "").toLowerCase() !== sourceFilter) return false;
    if (intelFilter !== "all") {
      if (intelFilter === "none" && c.intel_score != null) return false;
      if (intelFilter === "scanned" && c.intel_score == null) return false;
      if (intelFilter !== "none" && intelFilter !== "scanned" && c.intel_band !== intelFilter) return false;
    }
    if (boatFilter.trim()) {
      const bf = boatFilter.toLowerCase();
      const boatStr = [c.boat_make, c.boat_model, c.boat_year, c.boat_length].join(" ").toLowerCase();
      if (!boatStr.includes(bf)) return false;
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      return [c.firstName, c.lastName, c.email, c.phone, c.boat_make, c.boat_model, c.source, c.notes]
        .some((f) => (f || "").toLowerCase().includes(term));
    }
    return true;
  });

  // Sort
  const STATUS_SORT_ORDER: Record<string, number> = { hot: 0, warm: 1, new: 2, nurture: 3, cold: 4, client: 5, other: 6 };
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "newest") return (b.createdAt || "").toString().localeCompare((a.createdAt || "").toString());
    if (sortBy === "oldest") return (a.createdAt || "").toString().localeCompare((b.createdAt || "").toString());
    if (sortBy === "name_az") return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    if (sortBy === "name_za") return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
    if (sortBy === "status") return (STATUS_SORT_ORDER[(a.status||"other").toLowerCase()] ?? 6) - (STATUS_SORT_ORDER[(b.status||"other").toLowerCase()] ?? 6);
    if (sortBy === "score_high") return (b.intel_score || 0) - (a.intel_score || 0);
    if (sortBy === "score_low") return (a.intel_score || 0) - (b.intel_score || 0);
    if (sortBy === "boat") return (a.boat_make || "zzz").localeCompare(b.boat_make || "zzz");
    if (sortBy === "source") return (a.source || "zzz").localeCompare(b.source || "zzz");
    return 0;
  });

  const counts = contacts.reduce<Record<string, number>>((acc, c) => {
    const s = (c.status || "other").toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // Unique sources for filter dropdown
  const uniqueSources = [...new Set(contacts.map(c => (c.source || "").toLowerCase()).filter(Boolean))].sort();

  // Active filter count for badge
  const activeFilterCount = [
    statusFilter !== "all",
    sourceFilter !== "all",
    intelFilter !== "all",
    boatFilter.trim() !== "",
    sortBy !== "newest",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter("all");
    setSourceFilter("all");
    setIntelFilter("all");
    setBoatFilter("");
    setSortBy("newest");
    setSearch("");
  };

  return (
    <PageShell
      title="Leads"
      subtitle={`${contacts.length} total lead${contacts.length !== 1 ? "s" : ""} in pipeline`}
      maxWidth="wide"
      actions={
        <div className="flex gap-2">
          <button onClick={() => setShowScreenshotModal(true)} className="btn-secondary">
            <Camera className="w-3.5 h-3.5" /> Screenshot
          </button>
          <a href="/clients/import" className="btn-secondary inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </a>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> New Lead
          </button>
        </div>
      }
    >

      {/* ═══ Search + Filter Bar ═══ */}
      <div className="mb-4 space-y-3">
        {/* Row 1: Search + Filter Toggle */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--navy-400)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, boat, source, notes..."
              className="w-full rounded-xl border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-900)] pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)] placeholder:text-[var(--navy-300)]" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`relative flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
              showFilters || activeFilterCount > 0
                ? "bg-[var(--navy-800)] text-white border-transparent dark:bg-[var(--brass-500)] dark:text-[var(--navy-900)]"
                : "bg-white dark:bg-[var(--navy-900)] text-[var(--navy-600)] dark:text-[var(--navy-300)] border-[var(--sand-300)] dark:border-[var(--navy-700)]"
            }`}>
            <SlidersHorizontal className="w-4 h-4" /> Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--coral-500)] text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2: Status Chips (always visible) */}
        <div className="flex gap-2 overflow-x-auto nav-scroll pb-1">
          {[
            { key: "all", label: "All", count: contacts.length },
            { key: "new", label: "New", count: counts.new || 0 },
            { key: "hot", label: "Hot", count: counts.hot || 0 },
            { key: "warm", label: "Warm", count: counts.warm || 0 },
            { key: "cold", label: "Cold", count: counts.cold || 0 },
            { key: "nurture", label: "Nurture", count: counts.nurture || 0 },
            { key: "client", label: "✓ Client", count: counts.client || 0 },
          ].map((s) => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                statusFilter === s.key
                  ? "bg-[var(--navy-800)] dark:bg-[var(--brass-500)] text-white dark:text-[var(--navy-900)] border-transparent"
                  : "bg-white dark:bg-[var(--navy-900)] text-[var(--navy-600)] dark:text-[var(--navy-300)] border-[var(--sand-300)] dark:border-[var(--navy-700)] hover:border-[var(--navy-300)]"
              }`}>
              {s.label} ({s.count})
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Expandable Filter Panel */}
      {showFilters && (
        <div className="mb-4 p-4 rounded-xl border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-900)]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Source */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-wider block mb-1">Source</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-800)] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)]">
                <option value="all">All Sources</option>
                {uniqueSources.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* Intel Score Band */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-wider block mb-1">Intel Score</label>
              <select value={intelFilter} onChange={(e) => setIntelFilter(e.target.value)}
                className="w-full rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-800)] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)]">
                <option value="all">Any Score</option>
                <option value="scanned">Scanned (any)</option>
                <option value="none">Not Scanned</option>
                <option value="high_confidence">🟢 High Confidence (80+)</option>
                <option value="likely_legitimate">🔵 Likely Legitimate (60-79)</option>
                <option value="unverified">🟡 Unverified (40-59)</option>
                <option value="elevated_risk">🔴 Elevated Risk (&lt;40)</option>
              </select>
            </div>
            {/* Boat Search */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-wider block mb-1">Boat Make / Model</label>
              <input value={boatFilter} onChange={(e) => setBoatFilter(e.target.value)}
                placeholder="e.g. Hatteras, Viking"
                className="w-full rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-800)] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)] placeholder:text-[var(--navy-300)]" />
            </div>
            {/* Sort */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-wider block mb-1">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-lg border border-[var(--sand-300)] dark:border-[var(--navy-700)] bg-white dark:bg-[var(--navy-800)] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)]">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name_az">Name A → Z</option>
                <option value="name_za">Name Z → A</option>
                <option value="status">Status (Hot → Cold)</option>
                <option value="score_high">Intel Score ↓</option>
                <option value="score_low">Intel Score ↑</option>
                <option value="boat">Boat Make A → Z</option>
                <option value="source">Source A → Z</option>
              </select>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <span className="text-xs text-[var(--navy-400)]">{sorted.length} of {contacts.length} leads shown</span>
              <button onClick={clearAllFilters}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--coral-500)] hover:text-[var(--coral-600)]">
                <X className="w-3 h-3" /> Clear All Filters
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-[var(--coral-500)]">{error}</p>}

      {/* Batch Actions */}
      {selectedLeads.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{ background: "var(--brass-50)", border: "1px solid var(--brass-200)" }}>
          <span className="text-sm font-bold" style={{ color: "var(--brass-700)" }}>{selectedLeads.size} selected</span>
          <button onClick={runBatchEnrich} disabled={batchEnriching}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
            style={{ background: "var(--brass-500)" }}>
            {batchEnriching ? "⟳ Scanning…" : `🔍 Scan ${selectedLeads.size} Lead${selectedLeads.size > 1 ? "s" : ""}`}
          </button>
          <button onClick={() => setSelectedLeads(new Set())} className="text-xs font-semibold" style={{ color: "var(--navy-400)" }}>Clear</button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <LeadsTableSkeleton />
      ) : sorted.length === 0 ? (
        <p className="text-[var(--navy-400)] py-14 text-center text-sm">
          {activeFilterCount > 0 ? "No leads match your filters." : "No leads found."}
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="block mx-auto mt-2 text-xs font-semibold text-[var(--brass-500)] hover:underline">
              Clear Filters
            </button>
          )}
        </p>
      ) : (
        <div className="card-elevated overflow-hidden" style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
          {/* Desktop Table */}
          <table className="w-full hidden md:table">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--sand-200)] dark:border-[var(--navy-700)] bg-[var(--sand-50)] dark:bg-[var(--navy-900)]">
                <th className="px-2 py-3 w-8 text-center">
                  <input type="checkbox" checked={selectedLeads.size === sorted.length && sorted.length > 0}
                    onChange={toggleSelectAll} className="rounded border-gray-300" />
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest">Name</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest">Contact</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest">Boat</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest">Source</th>
                <th className="px-5 py-3 text-center text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest w-16">Intel</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--navy-400)] uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
              {sorted.map((c) => {
                const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Untitled";
                const boat = [c.boat_year, c.boat_length ? c.boat_length + "'" : "", c.boat_make, c.boat_model]
                  .filter(Boolean).join(" ");
                const status = (c.status || "other").toLowerCase();
                return (
                  <tr key={c.id}
                    className="hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] cursor-pointer transition-colors"
                    onClick={() => router.push(`/clients/${encodeURIComponent(c.id)}`)}>
                    <td className="px-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedLeads.has(c.id)}
                        onChange={() => setSelectedLeads(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">{name}</div>
                      {c.notes && <div className="text-xs text-[var(--navy-400)] mt-0.5 truncate max-w-[200px]">{c.notes}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)]">{c.email}</div>
                      {c.phone && <div className="text-xs text-[var(--navy-400)] mt-0.5">{c.phone}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)]">{boat || <span className="text-[var(--navy-400)]">—</span>}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--navy-400)]">{c.source || "—"}</td>
                    <td className="px-5 py-3.5 text-center">
                      <IntelBadge score={c.intel_score} band={c.intel_band}
                        loading={enriching.has(c.id)} onClick={(e) => runEnrich(c.id, e)} />
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <select value={status} onChange={(e) => updateStatus(c.id, e.target.value)}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--brass-400)] badge badge-${status}`}>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
            {sorted.map((c) => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Untitled";
              const boat = [c.boat_year, c.boat_length ? c.boat_length + "'" : "", c.boat_make, c.boat_model]
                .filter(Boolean).join(" ");
              const status = (c.status || "other").toLowerCase();
              return (
                <div key={c.id}
                  className="px-4 py-3 active:bg-[var(--sand-100)] dark:active:bg-[var(--navy-800)] cursor-pointer transition-colors"
                  onClick={() => router.push(`/clients/${encodeURIComponent(c.id)}`)}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">{name}</div>
                    <div className="flex items-center gap-1.5">
                      <IntelBadge score={c.intel_score} band={c.intel_band}
                        loading={enriching.has(c.id)} onClick={(e) => runEnrich(c.id, e)} />
                      <span className={`badge badge-${status}`}>
                        {status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {boat && <div className="text-xs text-[var(--navy-400)] mt-0.5">{boat}</div>}
                  <div className="text-xs text-[var(--navy-300)] mt-0.5">{c.email}{c.source ? ` · ${c.source}` : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ScreenshotUploadModal
        isOpen={showScreenshotModal}
        onClose={() => setShowScreenshotModal(false)}
        onSuccess={() => { fetchContacts(); toast("Lead imported from screenshot"); }}
      />
      <AddLeadModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { fetchContacts(); toast("New lead added"); }}
      />
    </PageShell>
  );
}
