"use client";

import React, { useEffect, useState } from "react";
import type { Contact } from "./types";
import { emailPaolo, textPaolo } from "./ClientActions";

type Props = {
  clientId: string;
  initialClient?: Contact;
  onClose: () => void;
  onSaved: (updated: Contact) => void;
};

type Status = "Hot" | "Warm" | "Cold" | "Nurture" | "Other";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: Status;
  notes: string;
  boat_make: string;
  boat_model: string;
  boat_year: string;
  boat_length: string;
  boat_price: string;
  boat_location: string;
  listing_url: string;
};

const STATUS_OPTIONS: Status[] = ["Hot", "Warm", "Cold", "Nurture", "Other"];

function parseStatus(input: unknown): Status | undefined {
  if (typeof input !== "string") return undefined;
  const normalized = input.toLowerCase();
  if (normalized === "hot") return "Hot";
  if (normalized === "warm") return "Warm";
  if (normalized === "cold") return "Cold";
  if (normalized === "nurture") return "Nurture";
  if (normalized === "other") return "Other";
  return undefined;
}

function toContact(raw: any, fallbackId: string): Contact {
  const tags = Array.isArray(raw?.tags)
    ? raw.tags
    : typeof raw?.tags === "string"
    ? raw.tags
        .split(/[;,]+/)
        .map((t: string) => t.trim())
        .filter(Boolean)
    : [];

  const statusFromTags = parseStatus(
    tags.find((t: string) =>
      ["hot", "warm", "cold", "other", "nurture"].includes((t || "").toLowerCase())
    )
  );

  return {
    id: raw?.id ?? fallbackId,
    firstName: raw?.firstName ?? raw?.first_name ?? "",
    lastName: raw?.lastName ?? raw?.last_name ?? "",
    email: raw?.email ?? "",
    phone: raw?.phone ?? "",
    tags,
    status: parseStatus(raw?.status) ?? statusFromTags,
    notes: raw?.notes ?? "",
    source: raw?.source ?? "",
    createdAt: raw?.createdAt ?? raw?.created_at,
    boat_make: raw?.boat_make ?? "",
    boat_model: raw?.boat_model ?? "",
    boat_year: raw?.boat_year ?? "",
    boat_length: raw?.boat_length ?? "",
    boat_price: raw?.boat_price ?? "",
    boat_location: raw?.boat_location ?? "",
    listing_url: raw?.listing_url ?? "",
  };
}

