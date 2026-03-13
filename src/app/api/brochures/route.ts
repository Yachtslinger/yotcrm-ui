import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const BROCHURES_DIR =
  process.env.BROCHURES_DIR ||
  path.join(process.env.HOME || "", "YotCRM", "Brochures");

// Static metadata for known brochures — add entries as you build more
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
  const brochures = [];

  if (fs.existsSync(BROCHURES_DIR)) {
    const files = fs.readdirSync(BROCHURES_DIR).filter(f => f.endsWith(".html"));
    for (const file of files) {
      const slug = file.replace(".html", "");
      const meta = BROCHURE_META[slug] || {
        title: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        subtitle: "E-Brochure",
        builder: "",
        year: "",
        tag: "Brochure",
      };
      const stat = fs.statSync(path.join(BROCHURES_DIR, file));
      brochures.push({ slug, ...meta, updatedAt: stat.mtime.toISOString() });
    }
  }

  return NextResponse.json({ ok: true, brochures });
}
