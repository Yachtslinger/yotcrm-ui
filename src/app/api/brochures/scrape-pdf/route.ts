/**
 * POST /api/brochures/scrape-pdf
 * Accepts a PDF upload, extracts text with Python/pdfplumber,
 * then maps the extracted text to VesselData fields using the same
 * SPEC_MAP logic as the HTML scrapers.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

const EXTRACT_SCRIPT = `
import sys, json, re

# ── Noise signatures from GA drawings, deck plans, scale rulers ───────────────
NOISE_RE = re.compile(
    r'^[-\\d\\s]+$'                           # pure number/ruler scale lines
    r'|^(UP|DN)(\\s+(UP|DN))*\\s*$'           # direction arrows
    r'|^(FLYBRIDGE|BRIDGE DECK|MAIN DECK|LOWER DECK|SUN DECK|UPPER LOUNGE)$'
    r'|^(SUNBED|JACUZZI|LOUNGE BAR|ENGINE ROOM|BEACHCLUB|PULLMAN|AFT LOUNGE)$'
    r'|^(GYM.*LOUNGE|PILOT HOUSE|SALON|DINING|GALLEY|LAUNDRY|CREW MESS)$'
    r'|^(INBOARD PROFILE|ARRANGEMENT|PROFILE|SCALE \\d|SIZE:\\s*A\\d|BN \\d+|FEET)$'
    r'|^\\d+(\\s+\\d+){4,}',                  # 5+ sequential numbers (ruler)
    re.IGNORECASE
)

def is_noise(s):
    s = s.strip()
    if not s or len(s) < 2:
        return True
    if NOISE_RE.match(s):
        return True
    # Lines that are 80%+ digits/spaces/hyphens = ruler noise
    noise_chars = sum(1 for c in s if c in '0123456789 -')
    if len(s) > 6 and noise_chars / len(s) > 0.80:
        return True
    return False

def normalize_eu_decimal(s):
    """34,13m → 34.13m  (only when digits flank the comma)"""
    return re.sub(r'(\\d),(\\d)', r'\\1.\\2', s)

def crop_left_half(page):
    """Crop to left 55% of page — avoids GA drawings on right side"""
    try:
        bbox = (0, 0, page.width * 0.55, page.height)
        return page.crop(bbox)
    except Exception:
        return page

def extract_pages(pdf_path):
    pages_text = []
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                # First try full-page tables (structured spec sheets)
                tables = page.extract_tables()
                if tables:
                    ttext = ""
                    for table in tables:
                        for row in (table or []):
                            if not row:
                                continue
                            non_empty = [c.strip() for c in row if c and c.strip()]
                            if len(non_empty) == 2:
                                ttext += f"{non_empty[0]}: {non_empty[1]}\\n"
                            elif len(non_empty) == 1:
                                ttext += non_empty[0] + "\\n"
                    if ttext.strip():
                        pages_text.append(ttext)
                        continue

                # Crop to left half then full page fallback
                for crop_fn in [crop_left_half, lambda p: p]:
                    cropped = crop_fn(page)
                    t = cropped.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    if t.strip():
                        pages_text.append(t)
                        break
                else:
                    pages_text.append("")
    except Exception:
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                pages_text.append(page.extract_text() or "")
        except Exception as e:
            sys.exit(f"PDF extraction failed: {e}")
    return pages_text

def clean(text):
    lines = []
    for line in text.split("\\n"):
        line = line.strip()
        if not is_noise(line):
            lines.append(normalize_eu_decimal(line))
    return "\\n".join(lines)

# ── Known field extractors: try patterns in order ────────────────────────────
# Each entry: (field_name, [list of label regex patterns])
FIELD_DEFS = [
    ("loa",            [r"length\\s+over\\s+all", r"\\bloa\\b", r"length\\s*overall"]),
    ("lwl",            [r"length\\s+waterline", r"\\blwl\\b"]),
    ("beam",           [r"\\bbeam\\b"]),
    ("draft",          [r"\\bdraft\\b", r"\\bdraught\\b"]),
    ("displacement",   [r"\\bdisplacement\\b"]),
    ("grossTonnage",   [r"gross\\s+tons?", r"\\btonnage\\b", r"\\bgt\\b"]),
    ("classification", [r"\\bclassification\\b"]),
    ("flagState",      [r"flag\\s+compliance", r"\\bflag\\b"]),
    ("hullMaterial",   [r"hull\\s+material"]),
    ("hullForm",       [r"hull\\s+shape", r"hull\\s+form", r"hull\\s+type"]),
    ("superstructure", [r"superstructure\\s+material", r"\\bsuperstructure\\b"]),
    ("exteriorDesign", [r"exterior\\s+design"]),
    ("interiorDesign", [r"interior\\s+design"]),
    ("navalArchitect", [r"naval\\s+arch"]),
    ("engines",        [r"engine\\s+brand", r"engine\\s+type", r"\\bengines?\\b"]),
    ("power",          [r"engine\\s+hp", r"engine\\s+power"]),
    ("propellers",     [r"shaft\\s*/\\s*propeller", r"\\bpropeller\\b"]),
    ("gearbox",        [r"gearbox\\s+and", r"\\bgearbox\\b"]),
    ("maxSpeed",       [r"top\\s+speed", r"max(?:imum)?\\s+speed"]),
    ("range",          [r"range\\s*@\\s*\\d+", r"\\brange\\b"]),
    ("fuelTank",       [r"fuel\\s+capacity", r"fuel\\s+tank"]),
    ("freshWater",     [r"fresh\\s*water\\s+capacity", r"fresh\\s*water"]),
    ("holdingTank",    [r"holding\\s+tank"]),
    ("lubeOil",        [r"lube\\s+oil"]),
    ("guests",         [r"\\baccommodation\\b", r"\\bguests?\\b", r"\\bpassengers?\\b"]),
    ("crew",           [r"^crew\\b"]),
    ("staterooms",     [r"\\bstaterooms?\\b", r"\\bcabins?\\b"]),
    ("price",          [r"\\bprice\\b", r"asking\\s+price"]),
    ("location",       [r"^location\\b"]),
    ("builder",        [r"\\bbuilder\\b", r"\\bshipyard\\b"]),
]

