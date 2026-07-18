"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { Users, Check } from "lucide-react";

type Contact = { id: number; first_name: string; last_name: string; email: string; phone: string;
  company: string|null; notes: string|null; suggested_category: string|null;
  prospect_score: number|null; suggest_reason: string|null; last_contacted_at: string|null };

const CATS: [string, string, string][] = [
  ["active_buyer", "Buyer", "bg-green-600"],
  ["owner_seller", "Seller", "bg-emerald-600"],
  ["past_client", "Past client", "bg-blue-600"],
  ["co_broker", "Industry", "bg-indigo-600"],
  ["vendor", "Vendor", "bg-slate-600"],
  ["dead_dnc", "Not a prospect", "bg-neutral-600"],
];

export default function ContactTriagePage() {
  const [batch, setBatch] = useState<Contact[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/contact-triage");
    const j = await r.json();
    setBatch(j.batch); setRemaining(j.remaining); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, category: string) => {
    setBatch(b => b.filter(c => c.id !== id));
    setRemaining(n => n - 1);
    await fetch("/api/contact-triage", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }) });
  };

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-1">
          <Users className="w-6 h-6" />
          <h1 className="text-2xl font-semibold">Contact triage</h1>
        </div>
        <p className="text-sm opacity-70 mb-5">
          {remaining} contacts left to sort · best prospects first (AI pre-scored — your tap is the verdict).
          Tap the AI&apos;s suggestion if it looks right, or any other button. Do a batch whenever you have five minutes.
        </p>
        {loading && <p className="opacity-60">Loading batch…</p>}
        {!loading && batch.length === 0 && (
          <div className="rounded-lg border p-6 text-center opacity-80">
            <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
            All contacts sorted. New arrivals will appear here automatically.
          </div>
        )}
        {batch.map(c => (
          <div key={c.id} className="rounded-lg border mb-3 p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium">
                  {c.first_name} {c.last_name}
                  {c.prospect_score != null && c.prospect_score >= 50 &&
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-600">
                      prospect score {Math.round(c.prospect_score)}</span>}
                </div>
                <div className="text-sm opacity-60 truncate">
                  {[c.email, c.phone, c.company].filter(Boolean).join(" · ")}
                </div>
                {c.suggest_reason && <div className="text-xs opacity-70 mt-0.5">AI: {c.suggest_reason}</div>}
                {c.notes && <div className="text-xs opacity-60 mt-1 line-clamp-2">{c.notes}</div>}
              </div>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {CATS.map(([val, label, color]) => (
                <button key={val}
                  className={`px-2.5 py-1 rounded text-xs text-white ${color} ${c.suggested_category === val ? "ring-2 ring-offset-1 ring-amber-400" : "opacity-80 hover:opacity-100"}`}
                  onClick={() => decide(c.id, val)}>
                  {label}{c.suggested_category === val ? " ✦" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!loading && batch.length > 0 && (
          <button className="btn-secondary w-full mt-2" onClick={load}>Load next batch</button>
        )}
      </div>
    </PageShell>
  );
}
