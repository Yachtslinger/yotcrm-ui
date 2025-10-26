"use client";

import React from "react";
import type { TemplateId } from "@/lib/campaign/schema";

const OPTIONS: { id: TemplateId; label: string; description: string }[] = [
  { id: "listing", label: "Listing", description: "Hero + specs + brokers" },
  { id: "announcement", label: "Announcement", description: "Hero + CTA focus" },
  { id: "event", label: "Event", description: "Hero + event details" },
];

type TemplatePickerProps = {
  value: TemplateId;
  onChange: (value: TemplateId) => void;
};

export function TemplatePicker({ value, onChange }: TemplatePickerProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded border px-4 py-3 text-left transition ${
            option.id === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400"
          }`}
        >
          <div className="font-semibold">{option.label}</div>
          <div className="text-sm text-slate-500">{option.description}</div>
        </button>
      ))}
    </div>
  );
}

export type { TemplateId };
