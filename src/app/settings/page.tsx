"use client";

import * as React from "react";
import PageShell from "../components/PageShell";

const CONFIG_ENDPOINT = "/api/config";

type Config = {
  paolo: {
    email: string;
    phone: string;
  };
};

type StatusTone = "neutral" | "success" | "error";

export default function SettingsPage(): React.ReactElement {
  const [email, setEmail] = React.useState<string>("");
  const [phone, setPhone] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("");
  const [statusTone, setStatusTone] = React.useState<StatusTone>("neutral");
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setStatus("Loading config...");
      setStatusTone("neutral");
      try {
        const res = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Fetch failed with ${res.status}`);
        }
        const data = (await res.json()) as Partial<Config>;
        const paolo = data?.paolo ?? {} as Record<string, unknown>;
        if (!cancelled) {
          setEmail(typeof paolo.email === "string" ? paolo.email : "");
          setPhone(typeof paolo.phone === "string" ? paolo.phone : "");
          setStatus("");
        }
      } catch (err) {
        console.error("[Settings] Failed to load config", err);
        if (!cancelled) {
          setStatus("Unable to load config.");
          setStatusTone("error");
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setStatus("Saving...");
    setStatusTone("neutral");
    try {
      const res = await fetch(CONFIG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paolo: { email, phone } }),
      });
      if (!res.ok) {
        throw new Error(`Save failed with ${res.status}`);
      }
      setStatus("Saved.");
      setStatusTone("success");
    } catch (err) {
      console.error("[Settings] Failed to save config", err);
      setStatus("Save failed.");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const statusColor =
    statusTone === "error"
      ? "text-[var(--coral-500)]"
      : statusTone === "success"
      ? "text-[var(--sea-500)]"
      : "text-[var(--navy-400)]";

  return (
    <PageShell
      title="Settings"
      subtitle="Manage Paolo delivery destinations."
      maxWidth="narrow"
    >
      <section className="card-elevated p-6">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">
              Paolo email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="paolo@example.com"
                className="form-input mt-2"
              />
            </label>
            <label className="form-label">
              Paolo phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15551234567"
                className="form-input mt-2"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? "Saving..." : "Save"}
            </button>
            <span className={`text-sm ${statusColor}`} aria-live="polite">
              {status}
            </span>
          </div>
        </form>
      </section>

      {/* Gmail send authorisation */}
      <section className="card-elevated p-6 mt-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Gmail — Send as WN@DenisonYachting.com</h2>
        <p className="text-xs text-[var(--navy-400)] mb-4">
          Authorise YotCRM once and every match email will be sent directly from your Denison Gmail — appears in your Sent folder, replies thread back to you normally.
        </p>
        <div className="space-y-2 text-xs text-[var(--navy-500)] mb-4">
          <div>1. Add these three env vars to Railway: <code className="bg-[var(--sand-100)] px-1 rounded">GMAIL_CLIENT_ID</code>, <code className="bg-[var(--sand-100)] px-1 rounded">GMAIL_CLIENT_SECRET</code>, <code className="bg-[var(--sand-100)] px-1 rounded">GMAIL_REDIRECT_URI</code></div>
          <div>2. Set redirect URI to: <code className="bg-[var(--sand-100)] px-1 rounded">https://your-app.up.railway.app/api/auth/gmail/callback</code></div>
          <div>3. Click the button below while logged into your Denison Google account — one-time only.</div>
        </div>
        <a
          href="/api/auth/gmail/connect"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--brass-400, #b8933a)" }}
        >
          Connect Gmail →
        </a>
      </section>

      {/* Morning Text */}
      <MorningTextSection />
    </PageShell>
  );
}

function MorningTextSection() {
  const [phone, setPhone]         = React.useState("");
  const [previewing, setPreviewing] = React.useState(false);
  const [sending, setSending]     = React.useState(false);
  const [preview, setPreview]     = React.useState<string | null>(null);
  const [sendResult, setSendResult] = React.useState<string | null>(null);
  const [health, setHealth]       = React.useState<any>(null);
  const [healthLoading, setHealthLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/health/morning-text?assignee=will")
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  }, []);

  const handlePreview = async () => {
    setPreviewing(true); setPreview(null); setSendResult(null);
    try {
      const res = await fetch("/api/morning-text?assignee=will");
      const d   = await res.json();
      setPreview(d.message || "No items due.");
    } catch { setPreview("Error generating preview."); }
    finally { setPreviewing(false); }
  };

  const handleSend = async () => {
    const to = phone.trim();
    if (!to) { setSendResult("Enter a phone number first."); return; }
    setSending(true); setSendResult(null);
    try {
      const res = await fetch("/api/morning-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: "will", to }),
      });
      const d = await res.json();
      setSendResult(d.ok
        ? `✓ Sent (${d.itemCount} item${d.itemCount !== 1 ? "s" : ""})`
        : `Error: ${d.error}`);
      // Refresh health after send
      fetch("/api/health/morning-text?assignee=will").then(r => r.json()).then(setHealth).catch(() => {});
    } catch { setSendResult("Send failed."); }
    finally { setSending(false); }
  };

  return (
    <section className="card-elevated p-6 mt-4">
      <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">☀️ Morning Task Text</h2>
      <p className="text-xs text-[var(--navy-400)] mb-4">
        Daily SMS digest of overdue + due-today follow-ups. Configure in Railway env vars, then test here.
      </p>

      {/* Health status widget */}
      {!healthLoading && health && (
        <div className={`rounded-lg p-3 mb-4 text-xs border ${
          health.healthy
            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${health.healthy ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className={`font-semibold ${health.healthy ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
              {health.healthy ? "Configured and ready" : "Setup incomplete"}
            </span>
          </div>

          {/* Issues */}
          {health.issues?.length > 0 && (
            <ul className="space-y-1 mb-2">
              {health.issues.map((issue: string, i: number) => (
                <li key={i} className="text-amber-700 dark:text-amber-300 flex gap-1.5">
                  <span>⚠</span><span>{issue}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Last send */}
          {health.lastSend ? (
            <div className="text-gray-500 dark:text-gray-400 space-y-0.5">
              <div>
                Last sent: <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {health.lastSend.hoursSince < 1
                    ? "less than 1h ago"
                    : `${health.lastSend.hoursSince}h ago`}
                </span>
                {" "}· {health.lastSend.itemCount} item{health.lastSend.itemCount !== 1 ? "s" : ""}
                {" "}· {health.lastSend.status === "error"
                  ? <span className="text-red-500">failed — {health.lastSend.error}</span>
                  : <span className="text-emerald-600">ok</span>}
              </div>
              <div>Today pending: <span className="font-semibold text-gray-700 dark:text-gray-300">{health.today?.pendingCount ?? 0} item{health.today?.pendingCount !== 1 ? "s" : ""}</span></div>
            </div>
          ) : (
            <div className="text-gray-400">Never sent — use Test Send below to verify setup.</div>
          )}
        </div>
      )}

      {/* Env var instructions */}
      <div className="rounded-lg bg-[var(--sand-100,#f9fafb)] dark:bg-neutral-800 p-3 mb-4 space-y-1 text-xs text-[var(--navy-500)] font-mono">
        <div>TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx</div>
        <div>TWILIO_AUTH_TOKEN=your_auth_token</div>
        <div>TWILIO_FROM_NUMBER=+1xxxxxxxxxx</div>
        <div>MORNING_TEXT_WILL=+18504613342</div>
        <div>MORNING_TEXT_PAOLO=+17862512588  <span className="font-sans text-gray-400">(optional)</span></div>
        <div>CRON_SECRET=any-random-string  <span className="font-sans text-gray-400">(protects cron endpoint)</span></div>
      </div>

      {/* Schedule instructions */}
      <div className="text-xs text-[var(--navy-500)] mb-4 space-y-1">
        <p className="font-semibold">Railway cron setup:</p>
        <p>In Railway dashboard → your project → Add Service → Cron.</p>
        <p>Schedule: <code className="bg-[var(--sand-100)] px-1 rounded">30 7 * * 1-5</code> (7:30 AM Mon–Fri)</p>
        <p>Command: <code className="bg-[var(--sand-100)] px-1 rounded">curl -X POST https://yotcrm-production.up.railway.app/api/cron/morning -H "Authorization: Bearer $CRON_SECRET"</code></p>
      </div>

      {/* Test send */}
      <div className="space-y-3">
        <div>
          <label className="form-label text-xs">Test send to number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+18504613342"
            className="form-input mt-1 text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-neutral-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {previewing ? "Generating…" : "Preview"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !phone.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ background: "var(--brass-400, #b8933a)" }}
          >
            {sending ? "Sending…" : "Send Test Text"}
          </button>
        </div>
        {sendResult && (
          <p className={`text-sm font-semibold ${sendResult.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
            {sendResult}
          </p>
        )}
        {preview && (
          <pre className="text-xs bg-[var(--sand-100,#f9fafb)] dark:bg-neutral-800 rounded-lg p-3 whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-neutral-700">
            {preview}
          </pre>
        )}
      </div>
    </section>
  );
}
