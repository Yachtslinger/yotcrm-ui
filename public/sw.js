/* ═══════════════════════════════════════════
   YotCRM Service Worker — v6 (Full PWA)
   ═══════════════════════════════════════════ */
const CACHE_VERSION = "yotcrm-v7";
const STATIC_CACHE = "yotcrm-static-v7";
const API_CACHE = "yotcrm-api-v7";
const OFFLINE_URL = "/offline";

/* ─── Precache: app shell essentials ─── */
const PRECACHE_URLS = [
  "/offline",
  "/login",
  "/dashboard",
  "/clients",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ─── Install: precache shell ─── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

/* ─── Activate: clean old caches ─── */
self.addEventListener("activate", (event) => {
  const keep = [STATIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ─── Periodic API cache cleanup (max 24h) ─── */
const API_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
async function cleanApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  for (const req of keys) {
    const resp = await cache.match(req);
    if (resp) {
      const date = resp.headers.get("date");
      if (date && Date.now() - new Date(date).getTime() > API_CACHE_MAX_AGE) {
        await cache.delete(req);
      }
    }
  }
}

/* ─── Fetch strategies ─── */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const { pathname } = url;

  // Skip non-GET, chrome extensions, etc.
  if (event.request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // ── Strategy 1: API calls ──
  // Critical data endpoints → Stale-while-revalidate (instant load + background refresh)
  // Other read APIs → Network-first with cache fallback
  if (pathname.startsWith("/api/")) {
    // Never cache auth, sync, or mutation endpoints
    if (
      pathname.includes("/auth/") ||
      pathname.includes("/sync") ||
      pathname.includes("/upload") ||
      pathname.includes("/toggle")
    ) return;

    // Critical data that should load instantly from cache
    const isCritical = ["/api/clients", "/api/todos", "/api/calendar", "/api/offmarket", "/api/analytics"].some(
      (p) => pathname === p || pathname.startsWith(p + "?") || pathname.startsWith(p + "/")
    );

    if (isCritical) {
      // Stale-while-revalidate: serve cache instantly, update in background
      event.respondWith(
        caches.open(API_CACHE).then((cache) =>
          cache.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request).then((resp) => {
              if (resp.ok) cache.put(event.request, resp.clone());
              return resp;
            });
            return cached || networkFetch;
          })
        )
      );
      return;
    }

    // Other API calls → Network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(API_CACHE).then((c) => c.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Strategy 2: Static assets → Cache-first ──
  if (
    pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|webp)$/) ||
    pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((resp) => {
          if (resp.status === 200) {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone));
          }
          return resp;
        })
      )
    );
    return;
  }

  // ── Strategy 3: Navigation → Network-first, offline fallback ──
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
});

/* ─── Background sync for offline mutations ─── */
self.addEventListener("sync", (event) => {
  if (event.tag === "yotcrm-sync") {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  // Open IndexedDB offline queue and replay
  // (Handled by the app's OfflineQueue utility)
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "SW_SYNC_READY" });
  });
}

/* ─── Push notifications (future) ─── */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "YotCRM", {
      body: data.body || "New lead received",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "yotcrm-notification",
      data: { url: data.url || "/clients" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
