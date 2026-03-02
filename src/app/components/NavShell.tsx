"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import PageTransition from "./PageTransition";
import {
  LayoutDashboard, Users, Lock, CheckSquare,
  FileText, Mail, Settings, Anchor, Link2, MapPin, Briefcase,
  Search, X, LogOut, MoreHorizontal, Command, Zap, CalendarDays, Shield,
  Upload,
} from "lucide-react";

/* ─── Navigation Config ─── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/clients",   label: "Leads",     Icon: Users },
  { href: "/import",    label: "Import",    Icon: Upload },
  { href: "/buyers",    label: "Buyers",    Icon: Search },
  { href: "/offmarket", label: "Off-Market", Icon: Lock },
  { href: "/showings",  label: "Listing Locations", Icon: MapPin },
  { href: "/listings",  label: "My Listings", Icon: Briefcase },
  { href: "/calendar",  label: "Calendar",   Icon: CalendarDays },
  { href: "/matches",   label: "Matches",    Icon: Zap },
  { href: "/intel",     label: "Lighthouse",  Icon: Shield },
  { href: "/marinas",   label: "Marinas",    Icon: Anchor },
  { href: "/yotcrm",    label: "Connect",    Icon: Link2 },
  { href: "/todos",     label: "Tasks",      Icon: CheckSquare },
  { href: "/vessels",   label: "PDFs",       Icon: FileText },
  { href: "/campaigns", label: "Campaigns",  Icon: Mail },
  { href: "/settings",  label: "Settings",   Icon: Settings },
];

/* Primary items always visible; overflow items go to "More" on mobile */
const PRIMARY_COUNT = 6; // Show first 6 on mobile, rest in overflow