export default function EditClientModal({
  clientId,
  initialClient,
  onClose,
  onSaved,
}: Props): React.ReactElement {
  const [form, setForm] = useState<FormState>({
    firstName: initialClient?.firstName ?? "",
    lastName: initialClient?.lastName ?? "",
    email: initialClient?.email ?? "",
    phone: initialClient?.phone ?? "",
    status: (initialClient?.status as Status) ?? "Other",
    notes: initialClient?.notes ?? "",
    boat_make: initialClient?.boat_make ?? "",
    boat_model: initialClient?.boat_model ?? "",
    boat_year: initialClient?.boat_year ?? "",
    boat_length: initialClient?.boat_length ?? "",
    boat_price: initialClient?.boat_price ?? "",
    boat_location: initialClient?.boat_location ?? "",
    listing_url: initialClient?.listing_url ?? "",
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [addingContact, setAddingContact] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );

  useEffect(() => {
    let active = true;

    const apply = (data: Contact): void => {
      if (!active) return;
      setForm({
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        status: (data.status as Status) ?? "Other",
        notes: data.notes ?? "",
        boat_make: data.boat_make ?? "",
        boat_model: data.boat_model ?? "",
        boat_year: data.boat_year ?? "",
        boat_length: data.boat_length ?? "",
        boat_price: data.boat_price ?? "",
        boat_location: data.boat_location ?? "",
        listing_url: data.listing_url ?? "",
      });
    };

    const fetchLatest = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`);
        if (!res.ok) {
          throw new Error(`Fetch failed: ${res.status}`);
        }
        const raw = await res.json();
        const normalized = toContact(raw, clientId);
        apply(normalized);
      } catch (err) {
        console.error("Failed to load client", err);
        if (initialClient) {
          apply(initialClient);
        }
        setError("Unable to load latest client data.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (initialClient) {
      apply(initialClient);
    }
    fetchLatest();

    return () => {
      active = false;
    };
  }, [clientId, initialClient]);

  const updateField = (key: keyof FormState, value: string): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const contactFromForm = (): Contact => ({
    id: initialClient?.id ?? clientId,
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    tags: initialClient?.tags ?? [],
    status: form.status,
    notes: form.notes,
    source: initialClient?.source,
    createdAt: initialClient?.createdAt,
    boat_make: form.boat_make,
    boat_model: form.boat_model,
    boat_year: form.boat_year,
    boat_length: form.boat_length,
    boat_price: form.boat_price,
    boat_location: form.boat_location,
    listing_url: form.listing_url,
  });

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        status: form.status.toLowerCase(),
        notes: form.notes,
        boat_make: form.boat_make.trim(),
        boat_model: form.boat_model.trim(),
        boat_year: form.boat_year.trim(),
        boat_length: form.boat_length.trim(),
        boat_price: form.boat_price.trim(),
        boat_location: form.boat_location.trim(),
        listing_url: form.listing_url.trim(),
      };

      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Save failed: ${res.status}`);
      }

      const raw = await res.json();
      const updated = toContact(raw, clientId);
      onSaved(updated);
      setSuccess(true);
      onClose();
    } catch (err) {
      console.error("Failed to save client", err);
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = (): void => {
    emailPaolo(contactFromForm());
  };

  const handleText = (): void => {
    textPaolo(contactFromForm());
  };

  const handleAddToContacts = async (): Promise<void> => {
    setAddingContact("loading");
    try {
      const res = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/add-to-contacts`,
        { method: "POST" }
      );
      if (!res.ok) {
        throw new Error("Failed");
      }
      setAddingContact("success");
    } catch (err) {
      console.error("Add to Contacts failed", err);
      setAddingContact("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl p-6 w-full max-w-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Edit lead</p>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              {initialClient
                ? [initialClient.firstName, initialClient.lastName].filter(Boolean).join(" ")
                : "Client"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {initialClient?.email || ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">First Name</span>
                <input
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Last Name</span>
                <input
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Email</span>
                <input
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Phone</span>
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                />
              </label>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Status</span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    updateField(
                      "status",
                      (STATUS_OPTIONS.find((s) => s === e.target.value) as Status) ?? "Other"
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[140px]"
                  disabled={loading || saving}
                />
              </label>
            </div>
          </div>

          {/* Boat Information Section */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Boat Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Make</span>
                <input
                  value={form.boat_make}
                  onChange={(e) => updateField("boat_make", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., Benetti"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Model</span>
                <input
                  value={form.boat_model}
                  onChange={(e) => updateField("boat_model", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., Classic"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Year</span>
                <input
                  value={form.boat_year}
                  onChange={(e) => updateField("boat_year", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., 2008"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Length</span>
                <input
                  value={form.boat_length}
                  onChange={(e) => updateField("boat_length", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., 120ft"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Price</span>
                <input
                  value={form.boat_price}
                  onChange={(e) => updateField("boat_price", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., $5,795,000"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block">
                <span className="mb-1 block">Location</span>
                <input
                  value={form.boat_location}
                  onChange={(e) => updateField("boat_location", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading || saving}
                  placeholder="e.g., Fort Lauderdale, FL"
                />
              </label>
            </div>

            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mt-4">
              <span className="mb-1 block">Listing URL</span>
              <input
                value={form.listing_url}
                onChange={(e) => updateField("listing_url", e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || saving}
                placeholder="https://..."
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm space-x-2 text-gray-600 dark:text-gray-400">
              {error ? <span className="text-red-600">{error}</span> : null}
              {success ? <span className="text-green-600">Saved</span> : null}
              {loading ? <span>Loading…</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-neutral-800"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddToContacts}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-neutral-800"
                disabled={addingContact === "loading" || saving || loading}
              >
                {addingContact === "loading" ? "Working..." : "Add to Contacts"}
              </button>
              <button
                type="button"
                onClick={handleText}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-indigo-500 text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                disabled={saving || loading}
              >
                Text Paolo
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center px-3 py-2 rounded-lg border border-purple-500 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-900/30"
                disabled={saving || loading}
              >
                Send to Paolo
              </button>
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
