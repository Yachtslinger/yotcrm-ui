"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PageTransition from "./PageTransition";
import {
  LayoutDashboard, Users, Lock, CheckSquare,
  FileText, Mail, Settings, Anchor, Link2, MapPin, Briefcase,
  Search, X, LogOut, Zap, CalendarDays, Shield,
  Upload, CreditCard, Globe, BookOpen, Grid,
} from "lucide-react";

/* ─── Navigation Config ─── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",   Icon: LayoutDashboard, color: "#3b82f6", group: "core" },
  { href: "/clients",   label: "Leads",       Icon: Users,           color: "#059669", group: "core" },
  { href: "/todos",     label: "To Do",       Icon: CheckSquare,     color: "#d97706", group: "core" },
  { href: "/botqueue",  label: "Bot Queue",   Icon: Zap,             color: "#7c3aed", group: "core" },
  { href: "/matches",   label: "Matches",     Icon: Zap,             color: "#7c3aed", group: "core" },
  { href: "/campaigns", label: "Campaigns",   Icon: Mail,            color: "#0e7490", group: "core" },
  { href: "/buyers",    label: "Buyers",      Icon: Search,          color: "#6366f1", group: "listings" },
  { href: "/listings",  label: "My Listings", Icon: Briefcase,       color: "#b45e0b", group: "listings" },
  { href: "/vessels",   label: "PDFs",        Icon: FileText,        color: "#dc2626", group: "listings" },
  { href: "/brochures", label: "E-Brochures", Icon: BookOpen,        color: "#c9a55c", group: "listings" },
  { href: "/offmarket", label: "Off-Market",  Icon: Lock,            color: "#374151", group: "listings" },
  { href: "/calendar",  label: "Calendar",    Icon: CalendarDays,    color: "#0369a1", group: "tools" },
  { href: "/showings",  label: "Locations",   Icon: MapPin,          color: "#059669", group: "tools" },
  { href: "/intel",     label: "Lighthouse",  Icon: Shield,          color: "#7c3aed", group: "tools" },
  { href: "/marinas",   label: "Marinas",     Icon: Anchor,          color: "#0e7490", group: "tools" },
  { href: "/card/will",   label: "My Card",     Icon: CreditCard,      color: "#c9a55c", group: "account" },
  { href: "/card/paolo",  label: "Paolo's Card", Icon: CreditCard,      color: "#6366f1", group: "account" },
  { href: "/yotcrm",    label: "Connect",     Icon: Link2,           color: "#3b82f6", group: "account" },
  { href: "/import",    label: "Import",      Icon: Upload,          color: "#6b7280", group: "account" },
  { href: "/settings",  label: "Settings",    Icon: Settings,        color: "#6b7280", group: "account" },
];

const EXTERNAL_LINKS = [
  { href: "https://yotcrm-production.up.railway.app/home", label: "Website", Icon: Globe },
];

/* Mobile bottom dock — 4 primary + "Apps" grid button */
const DOCK_ITEMS = NAV_ITEMS.slice(0, 4);

const GROUP_LABELS: Record<string, string> = {
  core: "Daily",
  listings: "Listings & Docs",
  tools: "Tools",
  account: "Account",
};

/* ─── Search Overlay ─── */
function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results = query.trim().length > 0
    ? NAV_ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  const go = (href: string) => { router.push(href); onClose(); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && results.length > 0) go(results[0].href);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-[rgba(6,14,26,0.6)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-[15vh] w-[92%] max-w-lg">
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <Search className="w-5 h-5 shrink-0" style={{ color: "var(--navy-300)" }} />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey} placeholder="Jump to any page..."
              className="flex-1 text-base bg-transparent outline-none" style={{ color: "var(--foreground)" }} />
            <button onClick={onClose} className="icon-btn icon-btn-sm"><X /></button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {query.trim().length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm mb-2" style={{ color: "var(--navy-400)" }}>Jump to any page</p>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="kbd">⌘</span><span className="kbd">K</span>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--navy-400)" }}>No results</div>
            ) : (
              <div className="py-2">
                {results.map(item => (
                  <button key={item.href} onClick={() => go(item.href)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--sand-100)] transition-colors">
                    <item.Icon className="w-5 h-5 shrink-0" style={{ color: "var(--navy-400)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--navy-700)" }}>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
