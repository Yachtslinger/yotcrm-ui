"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap, Upload, Filter, ChevronDown, ChevronUp,
  MessageSquare, Mail, X, Check, Clock, AlertTriangle,
  ExternalLink, Phone, Search, RefreshCw, History, Send,
  CheckCircle, Reply,
} from "lucide-react";

/* ─── Types ─── */
type ParsedListing = {
  id: number; make: string; model: string; year: string;
  loa: string; asking_price: string; location: string;
  vessel_type: string; listing_url: string; broker_notes: string;
  denison_url?: string;
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

type SendTone = "search" | "mls" | "new-listing" | "price-drop";

type SendLog = {
  id: number; sentAt: string; vesselYear: number | null;
  vesselMake: string | null; vesselModel: string | null;
  vesselPrice: string | null; tone: string; subject: string | null;
  repliedAt: string | null; likedAt: string | null;
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

const TONE_OPTIONS: { id: SendTone; label: string; desc: string }[] = [
  { id: "search",       label: "I was searching for you",  desc: "Found this while running a search with your criteria in mind" },
  { id: "mls",          label: "Caught my eye on the MLS", desc: "Was combing the MLS and this one stood out — thought of you" },
  { id: "new-listing",  label: "Just listed",              desc: "Just came to market, wanted you to see it first" },
  { id: "price-drop",   label: "Price reduced",            desc: "Meaningful price adjustment — worth revisiting" },
];

/* ─── ViewListingButton ─────────────────────────────────────────────────────
   Resolves the PSP BoatWizard URL to a public Denison URL on first click,
   caches the result back to the DB, then opens it. Subsequent clicks are
   instant (denison_url already populated). Shows a spinner during lookup. */
function ViewListingButton({ listing }: { listing: ParsedListing }) {
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<string>(listing.denison_url || "");

  const [notOnDenison, setNotOnDenison] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const target = resolved || listing.denison_url;
    if (target) { window.open(target, "_blank", "noopener,noreferrer"); return; }

    // Open the window immediately — before any await — to preserve the user
    // gesture context. Browsers block window.open() called after async gaps.
    // Do NOT use noopener here — it severs the win reference so we can't navigate it.
    const win = window.open("about:blank", "_blank");

    setResolving(true);
    try {
      const res = await fetch("/api/matches/denison-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_url: listing.listing_url,
          make: listing.make, model: listing.model,
          year: listing.year, loa: listing.loa,
          listing_id: listing.id,
        }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        setResolved(data.url);
        listing.denison_url = data.url;
        if (win) win.location.href = data.url;
      } else {
        setNotOnDenison(true);
        const make = (listing.make || "").split(" ")[0]; // raw — URLSearchParams encodes it
        const year = listing.year ? parseInt(listing.year) : null;
        const loa  = listing.loa  ? parseFloat(listing.loa.replace(/[^0-9.]/g,"")) : null;
        const params = new URLSearchParams();
        if (make) params.set("make", make);
        if (year) { params.set("year_min", String(year - 1)); params.set("year_max", String(year + 1)); }
        if (loa && !isNaN(loa)) { params.set("length_min", String(Math.round(loa - 10))); params.set("length_max", String(Math.round(loa + 10))); }
        if (win) win.location.href = `https://www.denisonyachtsales.com/yachts-for-sale/?${params}`;
      }
    } catch {
      if (win) win.location.href = "https://www.denisonyachtsales.com/yachts-for-sale/";
    } finally {
      setResolving(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={resolving}
      className="inline-flex items-center gap-1 text-xs mt-1"
      style={{
        color: notOnDenison ? "var(--navy-400, #6b7280)" : "var(--brass-400)",
        background: "none", border: "none",
        cursor: resolving ? "wait" : "pointer", padding: 0,
      }}
      title={notOnDenison ? "Not found in Denison's feed — opening search" : "Find on Denison Yachting"}
    >
      {resolving
        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Searching Denison…</>
        : notOnDenison
        ? <><ExternalLink className="w-3 h-3" /> Search Denison</>
        : <><ExternalLink className="w-3 h-3" /> View on Denison</>
      }
    </button>
  );
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
  const [sortBy, setSortBy] = useState("score");

  // UI state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Send email modal
  const [sendModal, setSendModal] = useState<{ match: Match } | null>(null);
  const [sendTone, setSendTone] = useState<SendTone>("search");
  const [personalNote, setPersonalNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState<{ matchId: number } | null>(null);

  // Send history per match
  const [sendHistory, setSendHistory] = useState<Record<number, SendLog[]>>({});
  const [replyCheckNote, setReplyCheckNote] = useState("");

  // Throttle reply checks to once per 5 min
  const lastReplyCheck = useRef<number>(0);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (confidence) params.set("confidence", confidence);
      if (minScore > 0) params.set("minScore", String(minScore));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (batchFilter) params.set("batchId", String(batchFilter));
      if (sortBy !== "score") params.set("sortBy", sortBy);
      const res = await fetch(`/api/matches/list?${params}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [confidence, minScore, search, statusFilter, batchFilter, sortBy]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/matches/batches");
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, []);

  // Check for replies (throttled)
  const checkReplies = useCallback(async () => {
    const now = Date.now();
    if (now - lastReplyCheck.current < 5 * 60 * 1000) return;
    lastReplyCheck.current = now;
    try {
      const res = await fetch("/api/matching/check-replies");
      const data = await res.json();
      if (data.newReplies > 0) {
        setReplyCheckNote(`${data.newReplies} new repl${data.newReplies === 1 ? "y" : "ies"} detected`);
        fetchMatches();
      }
    } catch { /* gmail not configured yet */ }
  }, [fetchMatches]);

  useEffect(() => { fetchMatches(); fetchBatches(); checkReplies(); }, [fetchMatches, fetchBatches, checkReplies]);

  // Fetch send history for a match when expanded
  const fetchSendHistory = useCallback(async (leadId: number) => {
    if (!leadId || sendHistory[leadId]) return;
    try {
      const res = await fetch(`/api/matching/send-history?leadId=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setSendHistory(prev => ({ ...prev, [leadId]: data.history || [] }));
      }
    } catch { /* not built yet, silent */ }
  }, [sendHistory]);

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
      if (data.ok) { setUploadText(""); fetchMatches(); fetchBatches(); }
    } catch (e: any) { setUploadResult({ ok: false, error: e.message }); }
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

  /* ── Send email handler — opens via Apple Mail yotcrm:// scheme ── */
  const handleSendEmail = async () => {
    if (!sendModal) return;
    const { match } = sendModal;
    if (!match.lead_email) { alert("No email address on file for this lead."); return; }

    const l = match.listing;
    const firstName = (match.lead_name || "").split(" ")[0] || "there";
    const boatTitle = l ? `${l.year || ""} ${l.make || ""} ${l.model || ""}`.trim() : "vessel";

    // Build subject + body client-side using the selected tone
    const toneIntros: Record<string, string> = {
      search: `I was running through my active searches this week and this one immediately stood out as worth putting in front of you —`,
      mls:    `I was combing the MLS this morning and this one caught my eye — I thought of you right away:`,
      listed: `This just came to market and I wanted you to see it first:`,
      value:  `I came across something that I think represents exceptional value for your criteria:`,
      reduce: `A price reduction just came through on something I've had my eye on for you:`,
    };

    const intro = toneIntros[sendTone] || toneIntros.search;
    const specLines = [
      l?.loa           ? `LOA: ${l.loa}`                     : null,
      l?.year          ? `Year: ${l.year}`                    : null,
      l?.asking_price  ? `Asking: ${l.asking_price}`          : null,
      l?.location      ? `Location: ${l.location}`            : null,
      (l as any)?.brokerage ? `Listed by: ${(l as any).brokerage}` : null,
    ].filter(Boolean).join("\n");

    const listingLink = l?.denison_url
      ? `\n\nView listing: ${l.denison_url}`
      : ""; // resolved async below if needed

    const body = [
      `Hi ${firstName},`,
      ``,
      intro,
      ``,
      boatTitle,
      specLines,
      listingLink,
      personalNote.trim() ? `\n${personalNote.trim()}` : "",
      ``,
      `Happy to pull together more detail, arrange a showing, or get on a call whenever works for you. Just reply and let me know.`,
      ``,
      `Best,`,
      `Will Noftsinger`,
      `Denison Yachting`,
      `850.461.3342 | WN@DenisonYachting.com`,
    ].filter(l => l !== null).join("\n");

    const subject = `${boatTitle} — Worth a Look`;

    setSending(true);
    try {
      // Resolve a Denison URL if not already cached
      let resolvedListingUrl = l?.denison_url || "";
      if (!resolvedListingUrl && l?.listing_url) {
        try {
          const lookup = await fetch("/api/matches/denison-lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listing_url: l.listing_url,
              make: l.make, model: l.model,
              year: l.year, loa: l.loa,
              listing_id: l.id,
            }),
          }).then(r => r.json());
          // Only use URL if it's a real listing page — not a fallback search
          if (lookup.ok && lookup.url && lookup.method === "puppeteer_id_match") {
            resolvedListingUrl = lookup.url;
          }
        } catch { /* non-fatal */ }
      }

      const resolvedLink = resolvedListingUrl ? `\n\nView listing: ${resolvedListingUrl}` : "";

      // Rebuild body with resolved URL
      const bodyFinal = [
        `Hi ${firstName},`,
        ``,
        intro,
        ``,
        boatTitle,
        specLines,
        resolvedLink,
        personalNote.trim() ? `\n${personalNote.trim()}` : "",
        ``,
        `Happy to pull together more detail, arrange a showing, or get on a call whenever works for you. Just reply and let me know.`,
        ``,
        `Best,`,
        `Will Noftsinger`,
        `Denison Yachting`,
        `850.461.3342 | WN@DenisonYachting.com`,
      ].filter(l => l !== null).join("\n");

      // Use yotcrm:// scheme → YotCRM Compose.app → Mail.app with WN@DenisonYachting.com
      const payload = {
        to: match.lead_email,
        subject,
        body: bodyFinal,
        make: l?.make || "Yacht",
      };
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      window.location.href = `yotcrm://compose?data=${encoded}`;

      // Mark contacted after brief delay (give time for scheme to fire)
      setTimeout(async () => {
        await updateStatus(match.id, "contacted");
        setSendDone({ matchId: match.id });
        setSendModal(null);
        setPersonalNote("");
        setSendTone("search");
        if (match.lead_id) setSendHistory(prev => { const n = {...prev}; delete n[match.lead_id!]; return n; });
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Failed to open Mail");
    } finally {
      setSending(false);
    }
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
            {replyCheckNote && (
              <p className="text-xs mt-1 font-medium" style={{ color: "#059669" }}>
                <Reply className="w-3 h-3 inline mr-1" />{replyCheckNote}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!confirm("Auto-populate buyer criteria from existing boat records for all leads? This only fills empty fields.")) return;
                const res = await fetch("/api/clients/infer-criteria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                const d = await res.json();
                alert(d.message || (d.ok ? "Done" : d.error));
                if (d.ok) fetchMatches();
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
              style={{ minHeight: 44, color: "var(--navy-600)", background: "var(--card)" }}
              title="Fill empty criteria fields from each lead's boat record — budget ±30%, LOA ±20%, year ±5, make exact"
            >
              <RefreshCw className="w-4 h-4" /> Infer Criteria
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="btn btn-primary flex items-center gap-2"
              style={{ minHeight: 44 }}
            >
              <Upload className="w-4 h-4" /> Process New Email
            </button>
          </div>
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

              <div className="flex flex-wrap gap-2 mt-3">
                {/* ── Sort pills ── */}
                {[
                  { id: "score",          label: "Strongest Match" },
                  { id: "newest_listing", label: "Newest Listing"  },
                  { id: "active_buyer",   label: "Active Buyer"    },
                  { id: "new_to_market",  label: "New to Market"   },
                  { id: "stale",          label: "Stale / Low"     },
                ].map(s => (
                  <button key={s.id} onClick={() => setSortBy(s.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={{
                      background: sortBy === s.id ? "var(--navy-800)" : "var(--sand-100)",
                      color: sortBy === s.id ? "#fff" : "var(--navy-500)",
                      border: `1px solid ${sortBy === s.id ? "var(--navy-700)" : "var(--border)"}`,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
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
                  const hasSent = sendDone?.matchId === match.id;
                  const history = match.lead_id ? sendHistory[match.lead_id] : undefined;

                  return (
                    <div key={match.id} className="rounded-xl overflow-hidden transition-shadow"
                      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: expanded ? "var(--shadow-lg)" : "none" }}>
                      <button
                        onClick={() => {
                          const next = expanded ? null : match.id;
                          setExpandedId(next);
                          if (next && match.lead_id) fetchSendHistory(match.lead_id);
                        }}
                        className="w-full text-left p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{prospectName}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: sBadge.color + "18", color: sBadge.color }}>
                                {sBadge.label}
                              </span>
                              {match.iso_id && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(139,92,246,0.12)", color: "#7c3aed" }}>ISO</span>
                              )}
                              {hasSent && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1" style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                                  <CheckCircle className="w-2.5 h-2.5" /> Email sent
                                </span>
                              )}
                            </div>
                            <p className="text-sm mt-1" style={{ color: "var(--navy-500)" }}>
                              {boatTitle}{l?.loa ? ` · ${l.loa}` : ""}{l?.asking_price ? ` · ${l.asking_price}` : ""}{l?.location ? ` · ${l.location}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {reasons.slice(0, 3).map((r: string, i: number) => (
                                <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(16,185,129,0.08)", color: "#059669" }}>{r}</span>
                              ))}
                              {conflicts.slice(0, 2).map((c: string, i: number) => (
                                <span key={`c-${i}`} className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5" style={{ background: "rgba(245,158,11,0.08)", color: "#d97706" }}>
                                  <AlertTriangle className="w-2.5 h-2.5" /> {c}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col items-center shrink-0">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold"
                              style={{ background: sColor + "18", color: sColor, border: `2px solid ${sColor}40` }}>
                              {match.match_score}
                            </div>
                            <span className="text-[10px] font-semibold mt-1" style={{ color: cColor.text }}>{match.confidence}</span>
                          </div>
                        </div>
                      </button>

                      {/* ── Expanded Detail Panel ── */}
                      {expanded && (
                        <div className="px-4 pb-4 pt-0" style={{ borderTop: "1px solid var(--border)" }}>
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
                                <div className="flex flex-col gap-1 mt-1">
                                  <ViewListingButton listing={l} />
                                  <a href={l.listing_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs"
                                    style={{ color: "var(--navy-400)" }}>
                                    <ExternalLink className="w-3 h-3" /> BoatWizard (broker portal)
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

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

                          {/* Send history */}
                          {history && history.length > 0 && (
                            <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
                              <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Email History</h4>
                              <div className="space-y-1.5">
                                {history.map(h => (
                                  <div key={h.id} className="flex items-center justify-between text-xs rounded-lg px-3 py-2"
                                    style={{ background: h.repliedAt ? "rgba(16,185,129,0.06)" : "var(--sand-50,rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
                                    <div>
                                      <span className="font-medium" style={{ color: "var(--foreground)" }}>
                                        {h.vesselYear} {h.vesselMake} {h.vesselModel}
                                      </span>
                                      <span className="ml-2" style={{ color: "var(--navy-400)" }}>· {h.tone}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span style={{ color: "var(--navy-400)" }}>{fmtDate(h.sentAt)}</span>
                                      {h.repliedAt && (
                                        <span className="flex items-center gap-0.5 font-semibold" style={{ color: "#059669" }}>
                                          <Reply className="w-3 h-3" /> Replied
                                        </span>
                                      )}
                                    </div>
                                  </div>
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
                              <button
                                onClick={() => { setSendModal({ match }); setSendTone("search"); setPersonalNote(""); }}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6", minHeight: 48 }}>
                                <Send className="w-4 h-4" /> Send Email
                              </button>
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

        {/* ════════════ SEND EMAIL MODAL ════════════ */}
        {sendModal && (
          <div className="fixed inset-0" style={{ zIndex: 9999 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => !sending && setSendModal(null)} />
            <div className="relative mx-auto mt-[6vh] w-[92%] max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
              {/* Header */}
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>Send Listing Email</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>
                    To: {sendModal.match.lead_name} · {sendModal.match.lead_email}
                  </p>
                </div>
                <button onClick={() => !sending && setSendModal(null)} className="p-2 rounded-lg" style={{ color: "var(--navy-400)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Vessel summary */}
              {sendModal.match.listing && (
                <div className="px-4 py-2.5 text-xs" style={{ background: "var(--sand-50, rgba(0,0,0,0.02))", borderBottom: "1px solid var(--border)" }}>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                    {sendModal.match.listing.year} {sendModal.match.listing.make} {sendModal.match.listing.model}
                  </span>
                  {sendModal.match.listing.asking_price && (
                    <span style={{ color: "var(--navy-500)" }}> · {sendModal.match.listing.asking_price}</span>
                  )}
                  {sendModal.match.listing.location && (
                    <span style={{ color: "var(--navy-400)" }}> · {sendModal.match.listing.location}</span>
                  )}
                </div>
              )}

              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Tone selector */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--navy-400)" }}>Opening Tone</p>
                  <div className="space-y-2">
                    {TONE_OPTIONS.map(t => (
                      <button key={t.id} type="button" onClick={() => setSendTone(t.id)}
                        className="w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all"
                        style={{
                          borderColor: sendTone === t.id ? "var(--brass-400)" : "var(--border)",
                          background: sendTone === t.id ? "rgba(184,147,58,0.06)" : "transparent",
                        }}>
                        <div className="text-sm font-semibold" style={{ color: sendTone === t.id ? "var(--brass-500,#9a7730)" : "var(--foreground)" }}>
                          {t.label}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Personal note */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--navy-400)" }}>
                    Personal Note <span style={{ color: "var(--navy-300)", fontWeight: 400, textTransform: "none" }}>(optional — 1–2 sentences, your voice)</span>
                  </label>
                  <textarea
                    value={personalNote}
                    onChange={e => setPersonalNote(e.target.value)}
                    placeholder="e.g. The range on this one is exceptional for the price point — I think it's worth a serious look."
                    rows={3}
                    className="form-input w-full mt-1.5 resize-none"
                    style={{ fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                <button onClick={() => !sending && setSendModal(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--sand-100)", color: "var(--navy-600)", minHeight: 44 }}>
                  Cancel
                </button>
                <button onClick={handleSendEmail} disabled={sending}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white"
                  style={{ background: sending ? "var(--navy-400)" : "var(--brass-400)", minHeight: 44, opacity: sending ? 0.7 : 1 }}>
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? "Sending…" : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ UPLOAD MODAL ════════════ */}
        {showUpload && (
          <div className="fixed inset-0" style={{ zIndex: 9999 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowUpload(false); setUploadResult(null); }} />
            <div className="relative mx-auto mt-[10vh] w-[92%] max-w-lg rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>Process New Listings Email</h2>
                <button onClick={() => { setShowUpload(false); setUploadResult(null); }} className="p-2 rounded-lg" style={{ color: "var(--navy-400)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <div className="mt-3 p-3 rounded-lg text-sm"
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
                    ) : `✗ ${uploadResult.error}`}
                  </div>
                )}
              </div>
              <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                <button onClick={() => { setShowUpload(false); setUploadResult(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--sand-100)", color: "var(--navy-600)", minHeight: 44 }}>
                  Cancel
                </button>
                <button onClick={handleUpload} disabled={uploading || !uploadText.trim()}
                  className="btn btn-primary px-4 py-2 text-sm font-medium"
                  style={{ minHeight: 44, opacity: uploading || !uploadText.trim() ? 0.5 : 1 }}>
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
