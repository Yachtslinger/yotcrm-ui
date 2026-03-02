"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Zap, Upload, Filter, ChevronDown, ChevronUp,
  MessageSquare, Mail, X, Check, Clock, AlertTriangle,
  ExternalLink, Phone, Search, RefreshCw, History,
} from "lucide-react";

/* ─── Types ─── */
type ParsedListing = {
  id: number; make: string; model: string; year: string;
  loa: string; asking_price: string; location: string;
  vessel_type: string; listing_url: string; broker_notes: string;
};

type Match = {
  id: number; listing_id: number; lead_id: number | null;
  iso_id: number | null; batch_id: number; match_score: number;
  confidence: string; reasons: string; conflicts: string;
  status: string; notes: string; contacted_at: string | null;
  created_at: string; listing?: ParsedListing;
  lead_name?: string; lead_email?: string; lead_phone?: string;
  lead_status?: string; lead_notes?: string;
  iso_name?: string; iso_email?: string;
};

type Batch = {
  id: number; source: string; subject: string;
  listing_count: number; match_count: number;
  status: string; created_at: string;
};

/* ─── Helpers ─── */
function confidenceColor(c: string) {
  if (c === "high") return { bg: "rgba(16,185,129,0.12)", text: "var(--green-600, #059669)", border: "rgba(16,185,129,0.3)" };
  if (c === "medium") return { bg: "rgba(245,158,11,0.12)", text: "var(--amber-600, #d97706)", border: "rgba(245,158,11,0.3)" };
  return { bg: "rgba(107,114,128,0.12)", text: "var(--navy-400, #6b7280)", border: "rgba(107,114,128,0.3)" };
}

function scoreColor(score: number) {
  if (score >= 70) return "#059669";
  if (score >= 45) return "#d97706";
  return "#6b7280";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    new: { label: "New", color: "#3b82f6" },
    contacted: { label: "Contacted", color: "#059669" },
    dismissed: { label: "Dismissed", color: "#6b7280" },
    snoozed: { label: "Snoozed", color: "#d97706" },
  };
  return map[status] || map.new;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ═══ MAIN COMPONENT ═══ */
