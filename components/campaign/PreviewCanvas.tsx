"use client";

import React from "react";
import type { CampaignData } from "@/lib/campaign/schema";
import { renderCampaignHTML } from "@/lib/campaign/render";

type PreviewCanvasProps = {
  data: CampaignData;
  width: number;
};

export function PreviewCanvas({ data, width }: PreviewCanvasProps): React.ReactElement {
  const [html, setHtml] = React.useState<string>("");
  const [text, setText] = React.useState<string>("");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      const result = renderCampaignHTML(data);
      setHtml(result.html);
      setText(result.text);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [data]);

  React.useEffect(() => {
    if (iframeRef.current && html) {
      iframeRef.current.srcdoc = html;
    }
  }, [html]);

  async function copyHtml() {
    await navigator.clipboard.writeText(html);
    alert("HTML copied to clipboard");
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    alert("Text version copied");
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex justify-end gap-2">
        <button onClick={copyHtml} className="rounded border px-3 py-1 text-sm">
          Copy HTML
        </button>
        <button onClick={copyText} className="rounded border px-3 py-1 text-sm">
          Copy Text
        </button>
      </div>
      <div className="flex-1 overflow-auto rounded border bg-white">
        <iframe ref={iframeRef} title="Campaign preview" className="h-full w-full" style={{ minHeight: "900px", minWidth: `${width}px` }} />
      </div>
    </div>
  );
}
