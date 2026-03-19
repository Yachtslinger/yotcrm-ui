// src/app/brochures/[slug]/page.tsx
// Renders the brochure inside a full-screen iframe so the self-contained
// HTML template (with its own <head>, fonts, and CSS) has its own document
// context — completely isolated from the YotCRM app shell.

import { getBrochure } from "@/lib/brochure-storage";
import { notFound } from "next/navigation";
import { BrochureActionBar } from "./BrochureActionBar";

export const dynamic = "force-dynamic";

export default async function BrochureSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");

  const row = getBrochure(safeSlug);
  if (!row) notFound();

  const vesselName = row.vessel.name || safeSlug;
  const iframeSrc  = `/api/brochures/html?slug=${encodeURIComponent(safeSlug)}`;

  return (
    <>
      {/* Floating action bar — sits above the iframe */}
      <BrochureActionBar slug={safeSlug} vesselName={vesselName} />

      {/* Full-screen iframe — brochure renders in its own document */}
      <iframe
        src={iframeSrc}
        title={vesselName}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          border: "none",
          margin: 0,
          padding: 0,
          zIndex: 0,
          display: "block",
          background: "#050d1a",
        }}
        allowFullScreen
      />
    </>
  );
}
