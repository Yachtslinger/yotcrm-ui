/* ═══════════════════════════════════════════
   YotCRM — Global Fetch Interceptor
   Wraps window.fetch to automatically queue
   mutations when offline. No component changes needed.
   ═══════════════════════════════════════════ */

"use client";

import { useEffect, useRef } from "react";
import { enqueue } from "@/lib/offlineQueue";
import { useToast } from "./ToastProvider";

// Endpoints that should NEVER be queued (auth, file uploads, scraping)
const SKIP_QUEUE = [
  "/api/auth/",
  "/api/scrape",
  "/api/pdf",
  "/api/intake/screenshot",
  "/api/sync",
  "/api/share",
];

// Methods that represent mutations
const MUTATION_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

export default function FetchInterceptor() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = (init?.method || "GET").toUpperCase();

      // Only intercept API mutations
      const isApiMutation =
        url.startsWith("/api/") &&
        MUTATION_METHODS.includes(method) &&
        !SKIP_QUEUE.some((skip) => url.startsWith(skip));

      if (!isApiMutation) {
        return originalFetch(input, init);
      }

      // Try the network first
      try {
        const resp = await originalFetch(input, init);
        return resp;
      } catch (err) {
        // Network failed — queue the mutation for later
        if (!navigator.onLine) {
          try {
            await enqueue({
              url,
              method,
              body: typeof init?.body === "string" ? init.body : null,
              headers: (init?.headers as Record<string, string>) || {
                "Content-Type": "application/json",
              },
            });

            // Show toast notification
            toastRef.current("Saved offline — will sync when connected", "info");

            // Return a synthetic 202 so the UI doesn't crash
            return new Response(
              JSON.stringify({
                ok: true,
                queued: true,
                message: "Saved offline — will sync when connected",
              }),
              {
                status: 202,
                headers: { "Content-Type": "application/json" },
              }
            );
          } catch {
            throw err;
          }
        }
        // Online but fetch failed (server error) — don't queue
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
