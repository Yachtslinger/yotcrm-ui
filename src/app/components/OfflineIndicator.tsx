"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => { setIsOffline(true); setShow(true); };
    const goOnline = () => {
      setIsOffline(false);
      // Show "back online" briefly then hide
      setTimeout(() => setShow(false), 2000);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Show on initial offline state
  useEffect(() => {
    if (isOffline) setShow(true);
  }, [isOffline]);

  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className="mt-2 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-semibold pointer-events-auto animate-slide-down"
        style={{
          background: isOffline ? "var(--red-500, #ef4444)" : "var(--green-500, #22c55e)",
          color: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
        {isOffline ? (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            <span>No connection — viewing cached data</span>
          </>
        ) : (
          <span>Back online ✓</span>
        )}
      </div>
    </div>
  );
}
