"use client";

import { useEffect, useRef } from "react";

/* ═══════════════════════════════════════════
   Prefetch critical API data into SW cache
   on app load so it's available offline.
   ═══════════════════════════════════════════ */

const PREFETCH_URLS = [
  "/api/clients",
  "/api/todos",
  "/api/calendar",
  "/api/offmarket",
  "/api/analytics",
];

export function usePrefetchCache() {
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    // Wait until the app is idle, then prefetch
    const prefetch = async () => {
      for (const url of PREFETCH_URLS) {
        try {
          await fetch(url, { priority: "low" } as any);
        } catch {
          // Silently skip — we're just warming the cache
        }
      }
    };

    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(prefetch);
    } else {
      setTimeout(prefetch, 3000);
    }
  }, []);
}
