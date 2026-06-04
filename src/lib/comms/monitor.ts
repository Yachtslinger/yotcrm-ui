/**
 * src/lib/comms/monitor.ts
 * Tiny state store for the off-Mac capture watchdog.
 * The poller pings /api/comms/heartbeat every cycle; a Railway cron hits
 * /api/comms/watchdog to detect heartbeat *silence* and alert. Living on
 * Railway means alerts fire even when the Mac is fully offline.
 */
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function open() {
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.exec(`CREATE TABLE IF NOT EXISTS comms_monitor (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  return d;
}

function set(d: Database.Database, key: string, value: string) {
  d.prepare(`INSERT INTO comms_monitor (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run(key, value);
}

/** Poller checked in. Records the time and clears any active outage flag. */
export function recordHeartbeat(detail: string = "") {
  const d = open();
  try { set(d, "poller_heartbeat", detail); set(d, "poller_alerted", "0"); }
  finally { d.close(); }
}

export type MonitorState = {
  lastHeartbeat: string | null;
  ageSeconds: number | null;
  alerted: boolean;
  detail: string;
};

export function getMonitorState(): MonitorState {
  const d = open();
  try {
    const hb = d.prepare("SELECT value, updated_at FROM comms_monitor WHERE key='poller_heartbeat'").get() as { value: string; updated_at: string } | undefined;
    const al = d.prepare("SELECT value FROM comms_monitor WHERE key='poller_alerted'").get() as { value: string } | undefined;
    let ageSeconds: number | null = null;
    if (hb?.updated_at) {
      const last = Date.parse(hb.updated_at.replace(" ", "T") + "Z");
      if (!Number.isNaN(last)) ageSeconds = Math.round((Date.now() - last) / 1000);
    }
    return { lastHeartbeat: hb?.updated_at ?? null, ageSeconds, alerted: al?.value === "1", detail: hb?.value ?? "" };
  } finally { d.close(); }
}

export function setAlerted(v: boolean) {
  const d = open();
  try { set(d, "poller_alerted", v ? "1" : "0"); }
  finally { d.close(); }
}
