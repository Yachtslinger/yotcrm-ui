"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PageTransition from "./PageTransition";
import {
  LayoutDashboard, Users, Lock, CheckSquare,
  Mail, Settings, Anchor, Link2, MapPin, Briefcase,
  Search, X, LogOut, Zap, CalendarDays, Shield,
  Upload, CreditCard, Globe, BookOpen, Grid, DollarSign, BarChart2,
} from "lucide-react";

/* ─── Navigation Config ─── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",   Icon: LayoutDashboard, color: "#3b82f6", group: "core" },
  { href: "/clients",   label: "Leads",       Icon: Users,           color: "#059669", group: "core" },
  { href: "/todos",     label: "To Do",       Icon: CheckSquare,     color: "#d97706", group: "core" },
  { href: "/botqueue",  label: "Bot Queue",   Icon: Zap,             color: "#7c3aed", group: "core" },
  { href: "/matches",   label: "Matches",     Icon: Zap,             color: "#7c3aed", group: "core" },
  { href: "/connect",      label: "Connect",      Icon: Link2,           color: "#f59e0b", group: "core" },
  { href: "/connect/todo", label: "Connect: To Do", Icon: CheckSquare,    color: "#059669", group: "core" },
  { href: "/campaigns", label: "Campaigns",   Icon: Mail,            color: "#0e7490", group: "core" },
  { href: "/buyers",    label: "Buyers",      Icon: Search,          color: "#6366f1", group: "listings" },
  { href: "/listings",  label: "My Listings", Icon: Briefcase,       color: "#b45e0b", group: "listings" },

  { href: "/brochures",  label: "E-Brochures",  Icon: BookOpen,        color: "#c9a55c", group: "listings" },
  { href: "/ownership",  label: "Cost Model",   Icon: DollarSign,      color: "#10b981", group: "listings" },
  { href: "/offmarket", label: "Off-Market",  Icon: Lock,            color: "#374151", group: "listings" },
  { href: "/calendar",  label: "Calendar",    Icon: CalendarDays,    color: "#0369a1", group: "tools" },
  { href: "/showings",  label: "Locations",   Icon: MapPin,          color: "#059669", group: "tools" },
  { href: "/intel",     label: "Lighthouse",      Icon: Shield,     color: "#7c3aed", group: "tools" },
  { href: "/market-analysis", label: "Market Analysis", Icon: BarChart2, color: "#b8933a", group: "tools" },
  { href: "/marinas",   label: "Marinas",     Icon: Anchor,          color: "#0e7490", group: "tools" },
  { href: "/card/will",   label: "My Card",     Icon: CreditCard,      color: "#c9a55c", group: "account" },
  { href: "/card/paolo",  label: "Paolo's Card", Icon: CreditCard,      color: "#6366f1", group: "account" },
  { href: "/yotcrm",    label: "YotCRM",      Icon: Link2,           color: "#3b82f6", group: "account" },
  { href: "/import",    label: "Import",      Icon: Upload,          color: "#6b7280", group: "account" },
  { href: "/settings",  label: "Settings",    Icon: Settings,        color: "#6b7280", group: "account" },
];

const EXTERNAL_LINKS = [
  { href: "https://yotcrm-production.up.railway.app/home", label: "Website", Icon: Globe },
  { href: "https://www.denisonyachtsales.com/yachts-for-sale/", label: "Denison MLS", Icon: Search },
];

/* Mobile bottom dock — 4 primary + "Apps" grid button */
const DOCK_ITEMS = NAV_ITEMS.slice(0, 4);

const GROUP_LABELS: Record<string, string> = {
  core: "Daily",
  listings: "Listings & Docs",
  tools: "Tools",
  account: "Account",
};

