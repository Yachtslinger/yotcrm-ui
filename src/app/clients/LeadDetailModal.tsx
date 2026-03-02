"use client";

import React from "react";
import type { Contact } from "./types";

interface LeadDetailModalProps {
  lead: Contact | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function LeadDetailModal({
  lead,
  isOpen,
  onClose,
}: LeadDetailModalProps): React.ReactElement | null {
  if (!isOpen || !lead) return null;

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Untitled";
  const boatDisplay = [lead.boat_year, lead.boat_length, lead.boat_make, lead.boat_model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-xl">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-2xl font-bold">{fullName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Contact Info */}
          <div className="border-b pb-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Email</div>
                <div className="text-sm font-medium">{lead.email || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Phone</div>
                <div className="text-sm font-medium">{lead.phone || "—"}</div>
              </div>
            </div>
          </div>

          {/* Boat Details */}
          {boatDisplay && (
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Boat of Interest
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Make</div>
                  <div className="text-sm font-medium">{lead.boat_make || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Model</div>
                  <div className="text-sm font-medium">{lead.boat_model || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Year</div>
                  <div className="text-sm font-medium">{lead.boat_year || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Length</div>
                  <div className="text-sm font-medium">{lead.boat_length || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Price</div>
                  <div className="text-sm font-medium">{lead.boat_price || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Location</div>
                  <div className="text-sm font-medium">{lead.boat_location || "—"}</div>
                </div>
              </div>
              {lead.listing_url && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-1">Listing URL</div>
                  <a
                    href={lead.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {lead.listing_url}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Message */}
          {lead.notes && (
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Customer Message
              </h3>
              <div className="text-sm whitespace-pre-wrap">{lead.notes}</div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Lead Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Source</div>
                <div className="text-sm font-medium capitalize">{lead.source || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Created</div>
                <div className="text-sm font-medium">
                  {lead.createdAt ? new Date(Number(lead.createdAt)).toLocaleDateString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Lead ID</div>
                <div className="text-sm font-mono text-gray-600">{lead.id}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
