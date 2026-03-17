// src/app/api/listings/generate-pdf/route.ts
// Generates a premium listing PDF (dark navy/gold Yacht Cache aesthetic)
// using Python + ReportLab. Returns a file URL for attachment.

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 120;

const UPLOAD_DIR =
  process.env.LISTING_FILES_DIR ||
  path.join(
    process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/app/data",
    "listing-files"
  );

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const body = await req.json();

    const {
      name,           // e.g. "BLONDIE"
      make,
      model,
      year,
      length,
      price,
      location,
      listing_type,   // "active" | "pocket" | "new_build"
      description,
      highlights,     // array of strings OR newline-separated string
      hero_image,     // URL or base64
      images,         // array of URLs
      specs,          // { loa, beam, draft, engines, fuel_tank, water_tank, range, speed, staterooms, crew, displacement, classification, hull_material, designer }
      sections,       // array of { title, subsections: [{ title, bullets }] }
      broker_name,
      broker_email,
      broker_phone,
    } = body;

    // Build the Python script inline
    const slug = (name || `${year}-${make}-${model}`)
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/__+/g, "_")
      .toLowerCase();
    const ts = Date.now();
    const outFilename = `${slug}_${ts}.pdf`;
    const outPath = path.join(UPLOAD_DIR, outFilename);

    // Write a JSON data file for the Python script
    const dataPath = path.join(UPLOAD_DIR, `${slug}_${ts}_data.json`);
    // Resolve /api/listings/files/... relative URLs to absolute local file paths
    // so the Python script can read them directly without HTTP
    function resolveImageUrl(url: string): string {
      if (!url) return url;
      const prefix = "/api/listings/files/";
      if (url.startsWith(prefix)) {
        const filename = decodeURIComponent(url.slice(prefix.length));
        const localPath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(localPath)) return localPath;
      }
      return url; // keep as-is (external URL, Python will fetch it)
    }

    const pdfData = {
      name: name || `${year} ${make} ${model}`,
      make: make || "",
      model: model || "",
      year: year || "",
      length: length || "",
      price: price || "",
      location: location || "",
      listing_type: listing_type || "active",
      description: description || "",
      highlights: Array.isArray(highlights)
        ? highlights
        : (highlights || "").split(/\n/).map((s: string) => s.trim()).filter(Boolean),
      hero_image: resolveImageUrl(hero_image || ""),
      images: (images || []).map((img: string) => resolveImageUrl(img)),
      specs: specs || {},
      sections: sections || [],
      broker_name: broker_name || "Will Noftsinger",
      broker_email: broker_email || "WN@DenisonYachting.com",
      broker_phone: broker_phone || "850.461.3342",
      out_path: outPath,
    };
    fs.writeFileSync(dataPath, JSON.stringify(pdfData, null, 2));

    // Generate the PDF
    const scriptPath = path.join(process.cwd(), "scripts", "generate_listing_pdf.py");
    if (!fs.existsSync(scriptPath)) {
      // Write the script on first use
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, getPythonScript());
    }

    await execFileAsync("python3", [scriptPath, dataPath], {
      timeout: 90_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Clean up data file
    fs.unlinkSync(dataPath);

    if (!fs.existsSync(outPath)) {
      throw new Error("PDF generation completed but file not found");
    }

    const fileUrl = `/api/listings/files/${encodeURIComponent(outFilename)}`;
    const sizeMb = (fs.statSync(outPath).size / 1e6).toFixed(1);

    return NextResponse.json({
      ok: true,
      filename: outFilename,
      url: fileUrl,
      sizeMb,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF generation failed";
    console.error("[generate-pdf]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function getPythonScript(): string {
  return `#!/usr/bin/env python3
"""
Yacht Cache listing PDF generator.
Dark #080c12 background · gold #c5a064 · premium listing aesthetic.
Called by /api/listings/generate-pdf with a JSON data file.
"""
import sys, json, os, textwrap, urllib.request, tempfile
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image as RLImage
)
from PIL import Image as PILImage

data = json.load(open(sys.argv[1]))

DARK      = colors.HexColor("#080c12")
DARK_CARD = colors.HexColor("#0d1520")
GOLD      = colors.HexColor("#c5a064")
GOLD_DIM  = colors.HexColor("#8a7d6a")
OFF_WHITE = colors.HexColor("#e8dcc8")
W, H      = letter

def S(name, **kw):
    d = dict(fontName="Times-Roman", fontSize=10, textColor=OFF_WHITE, leading=16)
    d.update(kw)
    return ParagraphStyle(name, **d)

STYLES = {
    "label":    S("label", fontName="Helvetica", fontSize=8, textColor=GOLD, leading=12, letterSpacing=3, spaceAfter=6),
    "sec_head": S("sh", fontName="Helvetica-Bold", fontSize=8, textColor=GOLD, leading=12, letterSpacing=3, spaceBefore=14, spaceAfter=6),
    "sub_head": S("sub", fontName="Helvetica-Bold", fontSize=8, textColor=GOLD_DIM, leading=12, letterSpacing=2, spaceBefore=8, spaceAfter=4),
    "body":     S("body", fontName="Times-Roman", fontSize=10.5, textColor=OFF_WHITE, leading=17, spaceAfter=8),
    "body_sm":  S("bsm", fontName="Times-Roman", fontSize=9.5, textColor=colors.HexColor("#c8bfb0"), leading=15, spaceAfter=5),
    "spec_key": S("sk", fontName="Helvetica-Bold", fontSize=8, textColor=GOLD_DIM, leading=13, letterSpacing=1),
    "spec_val": S("sv", fontName="Times-Roman", fontSize=10, textColor=OFF_WHITE, leading=13),
    "spec_bold":S("sb", fontName="Times-Bold", fontSize=10.5, textColor=GOLD, leading=13),
    "bullet":   S("bul", fontName="Times-Roman", fontSize=9.5, textColor=colors.HexColor("#c8bfb0"), leading=15, leftIndent=12, firstLineIndent=-10, spaceAfter=3),
}

def gold_rule():
    return HRFlowable(width="100%", thickness=0.5, color=GOLD, spaceAfter=5, spaceBefore=2)

def sec_head(txt):
    return [gold_rule(), Paragraph(txt.upper(), STYLES["sec_head"])]

def bul(txt):
    return Paragraph("\\u2013  " + txt, STYLES["bullet"])

def spacer(h=0.08):
    return Spacer(1, h*inch)

def fetch_image(url_or_path):
    """Fetch image from URL or path, return local temp path."""
    if not url_or_path:
        return None
    if os.path.exists(url_or_path):
        return url_or_path
    if url_or_path.startswith("http"):
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            req = urllib.request.Request(url_or_path, headers={
                "User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                tmp.write(r.read())
            tmp.close()
            return tmp.name
        except:
            return None
    return None

def cover_page(c, doc):
    c.saveState()

    c.setFillColor(DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Gold hairline top
    c.setFillColor(GOLD)
    c.rect(0, H - 0.05*inch, W, 0.05*inch, fill=1, stroke=0)

    # Header
    c.setFillColor(DARK_CARD)
    c.rect(0, H - 0.46*inch, W, 0.41*inch, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 8)
    c.drawString(0.55*inch, H - 0.275*inch, "THE YACHT CACHE")
    c.setFillColor(GOLD_DIM)
    c.setFont("Helvetica", 7)
    c.drawRightString(W - 0.55*inch, H - 0.275*inch,
        data["broker_name"].upper() + "  \\u00b7  DENISON YACHTING  \\u00b7  " + data["broker_phone"])

    # Hero image
    hero_local = fetch_image(data.get("hero_image", ""))
    PHOTO_TOP    = H - 0.46*inch - 0.08*inch
    PHOTO_HEIGHT = 4.80*inch
    PHOTO_BOTTOM = PHOTO_TOP - PHOTO_HEIGHT

    if hero_local and os.path.exists(hero_local):
        c.drawImage(hero_local, 0, PHOTO_BOTTOM, width=W, height=PHOTO_HEIGHT,
                    preserveAspectRatio=True, anchor="c", mask="auto")
    else:
        c.setFillColor(DARK_CARD)
        c.rect(0, PHOTO_BOTTOM, W, PHOTO_HEIGHT, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#1a2535"))
        c.setFont("Helvetica", 72)
        c.drawCentredString(W/2, PHOTO_BOTTOM + PHOTO_HEIGHT/2 - 36, "\\u2693")

    c.setFillColor(DARK)
    c.rect(0, PHOTO_BOTTOM - 0.03*inch, W, 0.06*inch, fill=1, stroke=0)

    # Vessel name
    vessel_name = data.get("name", "")
    NAME_Y = PHOTO_BOTTOM - 0.52*inch
    c.setFillColor(OFF_WHITE)
    c.setFont("Times-BoldItalic", 44)
    display = f'"{vessel_name}"' if not vessel_name.startswith('"') else vessel_name
    c.drawCentredString(W/2, NAME_Y, display)

    # Subline
    parts = [p for p in [data.get("year",""), data.get("make",""), data.get("length","")] if p]
    SUB_Y = NAME_Y - 0.35*inch
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 10)
    c.drawCentredString(W/2, SUB_Y, "    \\u00b7    ".join(parts))

    # Rule
    RULE1_Y = SUB_Y - 0.17*inch
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.5)
    c.line(1.2*inch, RULE1_Y, W - 1.2*inch, RULE1_Y)

    # Stats
    stat_items = [
        ("LOA",      data.get("length","—")),
        ("ASKING",   data.get("price","Upon Request")),
        ("LOCATION", data.get("location","—")),
    ]
    specs = data.get("specs", {})
    if specs.get("engines"):
        stat_items.append(("ENGINES", specs["engines"][:30]))
    STATS_Y = RULE1_Y - 0.17*inch
    col_w = W / len(stat_items)
    for i, (lbl, val) in enumerate(stat_items):
        cx = col_w * i + col_w / 2
        c.setFillColor(GOLD_DIM)
        c.setFont("Helvetica", 7)
        c.drawCentredString(cx, STATS_Y + 0.16*inch, lbl)
        c.setFillColor(OFF_WHITE)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(cx, STATS_Y, str(val))

    # Rule 2
    RULE2_Y = STATS_Y - 0.20*inch
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.4)
    c.line(0.55*inch, RULE2_Y, W - 0.55*inch, RULE2_Y)

    # Description
    desc = data.get("description","")
    if desc:
        c.setFillColor(colors.HexColor("#b0a898"))
        c.setFont("Times-Roman", 8.0)
        tx, tw, lh = 0.55*inch, W - 1.1*inch, 12
        words = desc.split()
        lines_out, cur = [], ""
        for word in words:
            test = (cur + " " + word).strip()
            if c.stringWidth(test, "Times-Roman", 8.0) <= tw:
                cur = test
            else:
                if cur: lines_out.append(cur)
                cur = word
        if cur: lines_out.append(cur)
        oy = RULE2_Y - 0.13*inch
        for line in lines_out:
            if oy < 0.38*inch: break
            c.drawString(tx, oy, line)
            oy -= lh

    # Footer
    c.setFillColor(GOLD)
    c.rect(0, 0, W, 0.05*inch, fill=1, stroke=0)
    c.setFillColor(DARK_CARD)
    c.rect(0, 0.05*inch, W, 0.30*inch, fill=1, stroke=0)
    c.setFillColor(GOLD_DIM)
    c.setFont("Helvetica", 7)
    c.drawCentredString(W/2, 0.15*inch,
        data["broker_email"] + "  \\u00b7  " + data["broker_phone"] + "  \\u00b7  theyachtcache.com")

    c.restoreState()

def content_page(c, doc):
    c.saveState()
    c.setFillColor(DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, H - 0.05*inch, W, 0.05*inch, fill=1, stroke=0)
    c.setFillColor(DARK_CARD)
    c.rect(0, H - 0.46*inch, W, 0.41*inch, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 8)
    c.drawString(0.55*inch, H - 0.28*inch, "THE YACHT CACHE")
    vessel_name = data.get("name","")
    c.setFillColor(GOLD_DIM)
    c.setFont("Helvetica", 7)
    label = f'"{vessel_name}"' if not vessel_name.startswith('"') else vessel_name
    c.drawRightString(W - 0.55*inch, H - 0.28*inch,
        f"{label}  \\u00b7  {data.get('year','')} {data.get('make','')}")
    c.setFillColor(GOLD)
    c.rect(0, 0, W, 0.05*inch, fill=1, stroke=0)
    c.setFillColor(DARK_CARD)
    c.rect(0, 0.05*inch, W, 0.30*inch, fill=1, stroke=0)
    c.setFillColor(GOLD_DIM)
    c.setFont("Helvetica", 7)
    c.drawCentredString(W/2, 0.15*inch,
        data["broker_name"] + "  \\u00b7  " + data["broker_email"] + "  \\u00b7  " + data["broker_phone"])
    c.restoreState()

def photo_page(c, doc):
    c.saveState()
    c.setFillColor(DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, H - 0.05*inch, W, 0.05*inch, fill=1, stroke=0)
    c.setFillColor(DARK_CARD)
    c.rect(0, H - 0.38*inch, W, 0.33*inch, fill=1, stroke=0)
    vessel_name = data.get("name","")
    label = f'"{vessel_name}"' if not vessel_name.startswith('"') else vessel_name
    c.setFillColor(OFF_WHITE)
    c.setFont("Times-BoldItalic", 10)
    c.drawCentredString(W/2, H - 0.225*inch, label)
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 6)
    c.drawString(0.55*inch, H - 0.225*inch, "THE YACHT CACHE")
    c.drawRightString(W - 0.55*inch, H - 0.225*inch, data.get("year","") + " " + data.get("make",""))
    c.setFillColor(GOLD)
    c.rect(0, 0, W, 0.05*inch, fill=1, stroke=0)
    c.setFillColor(DARK_CARD)
    c.rect(0, 0.05*inch, W, 0.26*inch, fill=1, stroke=0)
    c.setFillColor(GOLD_DIM)
    c.setFont("Helvetica", 6.5)
    c.drawCentredString(W/2, 0.12*inch,
        "DENISON YACHTING  \\u00b7  " + data["broker_email"] + "  \\u00b7  " + data["broker_phone"])
    c.restoreState()

def crop_fill(img, target_w, target_h):
    iw, ih = img.size
    scale = max(target_w / iw, target_h / ih)
    nw, nh = int(iw*scale), int(ih*scale)
    resized = img.resize((nw, nh), PILImage.LANCZOS)
    left = (nw - target_w) // 2
    top  = (nh - target_h) // 2
    return resized.crop((left, top, left+target_w, top+target_h))

# ── Build ───────────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(data["out_path"], pagesize=letter,
    leftMargin=0.6*inch, rightMargin=0.6*inch,
    topMargin=0.65*inch, bottomMargin=0.55*inch)

story = []
story.append(PageBreak())  # triggers cover

# ── Specs section ───────────────────────────────────────────────────────────────
specs = data.get("specs", {})
spec_rows = [
    ("Make / Builder", data.get("make","")),
    ("Model",          data.get("model","")),
    ("Year",           data.get("year","")),
    ("LOA",            data.get("length","")),
    ("Location",       data.get("location","")),
    ("Asking Price",   data.get("price","")),
]
# Add specs fields
spec_map = [
    ("beam","Beam"), ("draft","Draft"), ("displacement","Displacement"),
    ("gross_tonnage","Gross Tonnage"), ("hull_material","Hull Material"),
    ("classification","Classification"), ("designer","Designer / NA"),
    ("engines","Engines"), ("fuel_tank","Fuel Tank"), ("water_tank","Water Tank"),
    ("range","Range"), ("max_speed","Max Speed"), ("cruise_speed","Cruise Speed"),
    ("staterooms","Staterooms"), ("crew","Crew"),
]
for key, label in spec_map:
    if specs.get(key):
        spec_rows.append((label, str(specs[key])))

if spec_rows:
    for h in sec_head("Design & Construction"):
        story.append(h)
    story.append(spacer(0.05))
    kw = 1.65*inch
    vw = letter[0] - 0.6*inch - 0.6*inch - kw
    rows = []
    for label, val in spec_rows:
        is_price = "price" in label.lower() or "asking" in label.lower()
        is_eng   = "engine" in label.lower()
        style = STYLES["spec_bold"] if (is_price or is_eng) else STYLES["spec_val"]
        rows.append([Paragraph(label.upper(), STYLES["spec_key"]),
                     Paragraph(str(val), style)])
    t = Table(rows, colWidths=[kw, vw], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1),"TOP"),
        ("TOPPADDING",    (0,0),(-1,-1),5),
        ("BOTTOMPADDING", (0,0),(-1,-1),5),
        ("LEFTPADDING",   (0,0),(-1,-1),0),
        ("RIGHTPADDING",  (0,0),(-1,-1),6),
        ("LINEBELOW",     (0,0),(-1,-2),0.4,colors.HexColor("#1e2a3a")),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[colors.HexColor("#0a1322"),colors.HexColor("#0d1520")]),
    ]))
    story.append(t)

# ── Highlights ─────────────────────────────────────────────────────────────────
highlights = data.get("highlights", [])
if highlights:
    story.append(spacer(0.06))
    for h in sec_head("Highlights"):
        story.append(h)
    story.append(spacer(0.04))
    for h in highlights:
        story.append(bul(str(h)))

# ── Custom sections ────────────────────────────────────────────────────────────
for section in data.get("sections", []):
    story.append(spacer(0.04))
    for h in sec_head(section.get("title","")):
        story.append(h)
    story.append(spacer(0.03))
    for sub in section.get("subsections", []):
        if sub.get("title"):
            story.append(Paragraph(sub["title"], STYLES["sub_head"]))
        for b in sub.get("bullets", []):
            story.append(bul(str(b)))
        if sub.get("paragraph"):
            story.append(Paragraph(sub["paragraph"], STYLES["body_sm"]))

# ── Photo gallery ──────────────────────────────────────────────────────────────
HEADER_H = 0.46*inch
FOOTER_H = 0.38*inch
MARGIN   = 0.5*inch
GAP      = 0.10*inch
AW = letter[0] - 2*MARGIN
AH = letter[1] - HEADER_H - FOOTER_H - 2*MARGIN
CELL_W4 = int((AW - GAP) / 2 * 72)  # pixels at 72dpi
CELL_H4 = int((AH - GAP) / 2 * 72)
CELL_W2 = int(AW * 72)
CELL_H2 = int((AH - GAP) / 2 * 72)

image_urls = data.get("images", [])
if data.get("hero_image") and data["hero_image"] not in image_urls:
    image_urls = [data["hero_image"]] + image_urls

# Fetch all images
local_images = []
for url in image_urls:
    local = fetch_image(url)
    if local:
        local_images.append(local)

def make_grid_page(img_paths, cols=2, rows=2):
    story.append(PageBreak())
    cw = (AW - (cols-1)*GAP) / cols
    ch = (AH - (rows-1)*GAP) / rows
    cw_px = int(cw * 72)
    ch_px = int(ch * 72)
    grid_rows = []
    idx = 0
    for r in range(rows):
        row = []
        for c in range(cols):
            if idx < len(img_paths):
                try:
                    img = PILImage.open(img_paths[idx])
                    filled = crop_fill(img, cw_px, ch_px)
                    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                    filled.save(tmp.name, quality=90)
                    tmp.close()
                    row.append(RLImage(tmp.name, width=cw, height=ch))
                except:
                    row.append(Spacer(cw, ch))
            else:
                row.append(Spacer(cw, ch))
            idx += 1
        grid_rows.append(row)
    t = Table(grid_rows, colWidths=[cw]*cols, rowHeights=[ch]*rows)
    t.setStyle(TableStyle([
        ("ALIGN",       (0,0),(-1,-1),"CENTER"),
        ("VALIGN",      (0,0),(-1,-1),"MIDDLE"),
        ("INNERGRID",   (0,0),(-1,-1),1.5,DARK),
        ("BOX",         (0,0),(-1,-1),1.5,DARK),
        ("TOPPADDING",  (0,0),(-1,-1),1),
        ("BOTTOMPADDING",(0,0),(-1,-1),1),
        ("LEFTPADDING", (0,0),(-1,-1),1),
        ("RIGHTPADDING",(0,0),(-1,-1),1),
    ]))
    story.append(t)

if local_images:
    # Chunk into 4-up pages
    for i in range(0, len(local_images), 4):
        chunk = local_images[i:i+4]
        if len(chunk) == 1:
            make_grid_page(chunk, cols=1, rows=1)
        elif len(chunk) == 2:
            make_grid_page(chunk, cols=2, rows=1)
        else:
            make_grid_page(chunk, cols=2, rows=2)

# ── Render ─────────────────────────────────────────────────────────────────────
pn = [0]
CONTENT_CUTOFF = 5

def on_page(c, doc):
    pn[0] += 1
    if pn[0] == 1:
        cover_page(c, doc)
    elif pn[0] <= CONTENT_CUTOFF:
        content_page(c, doc)
    else:
        photo_page(c, doc)

doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"PDF generated: {data['out_path']}")
`;
}
