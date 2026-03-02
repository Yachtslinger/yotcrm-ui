"use client";

import React, { useState, useEffect, useCallback } from "react";
import PageShell from "@/app/components/PageShell";
import { useToast } from "@/app/components/ToastProvider";
import {
  Shield, Search, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, HelpCircle, XCircle,
  ExternalLink, Sliders, User, Building2, Plane,
  Ship, FileWarning, Activity, Clock, Eye,
} from "lucide-react";

/* ═══════════════════════════════════════════
   Lighthouse — Buyer Intelligence Dashboard
   ═══════════════════════════════════════════ */

/* ─── Types ─── */
type Profile = {
  id: number;
  lead_id: number;
  first_name: string;
  last_name: string;
  email: string;
  score: number;
  score_band: string;
  band_label: string;
  score_breakdown: { factor: string; label: string; points: number; reason: string }[];
  enrichment_status: string;
  last_enriched_at: string;
  manual_override: number;
  created_at: string;
};

type DetailProfile = Profile & {
  identity_data: {
    employment_history?: { company: string; role: string; years?: string }[];
    corporate_roles?: { company: string; title: string }[];
    business_ownership?: { company: string; jurisdiction?: string; status?: string }[];
    years_active?: number | null;
    cross_source_consistency?: number;
  };
  capital_data: {
    executive_roles?: boolean;
    prior_exits?: { company: string; detail?: string }[];
    vessel_registrations?: { name: string; hin?: string }[];
    aircraft_registrations?: { n_number: string; type?: string }[];
    property_signals?: { location: string; estimated_value?: string }[];
    industry_indicators?: string[];
  };
  risk_data: {
    litigation_count?: number;
    bankruptcy_flag?: boolean;
    fraud_indicators?: { detail: string }[];
    sanctions_flag?: boolean;
    sanctions_detail?: string | null;
    regulatory_actions?: { detail: string }[];
  };
  engagement_data: {
    email_tone?: string | null;
    urgency_level?: string | null;
    inquiry_specificity?: string | null;
    response_time_avg_hours?: number | null;
    follow_up_count?: number;
  };
  summary: string;
  strategy_notes: string;
  leverage_notes: string;
  override_score: number | null;
  override_reason: string;
};

type Source = {
  id: number;
  source_type: string;
  source_url: string;
  source_label: string;
  layer: string;
  data_key: string;
  data_value: string;
  confidence: number;
  fetched_at: string;
};

type AuditEntry = {
  action: string;
  actor: string;
  detail: string;
  created_at: string;
};

/* ─── Helpers ─── */
const BAND_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  high_confidence:    { bg: "rgba(16,185,129,0.12)", text: "#059669", icon: CheckCircle },
  likely_legitimate:  { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", icon: Shield },
  unverified:         { bg: "rgba(245,158,11,0.12)", text: "#d97706", icon: HelpCircle },
  elevated_risk:      { bg: "rgba(239,68,68,0.12)",  text: "#ef4444", icon: AlertTriangle },
};

function bandStyle(band: string) {
  return BAND_STYLES[band] || BAND_STYLES.unverified;
}