/* ─── Search Overlay ─── */
function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  /* Match nav items + basic quick-jump */
  const results = query.trim().length > 0
    ? NAV_ITEMS.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && results.length > 0) go(results[0].href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-modal-backdrop)" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(6,14,26,0.55)] backdrop-blur-sm"
        onClick={onClose} />
      {/* Panel */}
      <div className="relative mx-auto mt-[15vh] w-[92%] max-w-lg animate-scale-in">
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}>
            <Search className="w-5 h-5 shrink-0" style={{ color: "var(--navy-300)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Search pages, leads, listings..."
              className="flex-1 text-base bg-transparent outline-none"
              style={{ color: "var(--foreground)" }}
            />
            <button onClick={onClose} className="icon-btn icon-btn-sm" aria-label="Close search">
              <X />
            </button>
          </div>
          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto scroll-thin">
            {query.trim().length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: "var(--navy-400)" }}>
                  Jump to any page or search your CRM
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <span className="kbd">⌘</span>
                  <span className="kbd">K</span>
                  <span className="text-xs ml-1" style={{ color: "var(--navy-300)" }}>to open anytime</span>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--navy-400)" }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="py-2">
                {results.map((item) => (
                  <button key={item.href}
                    onClick={() => go(item.href)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors"
                    style={{ color: "var(--navy-700)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--sand-100)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}>
                    <item.Icon className="w-4 h-4 shrink-0" style={{ color: "var(--navy-400)" }} />
                    <span className="text-sm font-medium">{item.label}</span>
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

/* ─── More Menu (overflow items) ─── */
function MoreMenu({
  items,
  isActive,
  open,
  onToggle,
  onClose,
}: {
  items: typeof NAV_ITEMS;
  isActive: (href: string) => boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const hasActiveOverflow = items.some((item) => isActive(item.href));

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div ref={menuRef} className="relative md:hidden">
      <button
        onClick={onToggle}
        className={`nav-dock-item ${hasActiveOverflow ? "active" : ""}`}
        aria-label="More navigation"
        aria-expanded={open}
      >
        <MoreHorizontal className="nav-dock-icon" />
        <span>More</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl py-2 animate-scale-in"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: "var(--z-dropdown)",
          }}>
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: active ? "var(--brass-400)" : "var(--navy-600)",
                  background: active ? "rgba(201, 165, 92, 0.06)" : "transparent",
                }}>
                <item.Icon className="w-4 h-4" style={{ color: active ? "var(--brass-400)" : "var(--navy-400)" }} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN NAV SHELL
   ═══════════════════════════════════════════ */
export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = useCallback((href: string) => {
    if (href === "/clients") return pathname === "/clients" || pathname.startsWith("/clients/");
    if (href === "/market") return pathname === "/market" || pathname.startsWith("/market/");
    if (href === "/offmarket") return pathname === "/offmarket" || pathname.startsWith("/offmarket/");
    if (href === "/showings") return pathname === "/showings" || pathname.startsWith("/showings/");
    if (href === "/calendar") return pathname === "/calendar" || pathname.startsWith("/calendar/");
    if (href === "/matches") return pathname === "/matches" || pathname.startsWith("/matches/");
    if (href === "/yotcrm") return pathname === "/yotcrm" || pathname.startsWith("/yotcrm/");
    return pathname === href || pathname.startsWith(href + "/");
  }, [pathname]);

  /* Scroll active nav item into view on mobile */
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const el = activeRef.current;
      const container = scrollRef.current;
      const left = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left, behavior: "smooth" });
    }
  }, [pathname]);

  /* ⌘K global keyboard shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  /* Close more menu on route change */
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  /* Hide nav on login page */
  if (pathname === "/login") return <>{children}</>;

  /* Split nav items: primary (always visible) vs overflow (More menu on mobile) */
  const primaryItems = NAV_ITEMS.slice(0, PRIMARY_COUNT);
  const overflowItems = NAV_ITEMS.slice(PRIMARY_COUNT);

  return (
    <div className="flex flex-col h-full">
      {/* ═══ Top Navigation Dock ═══ */}
      <header className="nav-dock shrink-0 relative">
        <div className="flex items-center gap-0 px-2 md:px-4">

          {/* ── Logo / Brand ── */}
          <Link href="/dashboard"
            className="flex items-center gap-2.5 px-2 py-3 md:px-3 shrink-0 mr-1 md:mr-3 group"
            aria-label="YotCRM Home">
            <Anchor className="w-6 h-6 transition-transform group-hover:rotate-[-8deg]"
              style={{ color: "var(--brass-400)" }}
              strokeWidth={2} />
            <span className="hidden md:block text-[15px] font-bold tracking-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}>
              YotCRM
            </span>
          </Link>

          {/* ── Nav Items — primary set ── */}
          <nav ref={scrollRef}
            className="nav-scroll flex items-center justify-around sm:justify-start sm:gap-0.5 md:gap-1 overflow-x-auto flex-1 py-1.5"
            role="navigation" aria-label="Main navigation">
            {/* Primary items — always visible */}
            {primaryItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}
                  ref={active ? activeRef : undefined}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={`nav-dock-item ${active ? "active" : ""}`}>
                  <item.Icon className="nav-dock-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Overflow items — visible on desktop, hidden on mobile (in More menu) */}
            {overflowItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}
                  ref={active ? activeRef : undefined}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={`nav-dock-item hidden md:flex ${active ? "active" : ""}`}>
                  <item.Icon className="nav-dock-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* More button — mobile only */}
            <MoreMenu
              items={overflowItems}
              isActive={isActive}
              open={moreOpen}
              onToggle={() => setMoreOpen(!moreOpen)}
              onClose={() => setMoreOpen(false)}
            />
          </nav>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-1 shrink-0 ml-1 md:ml-3">
            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="nav-dock-item"
              aria-label="Search (⌘K)"
              title="Search (⌘K)"
            >
              <Search className="nav-dock-icon" />
              <span className="hidden md:block">Search</span>
            </button>

            {/* Logout */}
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="nav-dock-item"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="nav-dock-icon" />
              <span className="hidden md:block">Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 overflow-y-auto scroll-thin">
        <PageTransition>{children}</PageTransition>
      </main>

      {/* ═══ Search Overlay ═══ */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