export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"matches" | "batches">("matches");

  // Filters
  const [confidence, setConfidence] = useState<string>("");
  const [minScore, setMinScore] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState<number | null>(null);

  // UI state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (confidence) params.set("confidence", confidence);
      if (minScore > 0) params.set("minScore", String(minScore));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (batchFilter) params.set("batchId", String(batchFilter));
      const res = await fetch(`/api/matches/list?${params}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [confidence, minScore, search, statusFilter, batchFilter]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/matches/batches");
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchMatches(); fetchBatches(); }, [fetchMatches, fetchBatches]);

  /* ── Upload handler ── */
  const handleUpload = async () => {
    if (!uploadText.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch("/api/matches/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: uploadText }),
      });
      const data = await res.json();
      setUploadResult(data);
      if (data.ok) {
        setUploadText("");
        fetchMatches();
        fetchBatches();
      }
    } catch (e: any) {
      setUploadResult({ ok: false, error: e.message });
    }
    setUploading(false);
  };

  /* ── Status update handler ── */
  const updateStatus = async (matchId: number, status: string, notes?: string) => {
    try {
      await fetch("/api/matches/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status, notes }),
      });
      setMatches(prev => prev.map(m =>
        m.id === matchId ? { ...m, status, ...(status === "contacted" ? { contacted_at: new Date().toISOString() } : {}) } : m
      ));
    } catch (e) { console.error(e); }
  };

  const latestBatch = batches[0];

  /* ═══ RENDER ═══ */
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <Zap className="w-6 h-6" style={{ color: "var(--brass-400)" }} />
              Buyer-Listing Matches
            </h1>
            {latestBatch && (
              <p className="text-sm mt-1" style={{ color: "var(--navy-400)" }}>
                Latest: {fmtDate(latestBatch.created_at)} · {latestBatch.listing_count} listings · {latestBatch.match_count} matches
              </p>
            )}
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="btn btn-primary flex items-center gap-2"
            style={{ minHeight: 44 }}
          >
            <Upload className="w-4 h-4" /> Process New Email
          </button>
        </div>

        {/* ── Tab Toggle ── */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTab("matches"); setBatchFilter(null); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === "matches" ? "var(--brass-400)" : "var(--card)",
              color: tab === "matches" ? "#fff" : "var(--navy-600)",
              border: `1px solid ${tab === "matches" ? "var(--brass-400)" : "var(--border)"}`,
              minHeight: 44,
            }}
          >
            Matches ({total})
          </button>
          <button
            onClick={() => setTab("batches")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            style={{
              background: tab === "batches" ? "var(--brass-400)" : "var(--card)",
              color: tab === "batches" ? "#fff" : "var(--navy-600)",
              border: `1px solid ${tab === "batches" ? "var(--brass-400)" : "var(--border)"}`,
              minHeight: 44,
            }}
          >
            <History className="w-4 h-4" /> Batches ({batches.length})
          </button>
        </div>

        {/* ════════════ MATCHES TAB ════════════ */}
        {tab === "matches" && (
          <>
            {/* ── Filter Bar ── */}
            <div className="rounded-xl p-3 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {/* Search + toggle */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--navy-400)" }} />
                  <input
                    type="text"
                    placeholder="Search name, make, model..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="form-input w-full pl-9"
                    style={{ fontSize: 16, minHeight: 44 }}
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium"
                  style={{ minHeight: 44, background: "var(--sand-100)", color: "var(--navy-600)", border: "1px solid var(--border)" }}
                >
                  <Filter className="w-4 h-4" />
                  {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <button onClick={() => fetchMatches()} className="flex items-center px-2 rounded-lg" style={{ minHeight: 44, color: "var(--navy-400)" }}>
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Confidence chips */}
              <div className="flex flex-wrap gap-2 mt-3">
                {["", "high", "medium", "low"].map(c => (
                  <button key={c}
                    onClick={() => setConfidence(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      background: confidence === c ? (c ? confidenceColor(c).bg : "var(--brass-400)") : "var(--sand-100)",
                      color: confidence === c ? (c ? confidenceColor(c).text : "#fff") : "var(--navy-500)",
                      border: `1px solid ${confidence === c ? (c ? confidenceColor(c).border : "var(--brass-400)") : "var(--border)"}`,
                    }}
                  >
                    {c ? c.charAt(0).toUpperCase() + c.slice(1) : "All"}
                  </button>
                ))}

                {/* Status chips */}
                {["", "new", "contacted", "dismissed", "snoozed"].map(s => (
                  <button key={`s-${s}`}
                    onClick={() => setStatusFilter(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      background: statusFilter === s ? "var(--navy-700)" : "var(--sand-100)",
                      color: statusFilter === s ? "#fff" : "var(--navy-500)",
                      border: `1px solid ${statusFilter === s ? "var(--navy-700)" : "var(--border)"}`,
                    }}
                  >
                    {s ? s.charAt(0).toUpperCase() + s.slice(1) : "Any Status"}
                  </button>
                ))}
              </div>

              {/* Advanced filters (collapsible) */}
              {showFilters && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div>
                    <label className="text-xs font-medium" style={{ color: "var(--navy-400)" }}>Min Score</label>
                    <input type="number" value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                      className="form-input w-full mt-1" style={{ fontSize: 16, minHeight: 44 }} min={0} max={100} />
                  </div>
                </div>
              )}

              {batchFilter && (
                <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: "var(--navy-400)" }}>
                  Filtered to Batch #{batchFilter}
                  <button onClick={() => setBatchFilter(null)} className="underline" style={{ color: "var(--brass-400)" }}>Clear</button>
                </div>
              )}
            </div>

            {/* ── Results ── */}
            {loading ? (
              <div className="text-center py-12" style={{ color: "var(--navy-400)" }}>
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading matches...
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--navy-500)" }}>No matches found</p>
                <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>Process an email or adjust your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {matches.map(match => {
                  const expanded = expandedId === match.id;
                  const l = match.listing;
                  const reasons = (() => { try { return JSON.parse(match.reasons); } catch { return []; } })();
                  const conflicts = (() => { try { return JSON.parse(match.conflicts); } catch { return []; } })();
                  const sColor = scoreColor(match.match_score);
                  const cColor = confidenceColor(match.confidence);
                  const sBadge = statusBadge(match.status);
                  const prospectName = match.lead_name || match.iso_name || "Unknown";
                  const boatTitle = l ? `${l.year} ${l.make} ${l.model}`.trim() : "Unknown vessel";

                  return (
                    <div key={match.id} className="rounded-xl overflow-hidden transition-shadow"
                      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: expanded ? "var(--shadow-lg)" : "none" }}>
                      {/* ── Card header (clickable) ── */}
                      <button
                        onClick={() => setExpandedId(expanded ? null : match.id)}
                        className="w-full text-left p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Prospect name + status */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                                {prospectName}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: sBadge.color + "18", color: sBadge.color }}>
                                {sBadge.label}
                              </span>
                              {match.iso_id && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(139,92,246,0.12)", color: "#7c3aed" }}>ISO</span>
                              )}
                            </div>
                            {/* Boat summary */}
                            <p className="text-sm mt-1" style={{ color: "var(--navy-500)" }}>
                              {boatTitle}{l?.loa ? ` · ${l.loa}` : ""}{l?.asking_price ? ` · ${l.asking_price}` : ""}{l?.location ? ` · ${l.location}` : ""}
                            </p>
                            {/* Reason tags */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {reasons.slice(0, 3).map((r: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>
                                  {r}
                                </span>
                              ))}
                              {conflicts.slice(0, 2).map((c: string, i: number) => (
                                <span key={`c-${i}`} className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5" style={{ background: "rgba(245,158,11,0.08)", color: "#d97706" }}>
                                  <AlertTriangle className="w-2.5 h-2.5" /> {c}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* Score badge */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold"
                              style={{ background: sColor + "18", color: sColor, border: `2px solid ${sColor}40` }}>
                              {match.match_score}
                            </div>
                            <span className="text-[10px] font-semibold mt-1" style={{ color: cColor.text }}>
                              {match.confidence}
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* ── Expanded Detail Panel ── */}
                      {expanded && (
                        <div className="px-4 pb-4 pt-0" style={{ borderTop: "1px solid var(--border)" }}>
                          {/* Prospect info */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Prospect</h4>
                              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{prospectName}</p>
                              {match.lead_email && <p className="text-xs" style={{ color: "var(--navy-500)" }}>{match.lead_email}</p>}
                              {match.lead_phone && <p className="text-xs" style={{ color: "var(--navy-500)" }}>{match.lead_phone}</p>}
                              {match.lead_status && <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>Status: {match.lead_status}</p>}
                              {match.lead_notes && <p className="text-xs mt-1 italic" style={{ color: "var(--navy-400)" }}>{match.lead_notes}</p>}
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Vessel</h4>
                              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{boatTitle}</p>
                              {l?.asking_price && <p className="text-xs" style={{ color: "var(--navy-500)" }}>Price: {l.asking_price}</p>}
                              {l?.loa && <p className="text-xs" style={{ color: "var(--navy-500)" }}>LOA: {l.loa}</p>}
                              {l?.location && <p className="text-xs" style={{ color: "var(--navy-500)" }}>Location: {l.location}</p>}
                              {l?.listing_url && (
                                <a href={l.listing_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "var(--brass-400)" }}>
                                  View Listing <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Full reasons + conflicts */}
                          {(reasons.length > 0 || conflicts.length > 0) && (
                            <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Match Reasoning</h4>
                              <div className="flex flex-wrap gap-1.5">
                                {reasons.map((r: string, i: number) => (
                                  <span key={i} className="px-2 py-1 rounded text-xs" style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>✓ {r}</span>
                                ))}
                                {conflicts.map((c: string, i: number) => (
                                  <span key={`c-${i}`} className="px-2 py-1 rounded text-xs" style={{ background: "rgba(245,158,11,0.08)", color: "#d97706" }}>⚠ {c}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                            {match.lead_phone && (
                              <a href={`sms:${match.lead_phone}&body=Hi ${prospectName.split(" ")[0]}, I found a ${boatTitle} that might interest you. Would you like more details?`}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(16,185,129,0.1)", color: "#059669", minHeight: 48 }}>
                                <MessageSquare className="w-4 h-4" /> Text
                              </a>
                            )}
                            {match.lead_email && (
                              <a href={`mailto:${match.lead_email}?subject=New Listing: ${boatTitle}&body=Hi ${prospectName.split(" ")[0]},%0A%0AI came across a ${boatTitle} that matches what you're looking for.%0A%0AWould you like to schedule a viewing?`}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 48 }}>
                                <Mail className="w-4 h-4" /> Email
                              </a>
                            )}
                            {match.lead_phone && (
                              <a href={`tel:${match.lead_phone}`}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(139,92,246,0.1)", color: "#7c3aed", minHeight: 48 }}>
                                <Phone className="w-4 h-4" /> Call
                              </a>
                            )}
                            {match.status !== "contacted" && (
                              <button onClick={() => updateStatus(match.id, "contacted")}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(16,185,129,0.1)", color: "#059669", minHeight: 48 }}>
                                <Check className="w-4 h-4" /> Contacted
                              </button>
                            )}
                            {match.status !== "snoozed" && (
                              <button onClick={() => updateStatus(match.id, "snoozed")}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(245,158,11,0.1)", color: "#d97706", minHeight: 48 }}>
                                <Clock className="w-4 h-4" /> Snooze
                              </button>
                            )}
                            {match.status !== "dismissed" && (
                              <button onClick={() => updateStatus(match.id, "dismissed")}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(107,114,128,0.1)", color: "#6b7280", minHeight: 48 }}>
                                <X className="w-4 h-4" /> Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════ BATCHES TAB ════════════ */}
        {tab === "batches" && (
          <div className="space-y-2">
            {batches.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <History className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
                <p className="text-sm" style={{ color: "var(--navy-500)" }}>No batches processed yet</p>
              </div>
            ) : batches.map(batch => (
              <button key={batch.id}
                onClick={() => { setBatchFilter(batch.id); setTab("matches"); }}
                className="w-full text-left p-4 rounded-xl transition-colors"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      Batch #{batch.id} — {batch.subject || batch.source}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>
                      {fmtDate(batch.created_at)} · {batch.listing_count} listings · {batch.match_count} matches
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4" style={{ color: "var(--navy-400)" }} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ════════════ UPLOAD MODAL ════════════ */}
        {showUpload && (
          <div className="fixed inset-0" style={{ zIndex: 9999 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowUpload(false); setUploadResult(null); }} />
            <div className="relative mx-auto mt-[10vh] w-[92%] max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
              {/* Modal header */}
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>Process New Listings Email</h2>
                <button onClick={() => { setShowUpload(false); setUploadResult(null); }}
                  className="p-2 rounded-lg" style={{ color: "var(--navy-400)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Modal body */}
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>
                  Paste the raw content of a Boats Group &ldquo;New Listings From Your Professional Boat Shopper&rdquo; email.
                  The parser will extract Section A (USA 70ft+) and Section B (Global 70ft+), ignore everything else,
                  match against your CRM prospects, and create &ldquo;Send Boat&rdquo; todos for you and Paolo.
                </p>
                <textarea
                  value={uploadText}
                  onChange={e => setUploadText(e.target.value)}
                  placeholder="Paste email content here (raw .eml, HTML, or text body)..."
                  rows={8}
                  className="form-input w-full resize-y"
                  style={{ fontSize: 16, minHeight: 120 }}
                />
                {/* .eml file upload */}
                <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs" style={{ color: "var(--brass-400)" }}>
                  <Upload className="w-3.5 h-3.5" />
                  <span>or upload .eml file</span>
                  <input type="file" accept=".eml,.txt,.html" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      setUploadText(text);
                      setUploadResult(null);
                    }}
                  />
                </label>
                {uploadResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${uploadResult.ok ? "" : ""}`}
                    style={{
                      color: uploadResult.ok ? "#059669" : "#dc2626",
                      background: uploadResult.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    }}>
                    {uploadResult.ok ? (
                      <div className="space-y-1">
                        <p className="font-semibold">✓ Processed successfully</p>
                        <p>{uploadResult.listingCount} listings extracted</p>
                        {(uploadResult.sectionA > 0 || uploadResult.sectionB > 0) && (
                          <p className="text-xs" style={{ color: "var(--navy-500)" }}>
                            Section A (USA): {uploadResult.sectionA || 0} · Section B (Global): {uploadResult.sectionB || 0}
                          </p>
                        )}
                        <p>{uploadResult.matchCount} prospect matches found</p>
                        {uploadResult.todosCreated > 0 && (
                          <p className="font-medium" style={{ color: "#2563eb" }}>
                            📋 {uploadResult.todosCreated} &ldquo;Send Boat&rdquo; todos created for Will &amp; Paolo
                          </p>
                        )}
                        {uploadResult.warning && <p className="text-xs italic">{uploadResult.warning}</p>}
                        {uploadResult.ignoredSections?.length > 0 && (
                          <details className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>
                            <summary className="cursor-pointer">Ignored {uploadResult.ignoredSections.length} other section(s)</summary>
                            <ul className="mt-1 space-y-0.5 pl-3">
                              {uploadResult.ignoredSections.map((s: string, i: number) => <li key={i}>{s}</li>)}
                            </ul>
                          </details>
                        )}
                      </div>
                    ) : (
                      `✗ ${uploadResult.error}`
                    )}
                  </div>
                )}
              </div>
              {/* Modal footer */}
              <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                <button onClick={() => { setShowUpload(false); setUploadResult(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--sand-100)", color: "var(--navy-600)", minHeight: 44 }}>
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !uploadText.trim()}
                  className="btn btn-primary px-4 py-2 text-sm font-medium"
                  style={{ minHeight: 44, opacity: uploading || !uploadText.trim() ? 0.5 : 1 }}
                >
                  {uploading ? "Processing..." : "Process Email"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
