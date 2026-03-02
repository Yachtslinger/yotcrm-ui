/* ═══════════════════════════════════════════
   YotCRM — Offline Mutation Queue
   IndexedDB-backed queue for offline writes
   ═══════════════════════════════════════════ */

const DB_NAME = "yotcrm-offline";
const DB_VERSION = 1;
const STORE_NAME = "mutations";

export interface QueuedMutation {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  timestamp: number;
  retries: number;
}

/* ─── Open IndexedDB ─── */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ─── Enqueue a mutation ─── */
export async function enqueue(mutation: Omit<QueuedMutation, "id" | "timestamp" | "retries">): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({
      ...mutation,
      timestamp: Date.now(),
      retries: 0,
    });
    tx.oncomplete = () => {
      resolve();
      // Request background sync if available
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready.then((reg) => {
          (reg as any).sync?.register("yotcrm-sync").catch(() => {});
        });
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

/* ─── Get all queued mutations (oldest first) ─── */
export async function getAll(): Promise<QueuedMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ─── Remove a mutation by id ─── */
export async function remove(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ─── Get queue count ─── */
export async function count(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ─── Replay all queued mutations ─── */
const MAX_RETRIES = 3;

export async function replay(): Promise<{ success: number; failed: number }> {
  const mutations = await getAll();
  let success = 0;
  let failed = 0;

  for (const m of mutations) {
    try {
      const resp = await fetch(m.url, {
        method: m.method,
        headers: m.headers,
        body: m.body,
      });
      if (resp.ok) {
        await remove(m.id!);
        success++;
      } else if (m.retries >= MAX_RETRIES) {
        await remove(m.id!); // drop after max retries
        failed++;
      } else {
        // Increment retry count
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ ...m, retries: m.retries + 1 });
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { success, failed };
}

/* ─── Offline-aware fetch wrapper ─── */
export async function offlineFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // For GET requests, just use normal fetch (SW handles caching)
  if (!options.method || options.method === "GET") {
    return fetch(url, options);
  }

  // For mutations, try network first
  try {
    const resp = await fetch(url, options);
    return resp;
  } catch {
    // Network failed — queue the mutation
    await enqueue({
      url,
      method: options.method || "POST",
      body: typeof options.body === "string" ? options.body : null,
      headers: (options.headers as Record<string, string>) || {
        "Content-Type": "application/json",
      },
    });

    // Return a synthetic "queued" response so UI can show optimistic state
    return new Response(
      JSON.stringify({ queued: true, message: "Saved offline — will sync when connected" }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }
}
