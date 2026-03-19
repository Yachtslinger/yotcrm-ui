// src/app/brochures/[slug]/page.tsx
// Serves the generated luxury brochure HTML for a given slug.
// Adds a floating action bar: ← Back · Copy Link · Download PDF · ✉ Send

import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";
import { generateBrochureHTML } from "@/lib/brochure-template";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { BrochureActionBar } from "./BrochureActionBar";

const BROCHURES_DIR =
  process.env.BROCHURES_DIR ||
  path.join(process.env.HOME || "", "YotCRM", "Brochures");

export const dynamic = "force-dynamic";

export default async function BrochureSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");

  let html = "";
  let vesselName = "";

  const row = getBrochure(safeSlug);
  if (row) {
    html = generateBrochureHTML(row.vessel, row.brokers || DEFAULT_BROKERS);
    vesselName = row.vessel.name || safeSlug;
  } else {
    const filePath = path.join(
      BROCHURES_DIR,
      safeSlug.endsWith(".html") ? safeSlug : `${safeSlug}.html`
    );
    if (fs.existsSync(filePath)) {
      html = fs.readFileSync(filePath, "utf-8");
      vesselName = safeSlug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    } else {
      notFound();
    }
  }

  return (
    <>
      <BrochureActionBar slug={safeSlug} vesselName={vesselName} />
      <div style={{ margin: 0, padding: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
