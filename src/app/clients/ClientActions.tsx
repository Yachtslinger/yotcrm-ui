"use client";

import type { Contact } from "./types";
import React from "react";
import { useRouter } from "next/navigation";

const PAOLO_EMAIL = "pa@denisonyachting.com";
const PAOLO_SMS = "+17869526701";

export function emailPaolo(contact: Contact): void {
  console.log("[YotCRM UI] Email Paolo", contact?.id);
  const fullName =
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "New Lead";
  const subject = encodeURIComponent(`Lead: ${fullName}`);
  const bodyLines = [
    `Name: ${fullName}`,
    contact.email ? `Email: ${contact.email}` : "",
    contact.phone ? `Phone: ${contact.phone}` : "",
    contact.boat_make ? `Boat: ${[contact.boat_year, contact.boat_make, contact.boat_model].filter(Boolean).join(" ")}` : "",
    contact.boat_price ? `Price: ${contact.boat_price}` : "",
    contact.listing_url ? `Listing: ${contact.listing_url}` : "",
    contact.status ? `Status: ${contact.status}` : "",
    "",
    contact.notes ? `Notes:\n${contact.notes}` : "",
  ].filter(Boolean);
  const body = encodeURIComponent(bodyLines.join("\n"));
  const url = `mailto:${PAOLO_EMAIL}?subject=${subject}&body=${body}`;
  if (typeof window !== "undefined") {
    window.open(url, "_self");
  }
}

export function textPaolo(contact: Contact): void {
  console.log("[YotCRM UI] Text Paolo", contact?.id);
  const fullName =
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "New Lead";
  
  const lines = [
    `New Lead: ${fullName}`,
    contact.email ? `Email: ${contact.email}` : "",
    contact.phone ? `Phone: ${contact.phone}` : "",
    contact.boat_make ? `Boat: ${[contact.boat_year, contact.boat_make, contact.boat_model].filter(Boolean).join(" ")}` : "",
    contact.notes ? `Notes: ${contact.notes.substring(0, 200)}` : "",
  ].filter(Boolean).join("\n");

  const body = encodeURIComponent(lines);
  const smsUrl = `sms:${PAOLO_SMS}&body=${body}`;
  if (typeof window !== "undefined") {
    window.open(smsUrl, "_self");
  }
}

type Props = {
  contact: Contact;
  onEdit?: (contact: Contact) => void;
  onAddToContacts?: (contact: Contact) => Promise<void> | void;
  onEmailPaolo?: (contact: Contact) => void;
  onTextPaolo?: (contact: Contact) => void;
  status?: "idle" | "loading" | "success" | "error";
};

export default function ClientActions({
  contact,
  onEdit,
  onAddToContacts,
  onEmailPaolo,
  onTextPaolo,
  status = "idle",
}: Props): React.ReactElement {
  const router = useRouter();
  
  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      <button
        type="button"
        onClick={() => {
          console.log("[YotCRM UI] View lead", contact?.id);
          router.push(`/clients/${encodeURIComponent(contact.id)}`);
        }}
        className="inline-flex items-center px-2.5 py-1.5 font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
      >
        View
      </button>
      <button
        type="button"
        onClick={() => {
          console.log("[YotCRM UI] Add to Contacts", contact?.id);
          onAddToContacts?.(contact);
        }}
        className="inline-flex items-center px-2.5 py-1.5 font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Adding..." : "Add to Contacts"}
      </button>
      <button
        type="button"
        onClick={() => onEmailPaolo?.(contact)}
        className="inline-flex items-center px-2.5 py-1.5 font-medium rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100"
      >
        Email Paolo
      </button>
      <button
        type="button"
        onClick={() => onTextPaolo?.(contact)}
        className="inline-flex items-center px-2.5 py-1.5 font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
      >
        Text Paolo
      </button>
      {status === "success" ? (
        <span className="text-green-600">Added</span>
      ) : null}
      {status === "error" ? <span className="text-red-600">Error</span> : null}
    </div>
  );
}
