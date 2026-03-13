"use client";

import React from "react";
import { ExternalLink, BookOpen, RefreshCw } from "lucide-react";
import PageShell from "../components/PageShell";

type Brochure = {
  slug: string;
  title: string;
  subtitle: string;
  builder: string;
  year: string;
  tag: string;
  updatedAt: string;
};

export default function BrochuresPage() {
  const [brochures, setBrochures] = React.useState<Brochure[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function fetchBrochures() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/brochures");
      const data = await res.json();
      if (data.ok) setBrochures(data.brochures);
      else setError("Could not load brochures.");
    } catch {
      setError("Brochures directory not reachable. Make sure YotCRM is running locally.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchBrochures(); }, []);

  const tagColor = (tag: string) => {
    if (tag === "New Build") return { bg: "rgba(16,185,129,0.12)", color: "#059669" };
    if (tag === "Interior")  return { bg: "rgba(139,92,246,0.12)", color: "#7c3aed" };
    return { bg: "rgba(201,165,92,0.12)", color: "var(--brass-400)" };
  };

  return (
    <PageShell
      title="E-Brochures"
      subtitle={`${brochures.length} brochure${brochures.length !== 1 ? "s" : ""} available`}
      actions={
        <button onClick={fetchBrochures}
          className="btn-ghost flex items-center gap-1.5 text-sm"
          title="Refresh">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-xl p-6 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--navy-500)" }}>{error}</p>
        </div>
      )}

      {!loading && !error && brochures.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <BookOpen className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--navy-500)" }}>No brochures found</p>
          <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>
            Add HTML brochure files to <code className="font-mono text-xs">~/YotCRM/Brochures/</code>
          </p>
        </div>
      )}

      {!loading && brochures.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brochures.map(b => {
            const tc = tagColor(b.tag);
            return (
              <div key={b.slug}
                className="rounded-xl overflow-hidden transition-shadow hover:shadow-lg"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}>

                {/* Color band */}
                <div className="h-1.5" style={{ background: "var(--brass-400)" }} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: tc.bg, color: tc.color }}>
                          {b.tag}
                        </span>
                        {b.year && (
                          <span className="text-[10px] font-medium" style={{ color: "var(--navy-400)" }}>
                            {b.year}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold leading-snug" style={{ color: "var(--foreground)" }}>
                        {b.title}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: "var(--navy-500)" }}>
                        {b.subtitle}
                      </p>
                      {b.builder && (
                        <p className="text-xs mt-1 font-medium" style={{ color: "var(--brass-400)" }}>
                          {b.builder}
                        </p>
                      )}
                    </div>
                    <BookOpen className="w-8 h-8 shrink-0 mt-1" style={{ color: "var(--navy-300)" }} />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <a
                      href={`/api/brochures/${b.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{ background: "var(--brass-400)", color: "#fff" }}>
                      <ExternalLink className="w-4 h-4" />
                      Open Brochure
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-center mt-6" style={{ color: "var(--navy-300)" }}>
        Brochures are served from <code className="font-mono">~/YotCRM/Brochures/</code> —
        add new HTML files there to have them appear automatically.
      </p>
    </PageShell>
  );
}
