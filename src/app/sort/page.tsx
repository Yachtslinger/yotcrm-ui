"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import PageShell from "../components/PageShell";
import { Undo2, SkipForward, MessageSquareText, Zap } from "lucide-react";
import Link from "next/link";

type QItem = {
  id: number; first_name: string; last_name: string; email: string | null; phone: string | null;
  source: string | null; created_at: string; last_contacted_at: string | null; dossier: string | null;
  suggested_category: string | null; prospect_score: number | null; suggest_reason: string | null;
  notes: string | null; msg_count: number | null; last_msg_at: string | null;
};

const CATS: [string, string, string][] = [
  ["active_buyer", "Buyer", "1"], ["owner_seller", "Seller", "2"], ["past_client", "Past client", "3"],
  ["co_broker", "Co-broker", "4"], ["vendor", "Vendor", "5"], ["dead_dnc", "Dead / DNC", "6"],
];

export default function SortPage() {
  const [queue, setQueue] = useState<QItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [sortedToday, setSortedToday] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ id: number; name: string; cat: string | null } | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const load = useCallback(async () => {
    const r = await fetch("/api/sort-queue");
    const j = await r.json();
    setQueue(j.queue || []); setRemaining(j.remaining || 0); setSortedToday(j.sortedToday || 0);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (cat: string | null) => {
    const it = queueRef.current[0];
    if (!it || busy) return;
    setBusy(true);
    setQueue(q => q.slice(1)); setRemaining(r => r - 1); setSortedToday(s => s + 1);
    setLast({ id: it.id, name: `${it.first_name} ${it.last_name}`.trim(), cat });
    await fetch(`/api/clients/${it.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cat ? { category: cat, sorted_at: new Date().toISOString() } : { sorted_at: new Date().toISOString() }),
    });
    setBusy(false);
    if (queueRef.current.length < 5) load();
  }, [busy, load]);

  const undo = useCallback(async () => {
    if (!last) return;
    await fetch(`/api/clients/${last.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: null, sorted_at: null }),
    });
    setLast(null); load();
  }, [last, load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = CATS.find(x => x[2] === e.key);
      if (c) decide(c[0]);
      else if (e.key === "s" || e.key === "0") decide(null);
      else if (e.key === "u") undo();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decide, undo]);

  const it = queue[0];
  const fmt = (d: string | null) => d ? String(d).slice(0, 10) : null;

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-semibold">Sort contacts</h1>
          </div>
          <div className="text-sm opacity-70">{sortedToday} sorted today · {remaining.toLocaleString()} to go</div>
        </div>

        {!it && (
          <div className="rounded-xl border p-10 text-center">
            <p className="text-lg font-medium mb-1">All sorted. 🎉</p>
            <p className="text-sm opacity-70">Every contact has a category. Check <Link className="underline" href="/clients">Leads</Link>.</p>
          </div>
        )}

        {it && (
          <div className="rounded-xl border shadow-sm p-6">
            <div className="mb-1 flex items-baseline gap-3 flex-wrap">
              <Link href={`/clients/${it.id}`} target="_blank" className="text-2xl font-semibold hover:underline">
                {(it.first_name || "") + " " + (it.last_name || "") || "(no name)"}
              </Link>
              {it.prospect_score != null && <span className="text-xs rounded-full bg-blue-600/10 text-blue-600 px-2 py-0.5">score {it.prospect_score}</span>}
            </div>
            <div className="text-sm opacity-70 mb-3 space-x-3">
              {it.email && <span>{it.email}</span>}
              {it.phone && <span>{it.phone}</span>}
              {it.source && <span>via {it.source}</span>}
            </div>
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              {it.msg_count != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 text-emerald-600 px-2 py-1">
                  <MessageSquareText className="w-3.5 h-3.5" /> {it.msg_count} texts · last {fmt(it.last_msg_at)}
                </span>
              )}
              {it.last_contacted_at && <span className="rounded-full border px-2 py-1">last contact {fmt(it.last_contacted_at)}</span>}
              {it.created_at && <span className="rounded-full border px-2 py-1 opacity-70">added {fmt(it.created_at)}</span>}
            </div>
            {it.dossier && (
              <p className="text-sm bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded p-3 mb-3 whitespace-pre-wrap">{it.dossier}</p>
            )}
            {!it.dossier && it.suggest_reason && (
              <p className="text-xs opacity-70 mb-3">Hint: {it.suggest_reason}</p>
            )}
            {!it.dossier && it.notes && (
              <p className="text-xs opacity-60 mb-3 line-clamp-3">{it.notes}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {CATS.map(([v, label, key]) => (
                <button key={v} disabled={busy}
                  className={`rounded-lg border py-3 text-sm font-medium hover:bg-blue-600 hover:text-white transition ${it.suggested_category === v ? "border-blue-500 ring-1 ring-blue-500" : ""}`}
                  onClick={() => decide(v)}>
                  {label} <span className="opacity-40 text-xs ml-1">{key}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <button className="text-sm opacity-70 hover:opacity-100 inline-flex items-center gap-1" onClick={() => decide(null)} disabled={busy}>
                <SkipForward className="w-4 h-4" /> Skip — decide later <span className="opacity-40 text-xs">s</span>
              </button>
              {last && (
                <button className="text-sm opacity-70 hover:opacity-100 inline-flex items-center gap-1" onClick={undo}>
                  <Undo2 className="w-4 h-4" /> Undo {last.name} <span className="opacity-40 text-xs">u</span>
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-xs opacity-50 mt-3 text-center">Keyboard: 1–6 categories · s skip · u undo. Suggested category is outlined in blue.</p>
      </div>
    </PageShell>
  );
}
