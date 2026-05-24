// src/app/brochures/[slug]/page.tsx
// Serves the generated luxury brochure HTML for a given slug.
// Action bar only shown internally (via ?internal=1). Public links are clean.

import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";
import { generateBrochureHTML } from "@/lib/brochure-template";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { BrochureActionBar } from "./BrochureActionBar";
import type { Metadata } from "next";

const BROCHURES_DIR =
  process.env.BROCHURES_DIR ||
  path.join(process.env.HOME || "", "YotCRM", "Brochures");

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");
  const row = getBrochure(safeSlug);
  if (!row) return { title: "Yacht Brochure" };

  const vessel = row.vessel;
  const heroImg = vessel.images?.[0]?.src || "";
  const title = `${vessel.name}${vessel.builder ? ` — ${vessel.builder}` : ""}`;
  const specs = [vessel.loa, vessel.hullMaterial, vessel.year ? `${vessel.year} Delivery` : ""]
    .filter(Boolean).join(" · ");
  const description = specs
    ? `${specs} · Available exclusively through Denison Yachting.`
    : `${vessel.name} — Available exclusively through Denison Yachting.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Denison Yachting",
      type: "website",
      images: heroImg
        ? [{ url: heroImg, width: 1200, height: 800, alt: vessel.name }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: heroImg ? [heroImg] : [],
    },
  };
}

export default async function BrochureSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ internal?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");
  const isInternal = sp?.internal === "1";

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
      {isInternal && <BrochureActionBar slug={safeSlug} vesselName={vesselName} />}
      <div style={{ margin: 0, padding: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