def extract_field_value(text, patterns):
    lines = text.split("\\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        for pat in patterns:
            # Format 1: "Label: Value" — colon-separated
            m = re.match(rf'(?i)(?:{pat})(?:[^:\\n]{{0,40}})?:\\s*(.+)', line)
            if m:
                val = m.group(1).strip()
                if val and not is_noise(val):
                    return val
            # Format 2: "Label    Value" — 2+ spaces, no colon (VDV/space-separated style)
            m = re.match(rf'(?i)(?:{pat})(?:[^\\d\\n]{{0,35}}?)\\s{{2,}}(\\S.+)', line)
            if m:
                val = m.group(1).strip()
                if val and not is_noise(val):
                    return val
    return ""

def parse_name(text, pages_text):
    # Look for "M/Y Name" or "MY Name" or "Vessel Name"
    for pat in [r"(?i)^M/?Y\\.?\\s+([A-Z][A-Za-z0-9\\s'\\-]{2,40})", r"(?im)^(?:vessel|yacht)\\s+name\\s*:?\\s*([^\\n]+)"]:
        m = re.search(pat, text)
        if m:
            return m.group(1).strip()
    # VDV brochures: vessel name often large text near top of page 3+
    if len(pages_text) >= 3:
        for line in pages_text[2].split('\\n')[:10]:
            line = line.strip()
            if line and len(line) < 30 and re.match(r'^[A-Z][A-Za-z0-9\\s]+$', line):
                return line
    return ""

def parse_description(text):
    # Find longest paragraph (100+ chars) — skip lines that look like spec tables
    paras = re.split(r'\\n{2,}', text)
    candidates = []
    for p in paras:
        p = p.strip()
        if len(p) > 150 and not re.search(r'(?i)(displacement|engine|beam|draft|loa|speed|capacity)', p[:50]):
            candidates.append(p)
    if candidates:
        return max(candidates, key=len)[:1500]
    return ""

# ── Main ──────────────────────────────────────────────────────────────────────
pages_text = extract_pages(sys.argv[1])
full_text = "\\n\\n".join(pages_text)
cleaned = clean(full_text)

specs = {}
for field, patterns in FIELD_DEFS:
    val = extract_field_value(cleaned, patterns)
    if val:
        specs[field] = val

# Vessel name from raw (pre-clean) to catch M/Y in early pages
name = parse_name(full_text, pages_text)
description = parse_description(cleaned)

# Image URLs if any
img_urls = re.findall(r'https?://[^\\s"<>\\x27]+\\.(?:jpe?g|png|webp)', full_text, re.IGNORECASE)

result = {
    "raw_text": cleaned[:12000],
    "specs": specs,
    "name": name,
    "description": description,
    "images": list(set(img_urls))[:20],
    "page_count": len(pages_text),
}
print(json.dumps(result, ensure_ascii=False))
`;

export async function POST(req: NextRequest) {
  const tmpDir = os.tmpdir();
  const scriptPath = path.join(tmpDir, "extract_pdf.py");
  let pdfPath = "";

  try {
    // Write extraction script
    fs.writeFileSync(scriptPath, EXTRACT_SCRIPT);

    // Parse multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "File must be a PDF" }, { status: 400 });
    }

    // Save PDF to temp file
    const ts = Date.now();
    pdfPath = path.join(tmpDir, `brochure_${ts}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfPath, buffer);

    // Run extraction
    const { stdout } = await execFileAsync("python3", [scriptPath, pdfPath], {
      timeout: 45_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const extracted = JSON.parse(stdout.trim());

    // The new script returns specs already mapped to VesselData field names
    // Plus name and description directly
    const vessel = mapSpecsToVessel(extracted.specs, extracted.description, extracted.raw_text, extracted.name);

    return NextResponse.json({
      ok: true,
      vessel,
      rawText: extracted.raw_text,
      pageCount: extracted.page_count,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF scrape failed";
    console.error("[scrape-pdf]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
  }
}

// The new extraction script returns specs keyed by VesselData field names directly.
// This function just copies them in, filling defaults and doing final cleanup.
function mapSpecsToVessel(
  specs: Record<string, string>,
  description: string,
  rawText: string,
  name?: string
) {
  const VESSEL_FIELDS = [
    "loa","lwl","beam","draft","displacement","grossTonnage","classification","flagState",
    "hullMaterial","hullForm","superstructure","exteriorDesign","interiorDesign","navalArchitect",
    "engines","power","propellers","gearbox","maxSpeed","range","fuelTank","freshWater",
    "holdingTank","lubeOil","guests","crew","staterooms","price","location","builder",
    "stabilisers","waterMaker","bowThruster","sternThruster","gensets","airCon",
  ];

  const v: Record<string, string | number | null | string[] | {src:string;alt:string}[]> = {
    name: name || "",
    description: description || "",
    features: [],
    images: [],
    year: null,
    sourceUrl: "",
    stockNumber: "",
    livingSpace: "",
    navigation: "",
    crewCabins: "",
    tender: "",
  };

  // Copy all extracted fields
  for (const f of VESSEL_FIELDS) {
    v[f] = specs[f] || "";
  }

  // Extract year from price/location context or builder field
  if (!v.year) {
    const yearMatch = (specs.year || rawText).match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1]);
      if (y > 1900 && y <= new Date().getFullYear() + 10) v.year = y;
    }
  }

  // Build images from any URLs found in raw text
  const imgUrls = rawText.match(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)/gi) || [];
  v.images = [...new Set(imgUrls)].slice(0, 20).map((src: string) => ({ src, alt: "" }));

  return v;
}
