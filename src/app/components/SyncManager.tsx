"use client";

import { useEffect, useCallback, useState } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { replay, count } from "@/lib/offlineQueue";
import { usePrefetchCache } from "@/lib/usePrefetchCache";

type SyncState = "idle" | "syncing" | "success" | "error";

export default function SyncManager() {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [queueCount, setQueueCount] = useState(0);
  const [syncResult, setSyncResult] = useState<string>("");

  // Warm the cache on load
  usePrefetchCache();

  const doSync = useCallback(async () => {
    const pending = await count();
    if (pending === 0) return;

    setSyncState("syncing");
    try {
      const result = await replay();
      if (result.failed === 0) {
        setSyncState("success");
        setSyncResult(`${result.success} change${result.success !== 1 ? "s" : ""} synced`);
      } else {
        setSyncState("error");
        setSyncResult(`${result.success} synced, ${result.failed} failed`);
      }
      setTimeout(() => setSyncState("idle"), 4000);
    } catch {
      setSyncState("error");
      setSyncResult("Sync failed");
      setTimeout(() => setSyncState("idle"), 4000);
    }
  }, []);

  // Check queue size periodically
  useEffect(() => {
    const check = async () => {
      try { setQueueCount(await count()); } catch {}
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const onOnline = () => {
      setTimeout(doSync, 1500); // Brief delay to let connection stabilize
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [doSync]);

  // Listen for SW sync messages
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SW_SYNC_READY") doSync();
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [doSync]);

  // Nothing to show when idle with no queue
  if (syncState === "idle" && queueCount === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-4">
      {/* Pending badge */}
      {syncState === "idle" && queueCount > 0 && (
        <button
          onClick={doSync}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: "var(--brass-400, #c9a55c)",
            color: "var(--navy-950, #0a1628)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}>
          <RefreshCw className="w-3.5 h-3.5" />
          {queueCount} pending — tap to sync
        </button>
      )}

      {/* Syncing spinner */}
      {syncState === "syncing" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{
            background: "var(--card, #fff)",
            border: "1px solid var(--border, #e5e5e5)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          }}>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--brass-400)" }} />
          <span>Syncing…</span>
        </div>
      )}

      {/* Success */}
      {syncState === "success" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold animate-slide-up"
          style={{
            background: "var(--green-500, #22c55e)",
            color: "#fff",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}>
          <Check className="w-3.5 h-3.5" />
          {syncResult}
        </div>
      )}

      {/* Error */}
      {syncState === "error" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold animate-slide-up"
          style={{
            background: "var(--red-500, #ef4444)",
            color: "#fff",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}>
          <AlertCircle className="w-3.5 h-3.5" />
          {syncResult}
        </div>
      )}
    </div>
  );
}