function scoreGradient(score: number) {
  if (score >= 80) return "from-emerald-500 to-emerald-600";
  if (score >= 60) return "from-blue-500 to-blue-600";
  if (score >= 40) return "from-amber-500 to-amber-600";
  return "from-red-500 to-red-600";
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/* ═══════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════ */
export default function LighthousePage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailProfile | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [enriching, setEnriching] = useState<Set<number>>(new Set());

  const fetchProfiles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("band", filter);
      const res = await fetch(`/api/intel/profiles?${params}`);
      const data = await res.json();
      if (data.ok) setProfiles(data.profiles);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const fetchDetail = useCallback(async (leadId: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/intel/profile?lead_id=${leadId}`);
      const data = await res.json();
      if (data.ok && data.profile) {
        setDetail({ ...data.profile, first_name: "", last_name: "", email: "" });
        setSources(data.sources || []);
        setAuditLog(data.audit_log || []);
        // Fill in name from profiles list
        const p = profiles.find(p => p.lead_id === leadId);
        if (p && data.profile) {
          setDetail(prev => prev ? { ...prev, first_name: p.first_name, last_name: p.last_name, email: p.email } : prev);
        }
      }
    } catch { toast("Failed to load profile"); }
    finally { setDetailLoading(false); }
  }, [profiles, toast]);

  const triggerEnrich = async (leadId: number) => {
    setEnriching(prev => new Set(prev).add(leadId));
    try {
      const res = await fetch("/api/intel/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, action: "enrich" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Enriched — Score: ${data.score} (${data.band})`);
        fetchProfiles();
        if (selected === leadId) fetchDetail(leadId);
      } else {
        toast(data.error || "Enrichment failed");
      }
    } catch { toast("Enrichment failed"); }
    finally { setEnriching(prev => { const s = new Set(prev); s.delete(leadId); return s; }); }
  };

  const handleSelect = (leadId: number) => {
    if (selected === leadId) {
      setSelected(null);
      setDetail(null);
    } else {
      setSelected(leadId);
      fetchDetail(leadId);
    }
  };

  // Filtered and searched profiles
  const filtered = profiles.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (!name.includes(q) && !p.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const stats = {
    total: profiles.length,
    high: profiles.filter(p => p.score_band === "high_confidence").length,
    likely: profiles.filter(p => p.score_band === "likely_legitimate").length,
    unverified: profiles.filter(p => p.score_band === "unverified").length,
    risk: profiles.filter(p => p.score_band === "elevated_risk").length,
  };

  return (
    <PageShell
      title="Lighthouse"
      subtitle={`${stats.total} profiled leads`}
      maxWidth="wide"
      actions={
        <button onClick={fetchProfiles} className="btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      }
    >
      {/* ─── Stats Bar ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "High Confidence", count: stats.high, band: "high_confidence" },
          { label: "Likely Legitimate", count: stats.likely, band: "likely_legitimate" },
          { label: "Unverified", count: stats.unverified, band: "unverified" },
          { label: "Elevated Risk", count: stats.risk, band: "elevated_risk" },
        ].map(s => {
          const style = bandStyle(s.band);
          const Icon = style.icon;
          return (
            <button key={s.band}
              onClick={() => setFilter(filter === s.band ? "all" : s.band)}
              className={`card-elevated p-4 text-left transition-all ${filter === s.band ? "ring-2" : ""}`}
              style={{ borderColor: filter === s.band ? style.text : undefined, ringColor: style.text }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: style.text }} />
                <span className="text-2xl font-bold" style={{ color: style.text }}>{s.count}</span>
              </div>
              <div className="text-xs font-medium" style={{ color: "var(--navy-500)" }}>{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* ─── Search ─── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--navy-400)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }} />
        </div>
        {filter !== "all" && (
          <button onClick={() => setFilter("all")}
            className="text-xs px-3 py-2 rounded-lg font-semibold"
            style={{ background: "var(--sand-100)", color: "var(--navy-600)" }}>
            Clear Filter
          </button>
        )}
      </div>

      {/* ─── Profiles List ─── */}
      {loading ? (
        <div className="card-elevated p-12 text-center">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: "var(--navy-400)" }} />
          <div className="text-sm" style={{ color: "var(--navy-500)" }}>Loading profiles...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--navy-500)" }}>
            {profiles.length === 0 ? "No enrichment profiles yet" : "No matches for filter"}
          </div>
          <div className="text-xs" style={{ color: "var(--navy-400)" }}>
            {profiles.length === 0
              ? "Enrich a lead from the Leads page or use the API to trigger enrichment"
              : "Try adjusting your search or filter"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const style = bandStyle(p.score_band);
            const Icon = style.icon;
            const isSelected = selected === p.lead_id;
            return (
              <div key={p.id}>
                {/* Row */}
                <button onClick={() => handleSelect(p.lead_id)}
                  className={`w-full card-elevated p-4 text-left transition-all hover:shadow-md ${isSelected ? "ring-2" : ""}`}
                  style={{ borderColor: isSelected ? "var(--brass-400)" : undefined }}>
                  <div className="flex items-center gap-4">
                    {/* Score circle */}
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${scoreGradient(p.score)} flex items-center justify-center shrink-0`}>
                      <span className="text-white text-sm font-bold">{p.score}</span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                          {p.first_name} {p.last_name}
                        </span>
                        {p.manual_override === 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: "rgba(168,85,247,0.12)", color: "#8b5cf6" }}>OVERRIDE</span>
                        )}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--navy-400)" }}>{p.email}</div>
                    </div>
                    {/* Band badge */}
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
                      style={{ background: style.bg, color: style.text }}>
                      <Icon className="w-3.5 h-3.5" />
                      {p.band_label}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); triggerEnrich(p.lead_id); }}
                        disabled={enriching.has(p.lead_id)}
                        className="p-2 rounded-lg transition-colors hover:bg-[var(--sand-100)]"
                        title="Re-enrich">
                        <RefreshCw className={`w-4 h-4 ${enriching.has(p.lead_id) ? "animate-spin" : ""}`}
                          style={{ color: "var(--navy-400)" }} />
                      </button>
                      {isSelected ? <ChevronUp className="w-4 h-4" style={{ color: "var(--navy-400)" }} />
                        : <ChevronDown className="w-4 h-4" style={{ color: "var(--navy-400)" }} />}
                    </div>
                  </div>
                  {/* Breakdown preview */}
                  {p.score_breakdown.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-16">
                      {p.score_breakdown.slice(0, 4).map((b, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: b.points > 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                            color: b.points > 0 ? "#059669" : "#ef4444",
                          }}>
                          {b.points > 0 ? "+" : ""}{b.points} {b.label}
                        </span>
                      ))}
                      {p.score_breakdown.length > 4 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ color: "var(--navy-400)" }}>
                          +{p.score_breakdown.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </button>

                {/* ─── Expanded Detail Panel ─── */}
                {isSelected && (
                  <DetailPanel
                    detail={detail}
                    sources={sources}
                    auditLog={auditLog}
                    loading={detailLoading}
                    onEnrich={() => triggerEnrich(p.lead_id)}
                    enriching={enriching.has(p.lead_id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Disclaimer ─── */}
      <div className="mt-8 text-center text-[10px] px-4 py-2 rounded-lg"
        style={{ background: "var(--sand-50)", color: "var(--navy-400)" }}>
        Profile generated from public sources. Not financial verification. Internal use only.
      </div>
    </PageShell>
  );
}

/* ═══════════════════════════════════════════
   DETAIL PANEL — Expanded Intelligence View
   ═══════════════════════════════════════════ */
function DetailPanel({
  detail, sources, auditLog, loading, onEnrich, enriching,
}: {
  detail: DetailProfile | null;
  sources: Source[];
  auditLog: AuditEntry[];
  loading: boolean;
  onEnrich: () => void;
  enriching: boolean;
}) {
  const [tab, setTab] = useState<"overview" | "sources" | "audit">("overview");

  if (loading) {
    return (
      <div className="card-elevated mt-1 p-8 text-center">
        <RefreshCw className="w-5 h-5 mx-auto animate-spin" style={{ color: "var(--navy-400)" }} />
        <div className="text-xs mt-2" style={{ color: "var(--navy-500)" }}>Loading intelligence...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="card-elevated mt-1 p-8 text-center">
        <Shield className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--navy-300)" }} />
        <div className="text-sm font-semibold mb-2" style={{ color: "var(--navy-500)" }}>No profile yet</div>
        <button onClick={onEnrich} disabled={enriching}
          className="btn-primary text-xs">
          {enriching ? "Enriching..." : "Run Enrichment"}
        </button>
      </div>
    );
  }

  const identity = detail.identity_data || {};
  const capital = detail.capital_data || {};
  const risk = detail.risk_data || {};
  const engagement = detail.engagement_data || {};

  return (
    <div className="card-elevated mt-1 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
        {(["overview", "sources", "audit"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              color: tab === t ? "var(--brass-500)" : "var(--navy-400)",
              borderBottom: tab === t ? "2px solid var(--brass-400)" : "2px solid transparent",
            }}>
            {t === "overview" ? "Intelligence" : t === "sources" ? `Sources (${sources.length})` : `Audit (${auditLog.length})`}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Summary */}
            {detail.summary && (
              <div>
                <SectionLabel icon={Eye} label="Intelligence Summary" />
                <p className="text-sm leading-relaxed" style={{ color: "var(--navy-700)" }}>{detail.summary}</p>
              </div>
            )}

            {/* Identity Layer */}
            <div>
              <SectionLabel icon={User} label="Identity" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(identity.corporate_roles || []).length > 0 && (
                  <DataCard label="Corporate Roles">
                    {identity.corporate_roles!.map((r, i) => (
                      <div key={i} className="text-sm">{r.title} — <span style={{ color: "var(--navy-400)" }}>{r.company}</span></div>
                    ))}
                  </DataCard>
                )}
                {(identity.business_ownership || []).length > 0 && (
                  <DataCard label="Business Ownership">
                    {identity.business_ownership!.map((b, i) => (
                      <div key={i} className="text-sm">
                        {b.company} {b.jurisdiction && <span style={{ color: "var(--navy-400)" }}>({b.jurisdiction})</span>}
                        {b.status && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ background: "var(--sand-100)" }}>{b.status}</span>}
                      </div>
                    ))}
                  </DataCard>
                )}
                {identity.years_active != null && (
                  <DataCard label="Years Active">
                    <div className="text-sm font-semibold">{identity.years_active} years</div>
                  </DataCard>
                )}
                {identity.cross_source_consistency != null && identity.cross_source_consistency > 0 && (
                  <DataCard label="Cross-Source Consistency">
                    <div className="text-sm font-semibold">{identity.cross_source_consistency}%</div>
                  </DataCard>
                )}
              </div>
            </div>

            {/* Capital Layer */}
            <div>
              <SectionLabel icon={Building2} label="Capital Signals" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(capital.vessel_registrations || []).length > 0 && (
                  <DataCard label="Vessel Registrations" icon={Ship}>
                    {capital.vessel_registrations!.map((v, i) => (
                      <div key={i} className="text-sm">{v.name} {v.hin && <span style={{ color: "var(--navy-400)" }}>HIN: {v.hin}</span>}</div>
                    ))}
                  </DataCard>
                )}
                {(capital.aircraft_registrations || []).length > 0 && (
                  <DataCard label="Aircraft Registrations" icon={Plane}>
                    {capital.aircraft_registrations!.map((a, i) => (
                      <div key={i} className="text-sm">{a.n_number} {a.type && <span style={{ color: "var(--navy-400)" }}>{a.type}</span>}</div>
                    ))}
                  </DataCard>
                )}
                {(capital.property_signals || []).length > 0 && (
                  <DataCard label="Property Signals">
                    {capital.property_signals!.map((p, i) => (
                      <div key={i} className="text-sm">{p.location} {p.estimated_value && <span className="font-semibold">{p.estimated_value}</span>}</div>
                    ))}
                  </DataCard>
                )}
                {(capital.prior_exits || []).length > 0 && (
                  <DataCard label="Prior Exits / Acquisitions">
                    {capital.prior_exits!.map((e, i) => (
                      <div key={i} className="text-sm">{e.company} {e.detail && <span style={{ color: "var(--navy-400)" }}>{e.detail}</span>}</div>
                    ))}
                  </DataCard>
                )}
              </div>
            </div>

            {/* Risk Layer */}
            <div>
              <SectionLabel icon={AlertTriangle} label="Risk & Compliance" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {risk.sanctions_flag && (
                  <div className="p-3 rounded-xl border-2" style={{ borderColor: "#ef4444", background: "rgba(239,68,68,0.06)" }}>
                    <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#ef4444" }}>
                      <XCircle className="w-4 h-4" /> OFAC SANCTIONS MATCH
                    </div>
                    {risk.sanctions_detail && <div className="text-xs mt-1" style={{ color: "#ef4444" }}>{risk.sanctions_detail}</div>}
                  </div>
                )}
                {risk.bankruptcy_flag && (
                  <DataCard label="Bankruptcy">
                    <div className="text-sm font-semibold" style={{ color: "#ef4444" }}>Bankruptcy record found</div>
                  </DataCard>
                )}
                {(risk.fraud_indicators || []).length > 0 && (
                  <DataCard label="Fraud Indicators">
                    {risk.fraud_indicators!.map((f, i) => (
                      <div key={i} className="text-sm" style={{ color: "#ef4444" }}>{f.detail}</div>
                    ))}
                  </DataCard>
                )}
                {risk.litigation_count != null && risk.litigation_count > 0 && (
                  <DataCard label="Litigation">
                    <div className="text-sm">{risk.litigation_count} case(s) found</div>
                  </DataCard>
                )}
                {!risk.sanctions_flag && !risk.bankruptcy_flag && (risk.fraud_indicators || []).length === 0 && (risk.litigation_count || 0) === 0 && (
                  <div className="text-sm flex items-center gap-2 p-3" style={{ color: "#059669" }}>
                    <CheckCircle className="w-4 h-4" /> No risk flags detected
                  </div>
                )}
              </div>
            </div>

            {/* Engagement Layer */}
            {(engagement.email_tone || engagement.urgency_level || engagement.inquiry_specificity) && (
              <div>
                <SectionLabel icon={Activity} label="Engagement Signals" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {engagement.email_tone && <MiniStat label="Email Tone" value={engagement.email_tone} />}
                  {engagement.urgency_level && <MiniStat label="Urgency" value={engagement.urgency_level} />}
                  {engagement.inquiry_specificity && <MiniStat label="Specificity" value={engagement.inquiry_specificity} />}
                  {engagement.response_time_avg_hours != null && (
                    <MiniStat label="Avg Response" value={`${engagement.response_time_avg_hours.toFixed(1)}h`} />
                  )}
                </div>
              </div>
            )}

            {/* Strategy & Leverage */}
            {(detail.strategy_notes || detail.leverage_notes) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detail.strategy_notes && (
                  <div className="p-3 rounded-xl" style={{ background: "var(--sand-50)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>
                      Recommended Strategy
                    </div>
                    <p className="text-sm" style={{ color: "var(--navy-700)" }}>{detail.strategy_notes}</p>
                  </div>
                )}
                {detail.leverage_notes && (
                  <div className="p-3 rounded-xl" style={{ background: "var(--sand-50)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>
                      Negotiation Leverage
                    </div>
                    <p className="text-sm" style={{ color: "var(--navy-700)" }}>{detail.leverage_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Score Breakdown */}
            {detail.score_breakdown.length > 0 && (
              <div>
                <SectionLabel icon={Sliders} label="Score Breakdown" />
                <div className="space-y-1">
                  {detail.score_breakdown.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg text-sm"
                      style={{ background: i % 2 === 0 ? "var(--sand-50)" : "transparent" }}>
                      <span className="font-mono text-xs w-10 text-right font-bold"
                        style={{ color: b.points > 0 ? "#059669" : "#ef4444" }}>
                        {b.points > 0 ? "+" : ""}{b.points}
                      </span>
                      <span className="font-medium" style={{ color: "var(--navy-700)" }}>{b.label}</span>
                      {b.reason && <span className="text-xs ml-auto" style={{ color: "var(--navy-400)" }}>{b.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Enrichment metadata */}
            <div className="flex items-center gap-4 pt-3 border-t text-[10px]" style={{ borderColor: "var(--border)", color: "var(--navy-400)" }}>
              <span>Last enriched: {fmtDate(detail.last_enriched_at)}</span>
              <span>Status: {detail.enrichment_status}</span>
              {detail.manual_override === 1 && (
                <span style={{ color: "#8b5cf6" }}>Override: {detail.override_score} — {detail.override_reason}</span>
              )}
            </div>
          </div>
        )}

        {/* Sources Tab */}
        {tab === "sources" && (
          <div className="space-y-2">
            {sources.length === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: "var(--navy-400)" }}>No sources collected yet</div>
            ) : sources.map(s => (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "var(--sand-50)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: `rgba(59,130,246,${s.confidence / 200})`, color: "#3b82f6" }}>
                  {s.confidence}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase" style={{ color: "var(--navy-500)" }}>{s.source_type}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--sand-200)", color: "var(--navy-500)" }}>{s.layer}</span>
                  </div>
                  <div className="text-sm mt-0.5" style={{ color: "var(--navy-700)" }}>
                    <span className="font-medium">{s.data_key}:</span> {s.data_value}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: "var(--navy-400)" }}>
                    <span>{fmtDate(s.fetched_at)}</span>
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 hover:underline" style={{ color: "var(--sea-500)" }}>
                        Source <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Audit Tab */}
        {tab === "audit" && (
          <div className="space-y-1">
            {auditLog.length === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: "var(--navy-400)" }}>No audit events</div>
            ) : auditLog.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg text-sm"
                style={{ background: i % 2 === 0 ? "var(--sand-50)" : "transparent" }}>
                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--navy-400)" }} />
                <span className="font-mono text-xs" style={{ color: "var(--navy-400)" }}>{fmtDate(a.created_at)}</span>
                <span className="font-medium" style={{ color: "var(--navy-600)" }}>{a.action}</span>
                <span className="text-xs" style={{ color: "var(--navy-400)" }}>by {a.actor}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════ */

function SectionLabel({ icon: Icon, label }: { icon: typeof Shield; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4" style={{ color: "var(--brass-400)" }} />
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--navy-500)" }}>{label}</span>
    </div>
  );
}

function DataCard({ label, children, icon: Icon }: {
  label: string; children: React.ReactNode; icon?: typeof Shield;
}) {
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--sand-50)" }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: "var(--navy-400)" }} />}
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--navy-400)" }}>{label}</div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg text-center" style={{ background: "var(--sand-50)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--navy-400)" }}>{label}</div>
      <div className="text-sm font-semibold capitalize" style={{ color: "var(--navy-700)" }}>{value}</div>
    </div>
  );
}
