import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listBrochures, deleteBrochure, updateBrochure, getBrochure, getBrochureById } from "@/lib/brochure-storage";
import { syncPocketListingFromBrochure, removePocketListingBySlug } from "@/lib/pocket-brochure-sync";
import type { VesselData, BrokerInfo } from "@/lib/brochure-storage";

export const runtime = "nodejs";

const BROCHURES_DIR =
  process.env.BROCHURES_DIR ||
  path.join(process.env.HOME || "", "YotCRM", "Brochures");

// Static metadata for known file-based brochures
const BROCHURE_META: Record<string, { title: string; subtitle: string; builder: string; year: string; tag: string }> = {
  "ocean-king-explorer-34m": {
    title: "Ocean King Explorer 34M",
    subtitle: "New Build · Steel & Aluminum Explorer",
    builder: "Ocean King Yachts",
    year: "2025",
    tag: "New Build",
  },
  "ocean-king-34m-interior-design": {
    title: "Ocean King 34M — Interior Design",
    subtitle: "Interior Design Specification",
    builder: "Ocean King Yachts",
    year: "2025",
    tag: "Interior",
  },
};

export async function GET() {
  const brochures: object[] = [];

  // 1. File-based brochures (existing)
  if (fs.existsSync(BROCHURES_DIR)) {
    const files = fs.readdirSync(BROCHURES_DIR).filter(f => f.endsWith(".html"));
    for (const file of files) {
      const slug = file.replace(".html", "");
      const meta = BROCHURE_META[slug] || {
        title: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        subtitle: "E-Brochure",
        builder: "",
        year: "",
        tag: "Brochure",
      };
      const stat = fs.statSync(path.join(BROCHURES_DIR, file));
      brochures.push({ slug, ...meta, updatedAt: stat.mtime.toISOString(), source: "file" });
    }
  }

  // 2. DB-generated brochures
  try {
    const dbRows = listBrochures();
    for (const row of dbRows) {
      // Pull hero image from stored vessel_data without a full getBrochure call
      let heroSrc = "";
      try {
        const full = getBrochure(row.slug);
        heroSrc = full?.vessel?.images?.[0]?.src || "";
      } catch { /* ignore */ }
      brochures.push({
        slug: row.slug,
        title: row.vessel_name,
        subtitle: [row.builder, row.year].filter(Boolean).join(" · ") || "Generated Brochure",
        builder: row.builder,
        year: String(row.year || ""),
        tag: "Generated",
        updatedAt: row.created_at,
        source: "db",
        id: row.id,
        heroSrc,
        is_pocket_listing: (row as any).is_pocket_listing,
      });
    }
  } catch {
    // DB table might not exist yet — that's fine
  }

  return NextResponse.json({ ok: true, brochures });
}

export async function DELETE(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    deleteBrochure(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, vessel, brokers, isPocket } = body as {
      id: number; vessel: VesselData; brokers?: BrokerInfo[]; isPocket?: boolean;
    };
    if (!id || !vessel) return NextResponse.json({ error: "id and vessel required" }, { status: 400 });

    const ok = updateBrochure(id, vessel, brokers, isPocket);
    if (!ok) return NextResponse.json({ error: "Brochure not found" }, { status: 404 });

    // Sync pocket listing — get slug via getBrochureById
    const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://yotcrm-production.up.railway.app";
    const row = getBrochureById(id);
    const slug = row?.slug;
    if (slug) {
      if (isPocket) {
        syncPocketListingFromBrochure({
          vessel, slug,
          brochureUrl: `${BASE}/brochures/${slug}`,
          pdfUrl: `${BASE}/api/brochures/pdf?slug=${slug}`,
        });
      } else if (isPocket === false) {
        removePocketListingBySlug(slug);
      }
    }

    return NextResponse.json({ ok: true, updated: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
