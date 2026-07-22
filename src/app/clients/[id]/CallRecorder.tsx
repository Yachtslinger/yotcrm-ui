"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, Loader2, Phone } from "lucide-react";

type CallRow = { id: number; duration_sec: number; summary: string | null; has_transcript: number; created_at: string };

// Minimal typings for the vendor-prefixed SpeechRecognition API
type SR = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null };

export default function CallRecorder({ leadId }: { leadId: number }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const srRef = useRef<SR | null>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/calls?leadId=${leadId}`);
      const j = await r.json();
      setCalls(j.calls || []);
    } catch { /* ignore */ }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      transcriptRef.current = "";
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(1000);
      mediaRef.current = mr;

      // Live transcription where the browser supports it (Chrome, Safari 14.5+)
      const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
      const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
      if (Ctor) {
        const sr = new Ctor();
        sr.continuous = true; sr.interimResults = false; sr.lang = "en-US";
        sr.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) transcriptRef.current += e.results[i][0].transcript + " ";
          }
        };
        sr.onend = () => { try { if (mediaRef.current?.state === "recording") sr.start(); } catch { /* ok */ } };
        try { sr.start(); srRef.current = sr; } catch { /* unsupported */ }
      }

      startedRef.current = Date.now();
      setElapsed(0); setRecording(true); setLastSummary(null);
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    } catch {
      alert("Microphone access denied — enable it in your browser settings.");
    }
  };

  const stop = async () => {
    const mr = mediaRef.current;
    if (!mr) return;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    try { srRef.current?.stop(); } catch { /* ok */ }
    srRef.current = null;

    const done = new Promise<void>(resolve => { mr.onstop = () => resolve(); });
    mr.stop();
    mr.stream.getTracks().forEach(t => t.stop());
    await done;

    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      const fd = new FormData();
      fd.append("leadId", String(leadId));
      fd.append("duration", String(Math.floor((Date.now() - startedRef.current) / 1000)));
      fd.append("transcript", transcriptRef.current.trim());
      fd.append("audio", blob, "call");
      const r = await fetch("/api/calls", { method: "POST", body: fd });
      const j = await r.json();
      if (j?.analysis?.summary) {
        setLastSummary(j.analysis.summary);
        setTimeout(() => window.location.reload(), 2500);
      }
      load();
    } finally { setUploading(false); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Phone className="w-4 h-4 text-emerald-600" /> Call recorder
          <span className="text-[10px] font-normal opacity-60">FL law: tell them you're recording (all-party consent)</span>
        </div>
        {!recording && !uploading && (
          <button onClick={start} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700">
            <Mic className="w-4 h-4" /> Record call
          </button>
        )}
        {recording && (
          <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 text-white px-3 py-1.5 text-sm animate-pulse">
            <Square className="w-4 h-4" /> Stop · {fmt(elapsed)}
          </button>
        )}
        {uploading && (
          <span className="inline-flex items-center gap-1.5 text-sm opacity-70"><Loader2 className="w-4 h-4 animate-spin" /> Saving &amp; analyzing…</span>
        )}
      </div>
      {recording && <p className="text-xs opacity-60 mt-2">Recording — put the call on speaker so both sides are captured. Live transcript builds silently.</p>}
      {lastSummary && (
        <p className="text-sm mt-2 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 rounded p-2">
          ✅ Profile updated: {lastSummary}
        </p>
      )}
      {calls.length > 0 && (
        <div className="mt-3 space-y-2">
          {calls.map(c => (
            <div key={c.id} className="text-xs border-t pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="opacity-60">{String(c.created_at).slice(0, 16).replace("T", " ")}</span>
                <span className="opacity-60">· {fmt(c.duration_sec || 0)}</span>
                <button className="underline opacity-70 hover:opacity-100" onClick={() => setPlaying(playing === c.id ? null : c.id)}>
                  {playing === c.id ? "hide" : "play"}
                </button>
                {!c.has_transcript && <span className="text-amber-600">no transcript (browser unsupported) — audio saved</span>}
              </div>
              {playing === c.id && <audio controls autoPlay className="mt-1 w-full h-8" src={`/api/calls/audio/${c.id}`} />}
              {c.summary && <p className="mt-1 opacity-80">{c.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
