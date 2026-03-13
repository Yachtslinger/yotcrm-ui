"use client";

import * as React from "react";
import PageShell from "../components/PageShell";

type PdfFile = {
  name: string;
  size: number;
  downloadUrl: string;
};

type Listing = {
  name: string;
  metadata: Record<string, unknown>;
  pdfs: PdfFile[];
  created: number;
};

type GenerateResult = {
  ok: boolean;
  listing?: string;
  metadata?: Record<string, unknown>;
  pdfs?: PdfFile[];
  error?: string;
};

type ActionTarget = {
  url: string;
  name: string;
  title: string;
  listing: string; // listing dir name for delete
};

export default function VesselsPage(): React.ReactElement {
  const [url, setUrl] = React.useState("");
  const [broker, setBroker] = React.useState<"will" | "paolo" | "both">("will");
  const [logo, setLogo] = React.useState<"slinger" | "denison">("slinger");
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<GenerateResult | null>(null);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<ActionTarget | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<{ listing: string; title: string } | null>(null);
  const [viewingPdf, setViewingPdf] = React.useState<{ url: string; name: string; title: string } | null>(null);

  React.useEffect(() => {
    refreshListings();
  }, []);

  function refreshListings() {
    fetch("/api/pdf")
      .then(r => r.json())
      .then(data => { if (data.ok) setListings(data.listings || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleGenerate() {
    if (!url.trim()) return;
    setGenerating(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), broker, logo }),
      });
      const data: GenerateResult = await res.json();
      if (data.ok) {
        setResult(data);
        setUrl("");
        refreshListings();
      } else {
        setError(data.error || "Generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  function getDisplayName(listing: Listing): string {
    const m = listing.metadata;
    if (m.headline) return String(m.headline);
    return listing.name.replace(/-/g, " ").replace(/^\d{4}\s+/, "");
  }

  function openPdf(pdfUrl: string, name: string, title: string) {
    // Show full-screen iframe overlay with Done button
    setViewingPdf({ url: pdfUrl, name, title });
  }

  async function sharePdf(pdfUrl: string, name: string, title?: string) {
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const file = new File([blob], name, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: title || name, url: window.location.origin + pdfUrl });
        return;
      }
      await navigator.clipboard.writeText(window.location.origin + pdfUrl);
    } catch { /* cancelled */ }
  }

  async function deletePdf(listingName: string, pdfName?: string) {
    setDeleting(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing: listingName, pdf: pdfName }),
      });
      const data = await res.json();
      if (data.ok) {
        refreshListings();
        setAction(null);
        setConfirmDelete(null);
      }
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  async function deleteListing(listingName: string) {
    setDeleting(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing: listingName }),
      });
      const data = await res.json();
      if (data.ok) {
        refreshListings();
        setConfirmDelete(null);
      }
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  function brokerLabel(pdfName: string): string {
    if (pdfName.includes("-both")) return "Both";
    if (pdfName.includes("-paolo")) return "Paolo";
    return "Will";
  }

  return (
    <PageShell
      title="PDF Generator"
      subtitle="Generate branded listing PDFs from YachtWorld URLs"
    >

      {/* Generator Card */}
      <div className="card-elevated p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-[var(--brass-500)] text-white grid place-items-center text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          </div>
          <div className="card-section-title">Generate New PDF</div>
        </div>

        <div className="mb-3">
          <label className="form-label">Listing URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="denisonyachtsales.com or yachtworld.com URL"
            className="form-input"
            disabled={generating}
          />
        </div>

        <div className="mb-4">
          <label className="form-label">Broker Signature</label>
          <div className="flex gap-2">
            {([
              { value: "will", label: "Will", sub: "Noftsinger" },
              { value: "paolo", label: "Paolo", sub: "Ameglio" },
              { value: "both", label: "Both", sub: "Side by side" },
            ] as const).map(b => (
              <button
                key={b.value}
                onClick={() => setBroker(b.value)}
                disabled={generating}
                className={`flex-1 px-3 py-2 rounded-xl border text-left transition-all ${
                  broker === b.value
                    ? "bg-[var(--navy-800)] dark:bg-[var(--brass-500)] text-white dark:text-[var(--navy-900)] border-transparent"
                    : "bg-[var(--card)] text-[var(--navy-600)] dark:text-[var(--navy-300)] border-[var(--border)] hover:border-[var(--navy-300)]"
                }`}
              >
                <div className="text-sm font-semibold">{b.label}</div>
                <div className="text-xs opacity-60">{b.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Logo Branding</label>
          <div className="flex gap-2">
            {([
              { value: "slinger", label: "Yachtslinger", sub: "Slinger logo" },
              { value: "denison", label: "Denison", sub: "Denison logo" },
            ] as const).map(l => (
              <button
                key={l.value}
                onClick={() => setLogo(l.value)}
                disabled={generating}
                className={`flex-1 px-3 py-2 rounded-xl border text-left transition-all ${
                  logo === l.value
                    ? "bg-[var(--navy-800)] dark:bg-[var(--brass-500)] text-white dark:text-[var(--navy-900)] border-transparent"
                    : "bg-[var(--card)] text-[var(--navy-600)] dark:text-[var(--navy-300)] border-[var(--border)] hover:border-[var(--navy-300)]"
                }`}
              >
                <div className="text-sm font-semibold">{l.label}</div>
                <div className="text-xs opacity-60">{l.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !url.trim()}
          className="w-full py-3 rounded-xl font-semibold text-white text-sm disabled:opacity-50 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] transition-all"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Generating... (30-60s)
            </span>
          ) : "Generate Branded PDF"}
        </button>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            ❌ {error}
          </div>
        )}

        {result?.ok && result.pdfs && (
          <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="text-sm font-semibold text-green-800 dark:text-green-400 mb-2">✅ PDF Generated!</div>
            {result.pdfs.map(pdf => (
              <button
                key={pdf.name}
                onClick={() => setAction({ url: pdf.downloadUrl, name: pdf.name, title: result.listing || pdf.name, listing: result.listing || "" })}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white dark:bg-neutral-800 border border-green-200 dark:border-green-800 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <div>
                    <div className="text-sm font-medium dark:text-white">{pdf.name}</div>
                    <div className="text-xs text-gray-400">{formatSize(pdf.size)}</div>
                  </div>
                </div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Tap to open ›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PDF Library */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-500 text-white grid place-items-center text-sm">📚</div>
          <div>
            <div className="font-bold text-sm dark:text-white">PDF Library</div>
            <div className="text-xs text-gray-400">{listings.length} listing{listings.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🚢</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">No PDFs generated yet</div>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(listing => (
              <div key={listing.name} className="border border-gray-100 dark:border-neutral-800 rounded-xl p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold dark:text-white truncate">{getDisplayName(listing)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(listing.created)} · {listing.pdfs.length} PDF{listing.pdfs.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  {/* Delete listing button */}
                  <button
                    onClick={() => setConfirmDelete({ listing: listing.name, title: getDisplayName(listing) })}
                    className="shrink-0 w-8 h-8 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 grid place-items-center transition-colors"
                    title="Delete listing"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {listing.pdfs.map(pdf => (
                    <button
                      key={pdf.name}
                      onClick={() => setAction({ url: pdf.downloadUrl, name: pdf.name, title: getDisplayName(listing), listing: listing.name })}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors text-xs font-medium dark:text-white"
                    >
                      📄 {brokerLabel(pdf.name)}
                      <span className="text-gray-400 ml-1">{formatSize(pdf.size)}</span>
                      <span className="text-blue-400 ml-1">›</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Action Sheet ═══ */}
      {action && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={() => setAction(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl animate-[slideUp_0.2s_ease-out]"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-neutral-700" />
            </div>

            <div className="flex items-center gap-3 px-5 pb-4">
              <div className="w-11 h-14 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 flex items-center justify-center shrink-0">
                <span className="text-xl">📄</span>
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold dark:text-white truncate">{action.title}</p>
                <p className="text-[12px] text-gray-400">{brokerLabel(action.name)} · {action.name}</p>
              </div>
            </div>

            <div className="px-5 space-y-2 pb-3">
              {/* Open in full-screen viewer */}
              <button
                onClick={() => { const a = action; setAction(null); openPdf(a.url, a.name, a.title); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-[15px] active:scale-[0.98] transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                View PDF
              </button>

              {/* Share */}
              <button
                onClick={() => { const a = action; setAction(null); sharePdf(a.url, a.name, a.title); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-white font-semibold text-[15px] active:scale-[0.98] transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share PDF
              </button>

              {/* Delete this PDF */}
              <button
                onClick={() => { deletePdf(action.listing, action.name); }}
                disabled={deleting}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl text-red-500 font-semibold text-[15px] active:scale-[0.98] transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {deleting ? "Deleting..." : "Delete PDF"}
              </button>

              <button
                onClick={() => setAction(null)}
                className="w-full py-3 rounded-2xl text-blue-500 font-semibold text-[15px] active:bg-gray-100 dark:active:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Confirm Delete Listing Dialog ═══ */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setConfirmDelete(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-neutral-900 rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🗑️</div>
              <h3 className="text-lg font-bold dark:text-white">Delete Listing?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                This will permanently delete all PDFs for<br/>
                <strong className="dark:text-white">{confirmDelete.title}</strong>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteListing(confirmDelete.listing)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-red-500 text-white active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Full-Screen PDF Viewer ═══ */}
      {viewingPdf && (
        <div className="fixed inset-0 z-[10000] bg-white dark:bg-black flex flex-col">
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-4 bg-gray-50 dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 shrink-0"
            style={{ paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: 12, minHeight: 64 }}
          >
            {/* Done button — big tap target, iOS style */}
            <button
              onClick={() => setViewingPdf(null)}
              style={{ WebkitTapHighlightColor: "transparent", minWidth: 72, minHeight: 44 }}
              className="flex items-center justify-center px-4 py-2 rounded-xl bg-blue-500 text-white font-bold text-[16px] active:opacity-70 transition-opacity"
            >
              ✕ Done
            </button>
            <div className="flex-1 text-center mx-3 min-w-0">
              <p className="text-[13px] font-semibold dark:text-white truncate">{viewingPdf.title}</p>
              <p className="text-[11px] text-gray-400 truncate">{viewingPdf.name}</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(viewingPdf.url);
                  const blob = await res.blob();
                  const file = new File([blob], viewingPdf.name, { type: "application/pdf" });
                  if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file] });
                  } else if (navigator.share) {
                    await navigator.share({ title: viewingPdf.name, url: window.location.origin + viewingPdf.url });
                  }
                } catch { /* cancelled */ }
              }}
              style={{ minWidth: 44, minHeight: 44, WebkitTapHighlightColor: "transparent" }}
              className="flex items-center justify-center rounded-xl text-blue-500 active:opacity-60"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>

          {/* PDF rendered via PDF.js — all pages scrollable */}
          <iframe
            src={`/pdf-viewer.html?url=${encodeURIComponent(viewingPdf.url)}`}
            className="flex-1 w-full border-0"
            title={viewingPdf.name}
            style={{ WebkitOverflowScrolling: "touch" }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </PageShell>
  );
}
