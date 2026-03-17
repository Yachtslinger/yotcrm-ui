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
    </PageShell>
  );
}
