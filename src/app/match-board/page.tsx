"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { Anchor, X, Send, RefreshCw } from "lucide-react";

type Match = { buyerId: number; buyer: string; pending: boolean; temp: string; listingId: number;
  boat: string; loa: number|null; price: number|null; location: string|null;
  url: string|null; score: number; reasons: string[] };

const TEMP_CHIP: Record<string, [string, string]> = {
  hot:  ["🔥 hot", "bg-red-500/15 text-red-600"],
  warm: ["warm", "bg-orange-500/15 text-orange-600"],
  cool: ["cool", "bg-sky-500/15 text-sky-600"],
  cold: ["🧊 cold — re-engage?", "bg-slate-500/15 text-slate-500"],
  unknown: ["recency unknown", "bg-slate-500/10 text-slate-400"],
};

export default function MatchBoardPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [meta, setMeta] = useState({ buyerCount: 0, listingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [botMsg, setBotMsg] = useState<string>("");
  const [botBusy, setBotBusy] = useState(false);

  const runDraftBot = async () => {
    setBotBusy(true); setBotMsg("");
    try {
      const r = await fetch("/api/draft-bot", { method: "POST" });
      const j = await r.json();
      setBotMsg(j.note ? j.note :
        j.drafted > 0 ? `✉️ ${j.drafted} drafts written — review & send in Bot Queue` :
        `No new matches ≥70 to draft (${j.candidatesAboveThreshold ?? 0} candidates, all handled)`);
    } catch { setBotMsg("Draft bot failed — try again"); }
    setBotBusy(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/match-board");
    const j = await r.json();
    setMatches(j.matches); setMeta({ buyerCount: j.buyerCount, listingCount: j.listingCount });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (m: Match, action: "dismissed"|"sent") => {
    setMatches(ms => ms.filter(x => !(x.listingId === m.listingId && x.buyerId === m.buyerId)));
    await fetch("/api/match-board", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: m.listingId, leadId: m.buyerId, action }) });
  };

  const byBuyer = matches.reduce<Record<string, Match[]>>((acc, m) => {
    (acc[m.buyer] = acc[m.buyer] || []).push(m); return acc;
  }, {});

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Anchor className="w-6 h-6" />
            <h1 className="text-2xl font-semibold">Match board</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary flex items-center gap-1.5" disabled={botBusy} onClick={runDraftBot}
              title="Writes outreach emails for matches scoring 70+ (approved profiles only) into the Bot Queue — you review and send">
              ✉️ {botBusy ? "Drafting…" : "Draft emails"}
            </button>
            <button className="btn-secondary flex items-center gap-1.5" onClick={load}>
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
        {botMsg && <p className="text-sm mb-2 text-amber-600">{botMsg} {botMsg.includes("Bot Queue") && <a href="/botqueue" className="underline">Open Bot Queue →</a>}</p>}
        <p className="text-sm opacity-70 mb-5">
          {matches.length} matches · {meta.buyerCount} buyers with profiles · {meta.listingCount} listings (45 days).
          Amber rows are from <a href="/profile-review" className="underline">unapproved draft profiles</a> — approve to make them real.
        </p>
        {loading && <p className="opacity-60">Scoring listings against your buyers…</p>}
        {!loading && matches.length === 0 && (
          <div className="rounded-lg border p-6 text-center opacity-80">
            No matches above threshold. Approve more profiles at <a href="/profile-review" className="underline">/profile-review</a>,
            or wait for tonight&apos;s digest to bring fresh inventory.
          </div>
        )}
        {Object.entries(byBuyer).map(([buyer, ms]) => (
          <div key={buyer} className="mb-5">
            <h2 className="font-medium mb-2">{buyer}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${TEMP_CHIP[ms[0].temp]?.[1] ?? ""}`}>{TEMP_CHIP[ms[0].temp]?.[0] ?? ms[0].temp}</span>
              {ms[0].pending && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-600">draft profile — pending approval</span>}
            </h2>

            {ms.map(m => (
              <div key={`${m.listingId}-${m.buyerId}`}
                className={`rounded-lg border p-3 mb-2 flex items-center justify-between gap-3 ${m.pending ? "border-amber-400/50" : ""}`}>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="hover:underline">{m.boat}</a> : m.boat}
                    <span className="ml-2 text-sm opacity-70">
                      {m.loa ? `${Math.round(m.loa)}ft` : ""}{m.price ? ` · $${(m.price/1e6).toFixed(2)}M` : ""}{m.location ? ` · ${m.location}` : ""}
                    </span>
                  </div>
                  <div className="text-xs opacity-60 truncate">{m.reasons.join(" · ")}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold w-10 text-right">{m.score}</span>
                  <button className="btn-secondary flex items-center gap-1" title="Not for this client — the board learns from this"
                    onClick={() => act(m, "dismissed")}><X className="w-4 h-4" /></button>
                  <button className="btn-primary flex items-center gap-1" title="Mark as sent to client"
                    onClick={() => act(m, "sent")}><Send className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
