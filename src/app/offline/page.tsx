"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, Anchor } from "lucide-react";

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  /* Auto-redirect when back online */
  useEffect(() => {
    if (isOnline) {
      window.location.href = "/dashboard";
    }
  }, [isOnline]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--navy-950, #0a1628)" }}>
      <div className="text-center max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Anchor className="w-8 h-8" style={{ color: "var(--brass-400, #c9a55c)" }} strokeWidth={2} />
          <span className="text-xl font-bold tracking-tight"
            style={{ color: "#fff", fontFamily: "var(--font-display, 'DM Sans')" }}>
            YotCRM
          </span>
        </div>

        {/* Offline icon */}
        <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ background: "rgba(201, 165, 92, 0.1)" }}>
          <WifiOff className="w-10 h-10" style={{ color: "var(--brass-400, #c9a55c)" }} />
        </div>

        <h1 className="text-2xl font-bold mb-3"
          style={{ color: "#fff", fontFamily: "var(--font-display, 'DM Sans')" }}>
          You&apos;re Offline
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          Check your connection and try again. YotCRM will automatically
          reconnect when you&apos;re back online.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: "var(--brass-400, #c9a55c)",
            color: "var(--navy-950, #0a1628)",
          }}>
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
