/* ═══════════════════════════════════════════
   YotCRM — Offline-aware API helper
   Drop-in replacement for fetch() on mutations.
   GET requests pass through to regular fetch
   (service worker handles caching for those).
   ═══════════════════════════════════════════ */

import { offlineFetch } from "./offlineQueue";

type ApiOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

async function request(
  url: string,
  method: string,
  opts: ApiOptions = {}
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return offlineFetch(url, init);
}

export const api = {
  get: (url: string) => fetch(url), // GETs go through normal fetch (SW caches)
  post: (url: string, body?: unknown) => request(url, "POST", { body }),
  put: (url: string, body?: unknown) => request(url, "PUT", { body }),
  delete: (url: string, body?: unknown) => request(url, "DELETE", { body }),
  patch: (url: string, body?: unknown) => request(url, "PATCH", { body }),
};

export default api;
