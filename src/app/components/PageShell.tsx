"use client";

import React from "react";

/* ═══════════════════════════════════════════
   PageShell — Consistent page wrapper (v2)
   ═══════════════════════════════════════════
   
   Usage:
     <PageShell
       title="Leads"
       subtitle="42 contacts in pipeline"
       actions={<button className="btn-primary">+ New Lead</button>}
     >
       {content}
     </PageShell>
   
   Variants:
     maxWidth="narrow"  — 768px (settings, tasks)
     maxWidth="default" — 1200px (most pages)
     maxWidth="wide"    — 1400px (tables, data-heavy)
     maxWidth="full"    — 100% (custom layouts)

   New in v2:
     breadcrumb — [{label, href}] for back-nav context
     stickyHeader — keeps header visible on scroll
     headerBorder — adds bottom border to header area
*/

type MaxWidth = "narrow" | "default" | "wide" | "full";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageShellProps {
  children: React.ReactNode;
  /** Page title — renders as h1 with display font */
  title?: string;
  /** Subtitle / meta line below title */
  subtitle?: string | React.ReactNode;
  /** Right-aligned action buttons */
  actions?: React.ReactNode;
  /** Content max-width: narrow (768), default (1200), wide (1400), full */
  maxWidth?: MaxWidth;
  /** Extra className on the outer wrapper */
  className?: string;
  /** Replace the default header with a fully custom one */
  customHeader?: React.ReactNode;
  /** Content between header and children (tabs, filters, etc.) */
  toolbar?: React.ReactNode;
  /** Remove default padding (for edge-to-edge layouts) */
  flush?: boolean;
  /** Loading state — shows skeleton header */
  loading?: boolean;
  /** Breadcrumb trail above title */
  breadcrumb?: BreadcrumbItem[];
  /** Keep header pinned on scroll */
  stickyHeader?: boolean;
  /** Show border below header area */
  headerBorder?: boolean;
}

const MAX_WIDTH_MAP: Record<MaxWidth, string> = {
  narrow: "768px",
  default: "1200px",
  wide: "1400px",
  full: "100%",
};

export default function PageShell({
  children,
  title,
  subtitle,
  actions,
  maxWidth = "default",
  className = "",
  customHeader,
  toolbar,
  flush = false,
  loading = false,
  breadcrumb,
  stickyHeader = false,
  headerBorder = false,
}: PageShellProps) {
  const mw = MAX_WIDTH_MAP[maxWidth];

  const hasHeader = customHeader || title || actions;

  return (
    <div
      className={`page-shell-root ${flush ? "" : "page-shell-padded"} ${className}`}
      style={{ maxWidth: mw, marginInline: "auto" }}
    >
      {/* ── Header ── */}
      {hasHeader && (
        <div
          className={[
            "page-shell-header-wrap",
            stickyHeader ? "page-shell-sticky" : "",
            headerBorder ? "page-shell-header-bordered" : "",
          ].filter(Boolean).join(" ")}
        >
          {customHeader ? (
            customHeader
          ) : (
            <div className="page-shell-header">
              <div className="flex-1 min-w-0">
                {loading ? (
                  <>
                    <div className="skeleton skeleton-title mb-2" />
                    <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                  </>
                ) : (
                  <>
                    {/* Breadcrumb */}
                    {breadcrumb && breadcrumb.length > 0 && (
                      <nav className="page-shell-breadcrumb" aria-label="Breadcrumb">
                        {breadcrumb.map((item, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span className="page-shell-breadcrumb-sep">/</span>}
                            {item.href ? (
                              <a href={item.href} className="page-shell-breadcrumb-link">
                                {item.label}
                              </a>
                            ) : (
                              <span className="page-shell-breadcrumb-current">{item.label}</span>
                            )}
                          </React.Fragment>
                        ))}
                      </nav>
                    )}
                    {title && <h1 className="page-shell-title">{title}</h1>}
                    {subtitle && (
                      <div className="page-shell-subtitle">
                        {typeof subtitle === "string" ? <p>{subtitle}</p> : subtitle}
                      </div>
                    )}
                  </>
                )}
              </div>
              {actions && !loading && (
                <div className="page-shell-actions">{actions}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar (tabs, filters, search) ── */}
      {toolbar && (
        <div className="page-shell-toolbar">{toolbar}</div>
      )}

      {/* ── Content ── */}
      {children}
    </div>
  );
}