/* ─── Command Palette (⌘K) ─── */
type CmdResult = {
  leads: any[];
  todos: any[];
  listings: any[];
};

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CmdResult>({ leads: [], todos: [], listings: [] });
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) { setQuery(""); setResults({ leads: [], todos: [], listings: [] }); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults({ leads: [], todos: [], listings: [] }); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/command-search?q=${encodeURIComponent(query)}`);
        setResults(await r.json());
      } catch { /* ignore */ }
      setLoading(false);
    }, 160);
  }, [query]);

  // Flatten all items for keyboard nav
  const pageResults = query.trim() ? NAV_ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : [];
  type FlatItem =
    | { kind: "page";    href: string; label: string; Icon: React.ElementType; color: string }
    | { kind: "lead";    id: string;   name: string;  status: string; boat: string; email: string }
    | { kind: "todo";    id: number;   text: string;  leadName: string; priority: string }
    | { kind: "listing"; id: number;   label: string; price: string; location: string; batchId: number };

  const flat: FlatItem[] = [
    ...pageResults.map(p => ({ kind: "page" as const, href: p.href, label: p.label, Icon: p.Icon, color: p.color })),
    ...results.leads.map(l => ({
      kind: "lead" as const,
      id: String(l.id),
      name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unknown",
      status: l.status || "new",
      boat: [l.boat_year, l.boat_make, l.boat_model].filter(Boolean).join(" "),
      email: l.email || "",
    })),
    ...results.todos.map(t => ({
      kind: "todo" as const,
      id: t.id,
      text: t.text?.replace(/\[Score:\s*\d+\]/, "").replace(/\n/g, " ").trim() || "",
      leadName: t.lead_name || "",
      priority: t.priority || "normal",
    })),
    ...results.listings.map(l => ({
      kind: "listing" as const,
      id: l.id,
      label: [l.year, l.make, l.model].filter(Boolean).join(" ") || "Unknown vessel",
      price: l.asking_price || "",
      location: l.location || "",
      batchId: l.batch_id,
    })),
  ];

  const go = (item: FlatItem) => {
    if (item.kind === "page")    router.push(item.href);
    if (item.kind === "lead")    router.push(`/clients/${item.id}`);
    if (item.kind === "todo")    router.push("/todos");
    if (item.kind === "listing") router.push(`/matches?batchId=${item.batchId}`);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, flat.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return; }
    if (e.key === "Enter" && flat[cursor]) { go(flat[cursor]); return; }
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = { hot: "#ef4444", warm: "#f97316", cold: "#6b7280", nurture: "#3b82f6", client: "#7c3aed", new: "#059669" };
    return m[s] || m.new;
  };

  if (!open) return null;

  const isEmpty = !loading && query.trim() && flat.length === 0;
  const showEmpty = query.trim().length === 0;

  let globalIdx = 0;
  const renderSection = (label: string, items: FlatItem[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase"
          style={{ color: "var(--navy-400, rgba(255,255,255,0.3))", borderTop: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
          {label}
        </div>
        {items.map(item => {
          const idx = globalIdx++;
          const active = cursor === idx;
          return (
            <button key={`${item.kind}-${item.kind === "page" ? item.href : item.id}`}
              onClick={() => go(item)}
              onMouseEnter={() => setCursor(idx)}
              className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
              style={{ background: active ? "rgba(201,165,92,0.12)" : "transparent" }}>
              {item.kind === "page" && (
                <>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: item.color + "20" }}>
                    <item.Icon style={{ width: 14, height: 14, color: item.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{item.label}</div>
                    <div className="text-[11px]" style={{ color: "var(--navy-400)" }}>{item.href}</div>
                  </div>
                </>
              )}
              {item.kind === "lead" && (
                <>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                    style={{ background: statusColor(item.status) + "20", color: statusColor(item.status) }}>
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{item.name}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: statusColor(item.status) + "15", color: statusColor(item.status) }}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--navy-400)" }}>
                      {item.boat || item.email || "—"}
                    </div>
                  </div>
                </>
              )}
              {item.kind === "todo" && (
                <>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: item.priority === "high" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)" }}>
                    <span style={{ fontSize: 14 }}>✓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{item.text}</div>
                    {item.leadName && <div className="text-[11px]" style={{ color: "var(--navy-400)" }}>{item.leadName}</div>}
                  </div>
                </>
              )}
              {item.kind === "listing" && (
                <>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(139,92,246,0.12)" }}>
                    <span style={{ fontSize: 14 }}>⚡</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{item.label}</div>
                    <div className="text-[11px]" style={{ color: "var(--navy-400)" }}>
                      {[item.price, item.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </>
              )}
              {active && <span className="text-[10px] ml-auto shrink-0 self-center" style={{ color: "var(--navy-400)" }}>↵</span>}
            </button>
          );
        })}
      </div>
    );
  };

  const pageSec    = flat.filter(i => i.kind === "page");
  const leadSec    = flat.filter(i => i.kind === "lead");
  const todoSec    = flat.filter(i => i.kind === "todo");
  const listingSec = flat.filter(i => i.kind === "listing");
  // reset for render
  globalIdx = 0;

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-[rgba(6,14,26,0.65)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-[12vh] w-[92%] max-w-xl">
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)" }}>
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <Search className="w-5 h-5 shrink-0" style={{ color: "var(--navy-300)" }} />
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setCursor(0); }}
              onKeyDown={handleKey}
              placeholder="Search leads, todos, listings, pages…"
              className="flex-1 text-[15px] bg-transparent outline-none"
              style={{ color: "var(--foreground)" }} />
            {loading && <div className="w-4 h-4 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: "var(--navy-300)", borderTopColor: "var(--brass-400)" }} />}
            {!loading && <button onClick={onClose}><X className="w-4 h-4" style={{ color: "var(--navy-400)" }} /></button>}
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {showEmpty && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--navy-500)" }}>Search leads, todos, listings, pages</p>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: "var(--sand-100, rgba(255,255,255,0.06))", color: "var(--navy-400)" }}>⌘K</span>
                  <span className="text-xs" style={{ color: "var(--navy-400)" }}>to open · ESC to close · ↑↓ navigate · ↵ select</span>
                </div>
              </div>
            )}
            {isEmpty && (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--navy-400)" }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            )}
            {!showEmpty && !isEmpty && (
              <>
                {renderSection("Pages", pageSec)}
                {renderSection("Leads", leadSec)}
                {renderSection("Todos", todoSec)}
                {renderSection("Listings", listingSec)}
              </>
            )}
          </div>

          {/* Footer hint */}
          {!showEmpty && flat.length > 0 && (
            <div className="flex items-center justify-end gap-3 px-4 py-2" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>
                {flat.length} result{flat.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>↑↓ navigate · ↵ open</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile Apps Sheet (full-screen tile grid) ─── */
function AppsSheet({ open, onClose, isActive }: { open: boolean; onClose: () => void; isActive: (h: string) => boolean }) {
  const router = useRouter();
  if (!open) return null;

  const groups = ["core", "listings", "tools", "account"] as const;
  const go = (href: string) => { router.push(href); onClose(); };

  return (
    <div className="fixed inset-0" style={{ zIndex: 500 }}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(6,14,26,0.7)", backdropFilter: "blur(6px)" }}
        onClick={onClose} />

      {/* Sheet slides up from bottom */}
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden"
        style={{ background: "var(--navy-950)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>

        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3"
            style={{ background: "rgba(255,255,255,0.2)" }} />
          <span className="text-base font-bold text-white mt-1">All Pages</span>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center mt-1"
            style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable tile grid */}
        <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
          {groups.map(group => {
            const items = NAV_ITEMS.filter(i => i.group === group);
            return (
              <div key={group} className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
                  style={{ color: "rgba(255,255,255,0.35)" }}>
                  {GROUP_LABELS[group]}
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {items.map(item => {
                    const active = isActive(item.href);
                    return (
                      <button key={item.href} onClick={() => go(item.href)}
                        className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all active:scale-95"
                        style={{
                          background: active ? item.color + "22" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${active ? item.color + "55" : "rgba(255,255,255,0.08)"}`,
                        }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: item.color + "22" }}>
                          <item.Icon style={{ width: 20, height: 20, color: item.color }} />
                        </div>
                        <span className="text-[10px] font-semibold leading-tight text-center px-1"
                          style={{ color: active ? "white" : "rgba(255,255,255,0.65)" }}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* External links */}
          <div className="mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
              style={{ color: "rgba(255,255,255,0.35)" }}>External</p>
            <div className="grid grid-cols-4 gap-3">
              {EXTERNAL_LINKS.map(item => (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl active:scale-95"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(201,165,92,0.2)" }}>
                    <item.Icon style={{ width: 20, height: 20, color: "#c9a55c" }} />
                  </div>
                  <span className="text-[10px] font-semibold leading-tight text-center px-1"
                    style={{ color: "rgba(255,255,255,0.65)" }}>
                    {item.label} ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN NAV SHELL
   ═══════════════════════════════════════════ */
export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  const isActive = useCallback((href: string) => {
    if (href === "/card/will")  return pathname === "/card/will"  || pathname.startsWith("/card/will/");
    if (href === "/card/paolo") return pathname === "/card/paolo" || pathname.startsWith("/card/paolo/");
    if (href === "/clients")   return pathname === "/clients" || pathname.startsWith("/clients/");
    if (href === "/offmarket")  return pathname === "/offmarket" || pathname.startsWith("/offmarket/");
    if (href === "/showings")  return pathname === "/showings" || pathname.startsWith("/showings/");
    if (href === "/calendar")  return pathname === "/calendar" || pathname.startsWith("/calendar/");
    if (href === "/matches")   return pathname === "/matches"  || pathname.startsWith("/matches/");
    if (href === "/yotcrm")    return pathname === "/yotcrm"   || pathname.startsWith("/yotcrm/");
    return pathname === href || pathname.startsWith(href + "/");
  }, [pathname]);

  /* ⌘K */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(p => !p); }
      if (e.key === "Escape") { setSearchOpen(false); setAppsOpen(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => { setAppsOpen(false); }, [pathname]);

  if (pathname === "/login") return <>{children}</>;
  // Public website routes — no CRM chrome
  if (pathname === "/home" || pathname.startsWith("/home/")) return <>{children}</>;
  if (pathname.startsWith("/listing/")) return <>{children}</>;
  // Individual brochure view pages (/brochures/[slug]) bypass CRM nav — it's a public luxury brochure
  if (pathname.match(/^\/brochures\/[^/]+$/)) return <>{children}</>;

  return (
    <>
      {/* ══════════════════════════════════════
          DESKTOP: Left Sidebar
          ══════════════════════════════════════ */}
      <div className="hidden md:flex h-full">
        <aside className="flex flex-col shrink-0 h-full overflow-y-auto"
          style={{ width: 220, background: "var(--navy-950)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

          <Link href="/dashboard"
            className="flex items-center gap-3 px-5 py-5 group shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Anchor className="w-7 h-7 shrink-0 transition-transform group-hover:rotate-[-8deg]"
              style={{ color: "var(--brass-400)" }} strokeWidth={2} />
            <span className="text-[17px] font-bold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}>YotCRM</span>
          </Link>

          <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2" role="navigation">
            {NAV_ITEMS.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all group"
                  style={{
                    background: active ? "rgba(201,165,92,0.12)" : "transparent",
                    borderLeft: active ? "3px solid var(--brass-400)" : "3px solid transparent",
                    color: active ? "var(--brass-300)" : "rgba(255,255,255,0.55)",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                  <item.Icon className="shrink-0 transition-transform group-hover:scale-110"
                    style={{ width: 22, height: 22, color: active ? "var(--brass-400)" : "rgba(255,255,255,0.5)" }} />
                  <span className="text-[13.5px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="px-2 pb-4 pt-2 flex flex-col gap-0.5 shrink-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {EXTERNAL_LINKS.map(item => (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl w-full transition-all text-left"
                style={{ color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <item.Icon style={{ width: 22, height: 22 }} />
                <span className="text-[13.5px] font-medium">{item.label}</span>
                <span className="ml-auto text-[10px] opacity-30">↗</span>
              </a>
            ))}
            <button onClick={() => setSearchOpen(true)}
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl w-full transition-all text-left"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <Search style={{ width: 22, height: 22 }} />
              <span className="text-[13.5px] font-medium">Search</span>
              <span className="ml-auto text-[10px] opacity-40 font-mono">⌘K</span>
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
              className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl w-full transition-all text-left"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <LogOut style={{ width: 22, height: 22 }} />
              <span className="text-[13.5px] font-medium">Sign Out</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto scroll-thin min-w-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* ══════════════════════════════════════
          MOBILE: Top bar + Bottom Dock + Apps Sheet
          ══════════════════════════════════════ */}
      <div className="flex flex-col h-full md:hidden">
        {/* Top bar */}
        <header className="shrink-0 flex items-center justify-between px-4 py-3"
          style={{ background: "var(--navy-950)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <Anchor className="w-6 h-6 group-hover:rotate-[-8deg] transition-transform"
              style={{ color: "var(--brass-400)" }} strokeWidth={2} />
            <span className="text-[16px] font-bold text-white tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}>YotCRM</span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              <Search className="w-5 h-5" />
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ color: "rgba(255,255,255,0.6)" }}>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto scroll-thin pb-24">
          <PageTransition>{children}</PageTransition>
        </main>

        {/* ── Bottom Dock ── */}
        <nav className="fixed bottom-0 left-0 right-0 flex items-stretch justify-around shrink-0"
          style={{
            background: "var(--navy-950)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingBottom: "max(10px, env(safe-area-inset-bottom))",
            paddingTop: 8,
            zIndex: 100,
          }}>
          {/* Primary 4 */}
          {DOCK_ITEMS.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}
                className="flex flex-col items-center gap-1.5 px-2 py-1 rounded-xl transition-all min-w-[60px] active:scale-95"
                style={{ color: active ? "white" : "rgba(255,255,255,0.4)" }}>
                {/* Icon bubble */}
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
                  style={{
                    background: active ? item.color + "30" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${active ? item.color + "60" : "transparent"}`,
                  }}>
                  <item.Icon style={{ width: 22, height: 22, color: active ? item.color : "rgba(255,255,255,0.45)" }}
                    strokeWidth={active ? 2.2 : 1.8} />
                </div>
                <span className="text-[10px] font-semibold leading-none"
                  style={{ color: active ? "white" : "rgba(255,255,255,0.4)" }}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Apps grid button */}
          <button onClick={() => setAppsOpen(p => !p)}
            className="flex flex-col items-center gap-1.5 px-2 py-1 rounded-xl transition-all min-w-[60px] active:scale-95"
            style={{ color: appsOpen ? "white" : "rgba(255,255,255,0.4)" }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
              style={{
                background: appsOpen ? "rgba(201,165,92,0.3)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${appsOpen ? "rgba(201,165,92,0.6)" : "transparent"}`,
              }}>
              <Grid style={{ width: 22, height: 22, color: appsOpen ? "#c9a55c" : "rgba(255,255,255,0.45)" }}
                strokeWidth={1.8} />
            </div>
            <span className="text-[10px] font-semibold leading-none"
              style={{ color: appsOpen ? "white" : "rgba(255,255,255,0.4)" }}>
              All
            </span>
          </button>
        </nav>
      </div>

      {/* Apps sheet — mobile only */}
      <AppsSheet open={appsOpen} onClose={() => setAppsOpen(false)} isActive={isActive} />

      {/* Search overlay — shared */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
