"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import PageShell from "../components/PageShell";
import {
  Users, CheckSquare, FileText, Link2, TrendingUp,
  ArrowRight, Mail, Lock, Anchor, DollarSign,
  BarChart3, Activity, Zap,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

type Lead = {
  id: string; first_name: string; last_name: string; email: string;
  phone: string; status: string; source: string; notes: string;
  created_at: string; boat_make: string; boat_model: string;
  boat_year: string; boat_price: string;
};
type Todo = { id: number; text: string; completed: number; priority: string; lead_name?: string };
type Match = {
  id: number; owner_name?: string; buyer_name?: string; match_score: number;
  owner_year?: string; owner_length?: string; owner_make?: string; owner_model?: string;
  owner_value?: string; status: string; match_reasons?: string;
};
type Analytics = {
  totals: { leads: number; boats: number; openTodos: number; pipelineValue: number };
  velocity: { today: number; week: number; month: number };
  statusBreakdown: { status: string; count: number }[];
  pipelineValue: Record<string, number>;
  sources: { source: string; count: number }[];
  weeklyTrend: { week: string; count: number }[];
  priceRanges: { label: string; count: number }[];
  topBoats: {
    make: string; model: string; year: string; length: string;
    price: string; numericPrice: number; lead_name: string;
    lead_id: number; status: string;
  }[];
};

const STATUS_DOT: Record<string, string> = {
  new: "status-new", hot: "status-hot", warm: "status-warm",
  cold: "status-cold", nurture: "status-nurture", other: "status-other",
};

const SOURCE_COLORS: Record<string, string> = {
  Denison: "var(--brass-400)",
  YachtWorld: "var(--sea-500)",
  JamesEdition: "#e97451",
  BoatsGroup: "#8b5cf6",
  RightBoat: "#10b981",
  Manual: "var(--navy-400)",
};

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newMatches, setNewMatches] = useState<Match[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = () => {
    Promise.all([
      fetch("/api/clients").then(r => r.json()),
      fetch("/api/todos").then(r => r.json()),
      fetch("/api/market/matches?status=new").then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/analytics").then(r => r.json()).catch(() => null),
    ]).then(([cData, tData, mData, aData]) => {
      const contacts = (cData.contacts || []).map((c: any) => ({
        ...c, id: String(c.id),
        first_name: c.first_name || c.firstName || "",
        last_name: c.last_name || c.lastName || "",
      }));
      setLeads(contacts);
      setTodos((tData.todos || []).filter((t: Todo) => !t.completed));
      if (mData.ok) setNewMatches((mData.matches || []).slice(0, 5));
      if (aData?.ok) setAnalytics(aData);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchDashboard();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const byStatus = leads.reduce<Record<string, number>>((acc, l) => {
    const s = (l.status || "other").toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const recent = [...leads]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5);

  if (loading) return <DashboardSkeleton />;

  const a = analytics;
  const maxSource = a ? Math.max(...a.sources.map(s => s.count), 1) : 1;
  const maxPriceRange = a ? Math.max(...a.priceRanges.map(r => r.count), 1) : 1;

  return (
    <PageShell
      title="Dashboard"
      subtitle={
        <>
          {leads.length} lead{leads.length !== 1 ? "s" : ""} in pipeline · {todos.length} open task{todos.length !== 1 ? "s" : ""}
          {newMatches.length > 0 && (
            <span className="text-[var(--brass-500)] dark:text-[var(--brass-400)] font-medium">
              {" "}· {newMatches.length} new match{newMatches.length !== 1 ? "es" : ""}
            </span>
          )}
        </>
      }
    >
      {/* ── KPI Row ── */}
      {a && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card-elevated px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[var(--brass-400)]" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)]">Pipeline</span>
            </div>
            <div className="text-2xl font-bold text-[var(--navy-900)] dark:text-white">{fmt$(a.totals.pipelineValue)}</div>
            <div className="text-[11px] text-[var(--navy-400)] mt-0.5">{a.totals.boats} vessel{a.totals.boats !== 1 ? "s" : ""} tracked</div>
          </div>
          <div className="card-elevated px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-[var(--sea-500)]" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)]">This Week</span>
            </div>
            <div className="text-2xl font-bold text-[var(--navy-900)] dark:text-white">{a.velocity.week}</div>
            <div className="text-[11px] text-[var(--navy-400)] mt-0.5">{a.velocity.today} today · {a.velocity.month} this month</div>
          </div>
          <div className="card-elevated px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-[var(--navy-500)]" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)]">Total Leads</span>
            </div>
            <div className="text-2xl font-bold text-[var(--navy-900)] dark:text-white">{a.totals.leads}</div>
            <div className="text-[11px] text-[var(--navy-400)] mt-0.5">across {a.sources.length} source{a.sources.length !== 1 ? "s" : ""}</div>
          </div>
          <div className="card-elevated px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="w-4 h-4 text-[var(--coral-500)]" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)]">Open Tasks</span>
            </div>
            <div className="text-2xl font-bold text-[var(--navy-900)] dark:text-white">{a.totals.openTodos}</div>
            <div className="text-[11px] text-[var(--navy-400)] mt-0.5">action items pending</div>
          </div>
        </div>
      )}

      {/* ── Pipeline Status ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 md:gap-3 mb-6">
        {(["new", "hot", "warm", "cold", "nurture", "other"] as const).map(s => (
          <Link key={s} href={`/clients?status=${s}`}
            className="card-elevated group px-3.5 py-3 flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--navy-400)]">{s}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--navy-900)] dark:text-white leading-none">{byStatus[s] || 0}</div>
            {a && a.pipelineValue[s] ? (
              <div className="text-[10px] text-[var(--navy-400)] mt-1">{fmt$(a.pipelineValue[s])}</div>
            ) : null}
          </Link>
        ))}
      </div>

      {/* ── Analytics Row: Sources + Price Distribution ── */}
      {a && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {/* Lead Sources */}
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <div className="w-8 h-8 rounded-lg bg-[var(--brass-50)] dark:bg-[var(--brass-500)]/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-[var(--brass-500)]" />
              </div>
              <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Lead Sources</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {a.sources.map(s => {
                const color = SOURCE_COLORS[s.source] || "var(--navy-300)";
                const pct = (s.count / maxSource) * 100;
                return (
                  <div key={s.source}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[var(--navy-700)] dark:text-[var(--navy-200)]">
                        {s.source || "Unknown"}
                      </span>
                      <span className="text-xs font-bold text-[var(--navy-500)]">{s.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--sand-200)] dark:bg-[var(--navy-800)] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price Distribution */}
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <div className="w-8 h-8 rounded-lg bg-[var(--sea-400)]/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-[var(--sea-500)]" />
              </div>
              <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Price Distribution</h2>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-end gap-2 h-28">
                {a.priceRanges.map((r, i) => {
                  const pct = maxPriceRange > 0 ? (r.count / maxPriceRange) * 100 : 0;
                  return (
                    <div key={r.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-[var(--navy-500)]">{r.count}</span>
                      <div className="w-full rounded-t-md transition-all duration-700"
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          background: `var(--sea-${300 + i * 100 > 700 ? 700 : 300 + i * 100})`,
                          opacity: r.count > 0 ? 1 : 0.25,
                        }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)] pt-2">
                {a.priceRanges.map(r => (
                  <div key={r.label} className="flex-1 text-center text-[9px] font-medium text-[var(--navy-400)] leading-tight">
                    {r.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Recent Leads + Top Boats */}
        <div className="lg:col-span-2 space-y-5">
          {/* Recent Leads */}
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--navy-50)] dark:bg-[var(--navy-800)] flex items-center justify-center">
                  <Users className="w-4 h-4 text-[var(--navy-500)] dark:text-[var(--navy-300)]" />
                </div>
                <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Recent Leads</h2>
              </div>
              <Link href="/clients"
                className="text-xs font-medium text-[var(--brass-500)] hover:text-[var(--brass-400)] flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="py-14 text-center text-[var(--navy-400)] text-sm">No leads yet</div>
            ) : (
              <div className="divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
                {recent.map(l => {
                  const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || "Untitled";
                  const boat = [l.boat_year, l.boat_make, l.boat_model].filter(Boolean).join(" ");
                  const status = (l.status || "other").toLowerCase();
                  return (
                    <div key={l.id}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] cursor-pointer transition-colors"
                      onClick={() => router.push(`/clients/${encodeURIComponent(l.id)}`)}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status] || STATUS_DOT.other}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--navy-900)] dark:text-white truncate">{name}</div>
                        <div className="text-xs text-[var(--navy-400)] truncate">{boat || l.email || "—"}</div>
                      </div>
                      {l.boat_price && (
                        <div className="text-xs font-semibold text-[var(--navy-500)] dark:text-[var(--navy-300)] shrink-0">{l.boat_price}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Boats in Pipeline */}
          {a && a.topBoats.length > 0 && (
            <div className="card-elevated overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--brass-50)] dark:bg-[var(--brass-500)]/10 flex items-center justify-center">
                  <Anchor className="w-4 h-4 text-[var(--brass-500)]" />
                </div>
                <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Top Vessels by Value</h2>
              </div>
              <div className="divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
                {a.topBoats.slice(0, 6).map((b, i) => (
                  <div key={i}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] cursor-pointer transition-colors"
                    onClick={() => router.push(`/clients/${encodeURIComponent(b.lead_id)}`)}>
                    <div className="w-6 text-center text-[10px] font-bold text-[var(--navy-400)]">#{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--navy-900)] dark:text-white truncate">
                        {[b.year, b.make, b.model].filter(Boolean).join(" ")}
                      </div>
                      <div className="text-xs text-[var(--navy-400)] truncate">
                        {b.lead_name} {b.length ? `· ${b.length}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[var(--brass-500)] shrink-0">{fmt$(b.numericPrice)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Open Tasks */}
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--sea-400)]/10 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4 text-[var(--sea-500)]" />
                </div>
                <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Open Tasks</h2>
              </div>
              <Link href="/todos"
                className="text-xs font-medium text-[var(--brass-500)] hover:text-[var(--brass-400)] flex items-center gap-1 transition-colors">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {todos.length === 0 ? (
              <div className="py-10 text-center text-[var(--navy-400)] text-sm">All clear!</div>
            ) : (
              <div className="divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
                {todos.slice(0, 5).map(t => (
                  <div key={t.id} className="px-5 py-3 flex items-start gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${t.priority === "high" ? "bg-[var(--coral-500)]" : "bg-[var(--sand-300)] dark:bg-[var(--navy-600)]"}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)] line-clamp-2">{t.text}</div>
                      {t.lead_name && <div className="text-[11px] text-[var(--navy-400)] mt-0.5">{t.lead_name}</div>}
                    </div>
                  </div>
                ))}
                {todos.length > 5 && (
                  <div className="px-5 py-2.5 text-xs text-[var(--navy-400)] text-center">+{todos.length - 5} more</div>
                )}
              </div>
            )}
          </div>

          {/* New Matches */}
          {newMatches.length > 0 && (
            <div className="card-elevated overflow-hidden" style={{ borderColor: "var(--brass-200)" }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--brass-100)] dark:border-[var(--navy-700)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--brass-50)] dark:bg-[var(--brass-500)]/10 flex items-center justify-center">
                    <Link2 className="w-4 h-4 text-[var(--brass-500)]" />
                  </div>
                  <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">New Matches</h2>
                </div>
                <Link href="/offmarket"
                  className="text-xs font-medium text-[var(--brass-500)] hover:text-[var(--brass-400)] flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-[var(--brass-100)]/50 dark:divide-[var(--navy-800)]">
                {newMatches.map(m => {
                  const vessel = [m.owner_year, m.owner_length, m.owner_make].filter(Boolean).join(" ");
                  return (
                    <div key={m.id} className="px-5 py-3">
                      <div className="text-xs font-semibold text-[var(--navy-800)] dark:text-[var(--navy-200)]">
                        {m.owner_name} → {m.buyer_name}
                      </div>
                      <div className="text-[11px] text-[var(--navy-400)] mt-0.5">{vessel} · Score: {m.match_score}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Digital Cards */}
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--brass-50)] dark:bg-[var(--brass-500)]/10 flex items-center justify-center">
                  <span className="text-sm">🪪</span>
                </div>
                <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white">Digital Cards</h2>
              </div>
            </div>
            <div className="divide-y divide-[var(--sand-200)] dark:divide-[var(--navy-800)]">
              {[
                {
                  id: "will", name: "Will Noftsinger",
                  title: "Yacht Broker · Build Consultant",
                  company: "Denison · YachtSlinger · Oceanking",
                  phone: "8504613342", phoneLabel: "850.461.3342",
                  email: "WN@DenisonYachting.com",
                  photo: "https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/photos%2f42958226346-icon-1740663706841399017.jpg?alt=media",
                  color: "#0a2e5c",
                },
                {
                  id: "paolo", name: "Paolo Ameglio",
                  title: "Yacht Broker",
                  company: "Denison Yachting",
                  phone: "7862512588", phoneLabel: "786.251.2588",
                  email: "PGA@DenisonYachting.com",
                  photo: null,
                  color: "#1a3a4a",
                },
              ].map(broker => (
                <div key={broker.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-3 mb-2.5">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2"
                      style={{ borderColor: "var(--brass-200)", background: broker.color }}
                    >
                      {broker.photo
                        ? <img src={broker.photo} alt={broker.name} className="w-full h-full object-cover object-top" />
                        : <span className="text-white font-semibold text-sm">
                            {broker.name.split(" ").map(w => w[0]).join("")}
                          </span>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--navy-900)] dark:text-white leading-tight truncate">{broker.name}</div>
                      <div className="text-[10px] text-[var(--navy-400)] truncate mt-0.5">{broker.title}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <a
                      href={`tel:${broker.phone}`}
                      className="flex-1 text-center text-[10px] font-semibold tracking-wide py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: "var(--brass-200)", color: "var(--brass-500)" }}
                    >
                      📞 Call
                    </a>
                    <a
                      href={`mailto:${broker.email}`}
                      className="flex-1 text-center text-[10px] font-semibold tracking-wide py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: "var(--sand-300)", color: "var(--navy-500)" }}
                    >
                      ✉ Email
                    </a>
                    <Link
                      href={`/card/${broker.id}`}
                      className="flex-1 text-center text-[10px] font-semibold tracking-wide py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: "var(--sand-300)", color: "var(--navy-500)" }}
                    >
                      🪪 Card
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card-elevated p-5">
            <h2 className="font-semibold text-sm text-[var(--navy-900)] dark:text-white mb-3.5">Quick Actions</h2>
            <div className="space-y-1.5">
              {[
                { href: "/clients", Icon: Users, label: "Manage Leads", accent: "var(--navy-500)" },
                { href: "/vessels", Icon: FileText, label: "Generate PDF", accent: "var(--brass-500)" },
                { href: "/campaigns", Icon: Mail, label: "Build Campaign", accent: "var(--sea-500)" },
                { href: "/todos", Icon: CheckSquare, label: "View Tasks", accent: "var(--sea-400)" },
                { href: "/offmarket", Icon: Lock, label: "Off-Market", accent: "var(--navy-400)" },
              ].map(act => (
                <Link key={act.href} href={act.href}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors group">
                  <act.Icon className="w-4 h-4 shrink-0" style={{ color: act.accent }} />
                  <span className="text-sm font-medium text-[var(--navy-700)] dark:text-[var(--navy-200)] group-hover:text-[var(--navy-900)] dark:group-hover:text-white transition-colors">
                    {act.label}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[var(--navy-300)] ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
