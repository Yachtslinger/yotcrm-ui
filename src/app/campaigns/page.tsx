"use client";

import React from "react";
import { EditorForm } from "../../../components/campaign/EditorForm";
import { PreviewCanvas } from "../../../components/campaign/PreviewCanvas";
import { TemplateId, CampaignData, createBlankCampaignData } from "@/lib/campaign/schema";
import type { BrokerCard } from "../../../components/campaign/CobrokerSelect";

export default function CampaignPage(): React.ReactElement {
  const [templateId, setTemplateId] = React.useState<TemplateId>("listing");
  const [data, setData] = React.useState<CampaignData>(createBlankCampaignData("listing"));
  const [listingUrl, setListingUrl] = React.useState("");
  const [cobrokers, setCobrokers] = React.useState<BrokerCard[]>([]);
  const [editorWidth, setEditorWidth] = React.useState(420);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  const handleMouseMove = React.useCallback(
    (event: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const width = Math.min(480, Math.max(340, x));
      setEditorWidth(width);
    },
    []
  );

  const stopDragging = React.useCallback(() => {
    draggingRef.current = false;
  }, []);

  React.useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
    };
  }, [handleMouseMove, stopDragging]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <h1 className="text-lg font-semibold">Denison Campaign Builder</h1>
          <span className="text-xs text-slate-500">Template: {templateId}</span>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-4 p-4" ref={containerRef}>
        <div style={{ width: editorWidth }} className="flex-shrink-0 rounded-lg border bg-white p-4">
          <EditorForm
            templateId={templateId}
            onTemplateId={(next) => {
              setTemplateId(next);
              setData((prev) => ({ ...prev, templateId: next }));
            }}
            cobrokers={cobrokers}
            onCobrokers={setCobrokers}
            listingUrl={listingUrl}
            onListingUrl={setListingUrl}
            data={data}
            onDataChange={setData}
          />
        </div>
        <div
          className="w-2 cursor-col-resize rounded bg-slate-300"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            draggingRef.current = true;
          }}
        />
        <div className="flex flex-1 flex-col rounded-lg border bg-white p-4">
          <PreviewCanvas data={data} width={700} />
        </div>
      </div>
    </div>
  );
}
