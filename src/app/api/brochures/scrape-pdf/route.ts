/**
 * POST /api/brochures/scrape-pdf
 * Accepts a PDF upload, extracts text with Python/pdfplumber,
 * then maps the extracted text to VesselData fields.
 *
 * Handles multiple PDF spec formats:
 *   Format A: "Label: Value"                         (most sites)
 *   Format B: "Label    Value"  (2+ spaces)          (Van der Valk style)
 *   Format C: "Label – (qualifier) VALUE IMPERIAL"   (Sunseeker/builder brochures)
 *   Format D: "Label VALUE"     (single space)       (Sunseeker principal chars)
 *   Format E: "Label text"      (trailing word)      (builder/architect credit lines)
 *   Format F: "Keyword present" (boolean features)   (bow thruster, autopilot, AC...)
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { emptyVessel } from "@/lib/vessel-scraper/types";
import type { VesselData } from "@/lib/vessel-scraper/types";
import { aiExtractSpecs } from "@/lib/vessel-scraper/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

const EXTRACT_SCRIPT = `
import sys, json, re

# ── Noise filter ──────────────────────────────────────────────────────────────
NOISE_RE = re.compile(
    r'^[-\\d\\s]+$'
    r'|^(UP|DN)(\\s+(UP|DN))*\\s*$'
    r'|^(FLYBRIDGE|BRIDGE DECK|MAIN DECK|LOWER DECK|SUN DECK|UPPER LOUNGE)$'
    r'|^(SUNBED|JACUZZI|LOUNGE BAR|ENGINE ROOM|BEACHCLUB|PULLMAN|AFT LOUNGE)$'
    r'|^(GYM.*LOUNGE|PILOT HOUSE|SALON|DINING|GALLEY|LAUNDRY|CREW MESS)$'
    r'|^(INBOARD PROFILE|ARRANGEMENT|PROFILE|SCALE \\d|SIZE:\\s*A\\d|BN \\d+|FEET)$'
    r'|^\\d+(\\s+\\d+){4,}',
    re.IGNORECASE
)

def is_noise(s):
    s = s.strip()
    if not s or len(s) < 2:
        return True
    if NOISE_RE.match(s):
        return True
    noise_chars = sum(1 for c in s if c in '0123456789 -')
    if len(s) > 6 and noise_chars / len(s) > 0.80:
        return True
    return False

def normalize_eu_decimal(s):
    return re.sub(r'(\\d),(\\d)', r'\\1.\\2', s)

def decode_em(s):
    """Normalize em-dash and en-dash variants to simple hyphen for matching"""
    return s.replace('\\u2013', '-').replace('\\u2014', '-').replace('\\u2012', '-').replace('\\xe2\\x80\\x93', '-')

def extract_pages(pdf_path):
    pages_text = []
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    ttext = ""
                    for table in tables:
                        for row in (table or []):
                            if not row: continue
                            non_empty = [c.strip() for c in row if c and c.strip()]
                            if len(non_empty) == 2:
                                ttext += f"{non_empty[0]}: {non_empty[1]}\\n"
                            elif len(non_empty) == 1:
                                ttext += non_empty[0] + "\\n"
                    if ttext.strip():
                        pages_text.append(ttext)
                        continue
                # Try full page (some builder PDFs have 2-column layouts that crop badly)
                t = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                if t.strip():
                    pages_text.append(t)
                else:
                    pages_text.append("")
    except Exception:
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            for pg in reader.pages:
                pages_text.append(pg.extract_text() or "")
        except Exception as e:
            sys.exit(f"PDF extraction failed: {e}")
    return pages_text

def clean(text):
    lines = []
    for line in text.split("\\n"):
        line = line.strip()
        if not is_noise(line):
            lines.append(normalize_eu_decimal(decode_em(line)))
    return "\\n".join(lines)

# ── Multi-format field extraction ─────────────────────────────────────────────
# Handles:
#   A) "Label: Value"
#   B) "Label  Value" (2+ spaces)
#   C) "Label - (qualifier) value"   (em-dash style, already decoded to -)
#   D) "Label value"  (label then direct measurement: "Fuel capacity 5900 litres")

def extract_field(text, label_pats, value_pat=None):
    """
    Try to extract a value matching label_pats from each line in text.
    value_pat: optional regex to validate/capture from the value portion.
    Returns first match found.
    """
    lines = text.split("\\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        for pat in label_pats:
            # Format A: "Label: Value"
            m = re.match(rf'(?i)(?:{pat})(?:[^:\\n]{{0,50}})?:\\s*(.+)', line)
            if m:
                val = m.group(1).strip()
                if val and not is_noise(val):
                    if value_pat:
                        vm = re.search(value_pat, val, re.IGNORECASE)
                        return vm.group(0).strip() if vm else val
                    return val

            # Format B: "Label    Value" (2+ spaces)
            m = re.match(rf'(?i)(?:{pat})(?:[^\\d\\n]{{0,40}}?)\\s{{2,}}(\\S.+)', line)
            if m:
                val = m.group(1).strip()
                if val and not is_noise(val):
                    if value_pat:
                        vm = re.search(value_pat, val, re.IGNORECASE)
                        return vm.group(0).strip() if vm else val
                    return val

            # Format C: "Label - (qualifier) value" (already dash-decoded)
            m = re.match(rf'(?i)(?:{pat})[^-\\n]{{0,50}}?\\s*-\\s*(?:\\([^)]+\\)\\s*)?(\\S.+)', line)
            if m:
                val = m.group(1).strip()
                # Exclude lines like "Label - subheading" that are section headers
                if val and not is_noise(val) and not re.match(r'^[A-Z][A-Z\\s]{3,}$', val):
                    if value_pat:
                        vm = re.search(value_pat, val, re.IGNORECASE)
                        return vm.group(0).strip() if vm else val
                    return val

            # Format D: "Label value" (single space, label at start of line)
            # Only for lines starting with the label pattern followed by a measurement
            if value_pat:
                m = re.match(rf'(?i)^(?:{pat})\\s+(\\S.{{2,100}})', line)
                if m:
                    val = m.group(1).strip()
                    vm = re.search(value_pat, val, re.IGNORECASE)
                    if vm:
                        return vm.group(0).strip()

    return ""

# ── MEASUREMENT value patterns ────────────────────────────────────────────────
# These capture the first measurement unit in a value string

DIM_PAT    = r'[\\d.,]+\\s*(?:m|ft|mm|cm|\\')(?:[\\d\\"]+)?(?:\\s*/\\s*[\\d.,]+\\s*(?:m|ft|mm|cm))?'
SPEED_PAT  = r'(?:up\\s+to\\s+)?[\\d.,]+\\s*(?:knots?|kn|km/h)'
RANGE_PAT  = r'(?:up\\s+to\\s+)?[\\d.,]+\\s*(?:nautical\\s*miles?|nm|nmi)'
WEIGHT_PAT = r'[\\d,]+\\s*(?:kg|lb|tons?|t\\b)'
VOL_PAT    = r'[\\d.,]+\\s*(?:litres?|liters?|lt|l\\b|gallons?|gal)'
POWER_PAT  = r'[\\d,]+\\s*(?:hp|kw|ps|bhp|mhp)'
YEAR_PAT   = r'\\b(19[5-9]\\d|20[0-4]\\d)\\b'

# ── Field definitions ─────────────────────────────────────────────────────────
# (field_name, [label_patterns], optional_value_pattern)
# label_patterns matched against start of line (formats A-D)

FIELD_DEFS = [
    # Dimensions — "length" added so plain "Length: 80'" matches (was LOA-only).
    # Plain "beam" added so "Beam: 20'1\"" matches (regex previously required a dash or paren).
    ("loa",          [r"length\\s+overall", r"length\\s+over\\s+all", r"\\bloa\\b", r"\\blength\\b"],  DIM_PAT),
    ("lwl",          [r"length\\s+waterline", r"\\blwl\\b"],                                   DIM_PAT),
    ("beam",         [r"beam\\s*[-(]", r"^beam\\b", r"\\bbeam\\b"],                          DIM_PAT),
    ("beamMax",      [r"max(?:imum)?\\s*beam", r"beam\\s*max"],                                  DIM_PAT),
    ("draft",        [r"draft", r"draught"],                                                    DIM_PAT),
    ("airDraft",     [r"height\\s+above\\s+waterline", r"air\\s+draft", r"air\\s+draught"],    DIM_PAT),
    ("displacement", [r"displacement"],                                                          WEIGHT_PAT),
    # Performance
    ("maxSpeed",     [r"maximum\\s+speed", r"max(?:imum)?\\s+speed", r"top\\s+speed", r"maximum\\s+speed"],   SPEED_PAT),
    ("cruiseSpeed",  [r"cruising\\s+speed", r"cruise\\s+speed", r"service\\s+speed"],          SPEED_PAT),
    ("range",        [r"range"],                                                                 RANGE_PAT),
    # Propulsion
    ("propulsion",   [r"propulsion"],                                                            None),
    ("engines",      [r"engine\\s+options?", r"main\\s+engines?", r"engines?\\b"],             None),
    ("power",        [r"engine\\s+options?", r"total\\s+power", r"engine\\s+power"],           POWER_PAT),
    ("gensets",      [r"generators?"],                                                           None),
    ("freshWater",   [r"fresh.?water\\s+capacity", r"fresh.?water"],                            VOL_PAT),
    ("holdingTank",  [r"holding\\s+tank"],                                                      None),
    ("fuelTank",     [r"fuel\\s+capacity", r"fuel\\s+tank"],                                  VOL_PAT),
    # Drivetrain — picked up if labelled on the spec block.
    ("gearbox",      [r"transmissions?", r"gearbox(?:es)?"],                                   None),
    # Accommodation extras.
    ("heads",        [r"^heads\\b", r"number\\s+of\\s+heads"],                              r"\\d+"),
    ("sleeps",       [r"\\bsleeps\\b", r"total\\s+berths"],                                 r"\\d+"),
    ("netTonnage",   [r"net\\s+ton", r"\\bnt\\b"],                                          None),
    # Identity
    ("builder",      [r"\\bbuilder\\b"],                                                         None),
    ("navalArchitect",[r"naval\\s+arch"],                                                        None),
    ("exteriorDesign",[r"exterior\\s+styl", r"exterior\\s+design"],                             None),
    ("interiorDesign",[r"interior\\s+design"],                                                   None),
    ("hullMaterial", [r"hull\\s+material", r"hull\\s+construction", r"construction\\b"],        None),
    ("hullForm",     [r"hull\\s+form", r"hull\\s+type", r"hull\\s+shape", r"hull\\s+config"], None),
    ("grossTonnage", [r"gross\\s+ton", r"\\bgt\\b"],                                            None),
    ("classification",[r"classification"],                                                        None),
    ("flagState",    [r"\\bflag\\b"],                                                            None),
    # Accommodation
    ("guests",       [r"\\bguests?\\b", r"passengers?", r"accommodation.*up\\s+to"],            r'\\d+'),
    ("crew",         [r"^crew\\s+members?", r"^crew\\b"],                                        r'\\d+'),
    ("staterooms",   [r"staterooms?", r"guest\\s+cabins?", r"cabins?"],                         r'\\d+'),
    ("crewCabins",   [r"crew\\s+cabin", r"crew\\s+quarter"],                                    None),
    # Other
    ("price",        [r"asking\\s+price", r"\\bprice\\b"],                                      None),
    ("location",     [r"^location\\b", r"currently\\s+located"],                               None),
]

# ── Boolean/presence features ─────────────────────────────────────────────────
# If pattern found anywhere in text, set field to the matched text

PRESENCE_DEFS = [
    ("bowThruster",    r"hydraulic\\s+bow\\s+thruster\\s*\\([^)]+\\)",        r"hydraulic\\s+bow\\s+thruster"),
    ("sternThruster",  r"hydraulic\\s+stern\\s+thruster\\s*\\([^)]+\\)",      r"hydraulic\\s+stern\\s+thruster"),
    ("autopilot",      r"\\bautopilot\\b",                                     None),
    ("radar",          r"radar[/\\\\]chartplotter|\\bradar\\b",                 None),
    ("chartPlotter",   r"radar/chartplotter[^\\n]*gps",                        None),
    ("aisSystem",      r"\\bais\\b",                                            None),
    ("satcom",         r"vsat|satcom|satellite\\s+comm",                        None),
    ("fireSuppression",r"automatic\\s+fire\\s+extinguish[^\\n]*engine",        r"automatic\\s+fire\\s+extinguish\\w+"),
    ("airCon",         r"all\\s+cabin\\s+air.?conditioning|air.?conditioning", None),
    ("shorepower",     r"(?:ac\\s+)?shore\\s+power",                           None),
]

def extract_presence(text, full_pat, short_pat=None):
    m = re.search(full_pat, text, re.IGNORECASE)
    if m:
        return m.group(0).strip()
    if short_pat:
        m = re.search(short_pat, text, re.IGNORECASE)
        if m:
            return m.group(0).strip()
    return ""

# ── Special parsers for compound values ──────────────────────────────────────

def parse_accommodation(text):
    """Extract guest count from lines like 'ACCOMMODATION: UP TO 8 GUESTS AND 4 CREW'"""
    m = re.search(r'accommodation[^\\n]*up\\s+to\\s+(\\d+)\\s+guests?', text, re.IGNORECASE)
    if m: return m.group(1)
    m = re.search(r'up\\s+to\\s+(\\d+)\\s+guests?', text, re.IGNORECASE)
    if m: return m.group(1)
    return ""

def parse_crew(text):
    m = re.search(r'(\\d+)\\s+crew\\s+members?', text, re.IGNORECASE)
    if m: return m.group(1)
    m = re.search(r'accommodation.*?(\\d+)\\s+crew', text, re.IGNORECASE)
    if m: return m.group(1)
    return ""

def parse_builder_name(line):
    """'Builder Sunseeker International' → 'Sunseeker International'"""
    m = re.match(r'(?i)^builder\\s+(.{3,50})$', line.strip())
    return m.group(1).strip() if m else ""

def parse_naval_arch(line):
    m = re.match(r'(?i)^naval\\s+architects?\\s+(.{3,80})$', line.strip())
    return m.group(1).strip() if m else ""

def parse_exterior(line):
    m = re.match(r'(?i)^exterior\\s+styl\\w*\\s+(.{3,80})$', line.strip())
    return m.group(1).strip() if m else ""

def parse_interior(line):
    m = re.match(r'(?i)^interior\\s+design\\s+(.{3,80})$', line.strip())
    return m.group(1).strip() if m else ""

def parse_name_from_pdf(pages_text, full_text):
    """Try to find vessel or model name"""
    # MY / M/Y prefix
    m = re.search(r'(?i)^M/?Y\\.?\\s+([A-Z][A-Za-z0-9\\s\\'\\-]{2,40})', full_text, re.MULTILINE)
    if m: return m.group(1).strip()
    # "Vessel Name: X" pattern
    m = re.search(r'(?im)^(?:vessel|yacht)\\s+name\\s*:?\\s*([^\\n]+)', full_text)
    if m: return m.group(1).strip()
    # Builder brochure: model name is often the large heading on page 1
    # e.g. "PREDATOR 82" — all caps, short
    if pages_text:
        for line in pages_text[0].split('\\n')[:8]:
            line = line.strip()
            if re.match(r'^[A-Z][A-Z0-9\\s]{3,30}$', line) and len(line.split()) <= 4:
                # Skip generic headings
                if not re.match(r'^(STYLE|ACCOMMODATION|PERFORMANCE|FEATURES|SPECIFICATION)\\b', line):
                    return line
    return ""

def parse_description(text):
    paras = re.split(r'\\n{2,}', text)
    candidates = []
    for p in paras:
        p = p.strip()
        # Good description: 150+ chars, reads like prose, not pure spec table
        if len(p) > 150 and p.count('\\n') < 10:
            if not re.match(r'^\\d+\\s+[A-Z]', p):  # not a numbered spec section
                if re.search(r'\\b(the|and|with|its|for|has|this|that|offers?)\\b', p, re.IGNORECASE):
                    candidates.append(p)
    if candidates:
        return max(candidates, key=len)[:1500]
    return ""

# ── Main ──────────────────────────────────────────────────────────────────────
pages_text = extract_pages(sys.argv[1])
full_text = "\\n\\n".join(pages_text)
cleaned   = clean(full_text)

specs = {}

# Primary extraction: structured patterns
for field, label_pats, val_pat in FIELD_DEFS:
    val = extract_field(cleaned, label_pats, val_pat)
    if val:
        specs[field] = val

# Special line-by-line parsers for credit lines that use single-space format
for line in cleaned.split("\\n"):
    if not specs.get("builder"):
        v = parse_builder_name(line)
        if v: specs["builder"] = v
    if not specs.get("navalArchitect"):
        v = parse_naval_arch(line)
        if v: specs["navalArchitect"] = v
    if not specs.get("exteriorDesign"):
        v = parse_exterior(line)
        if v: specs["exteriorDesign"] = v
    if not specs.get("interiorDesign"):
        v = parse_interior(line)
        if v: specs["interiorDesign"] = v

# Accommodation counts from summary line
if not specs.get("guests"):
    v = parse_accommodation(cleaned)
    if v: specs["guests"] = v
if not specs.get("crew"):
    v = parse_crew(cleaned)
    if v: specs["crew"] = v

# Presence-based boolean/feature extraction
for field, full_pat, short_pat in PRESENCE_DEFS:
    if not specs.get(field):
        v = extract_presence(cleaned, full_pat, short_pat)
        if v: specs[field] = v

# Name and description
name = parse_name_from_pdf(pages_text, full_text)
description = parse_description(cleaned)

# Hull material from construction section
if not specs.get("hullMaterial"):
    m = re.search(r'(?i)hand.?laid\\s+(GRP|FRP|alumin\\w+|steel|fiberglass)', cleaned)
    if m: specs["hullMaterial"] = f"Hand-laid {m.group(1)}"

# Year
year_match = re.search(r'\\b(19[5-9]\\d|20[0-4]\\d)\\b', cleaned)
year = int(year_match.group(1)) if year_match else None

# Images
img_urls = re.findall(r'https?://[^\\s"<>\\']+\\.(?:jpe?g|png|webp)', full_text, re.IGNORECASE)

result = {
    "raw_text":   cleaned[:14000],
    "specs":      specs,
    "name":       name,
    "description":description,
    "images":     list(set(img_urls))[:20],
    "page_count": len(pages_text),
    "year":       year,
}
print(json.dumps(result, ensure_ascii=False))
`;

export async function POST(req: NextRequest) {
  const tmpDir = os.tmpdir();
  const scriptPath = path.join(tmpDir, "extract_pdf.py");
  let pdfPath = "";

  try {
    fs.writeFileSync(scriptPath, EXTRACT_SCRIPT);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "File must be a PDF" }, { status: 400 });
    }

    const ts = Date.now();
    pdfPath = path.join(tmpDir, `brochure_${ts}.pdf`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(pdfPath, buffer);

    const { stdout } = await execFileAsync("python3", [scriptPath, pdfPath], {
      timeout: 45_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const extracted = JSON.parse(stdout.trim());

    // Layer 1+2: map regex-extracted fields onto a canonical VesselData shape.
    const vessel = mapSpecsToVessel(
      extracted.specs,
      extracted.description,
      extracted.raw_text,
      extracted.name,
      extracted.year,
    );

    // Layer 3: AI extraction. Mirrors the URL scraper's L3 — Claude fills any
    // fields the regex pass left empty, reading the full extracted PDF text.
    // No-op without ANTHROPIC_API_KEY (so local dev returns L1+L2 only).
    // This is the single biggest win for prose-heavy broker write-ups where
    // the spec table is sparse and the real data lives in paragraphs.
    if (extracted.raw_text && extracted.raw_text.length > 200) {
      try { await aiExtractSpecs(vessel, extracted.raw_text); }
      catch (e) { console.error("[scrape-pdf] aiExtractSpecs failed:", e); }
    }

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

/**
 * Map regex-extracted fields onto a canonical VesselData via emptyVessel().
 * Returns a real VesselData so downstream code (merge, prepVessel, render)
 * treats PDF-sourced vessels identically to URL-scraped ones.
 *
 * Skill split:
 *   - This function does the structured spec mapping + image/feature extraction.
 *   - The POST handler then calls aiExtractSpecs() as Layer 3 to fill any
 *     spec fields the regex pass missed. Prose handling lives here; AI
 *     completion lives in the route.
 */
function mapSpecsToVessel(
  specs: Record<string, string>,
  description: string,
  rawText: string,
  name?: string,
  year?: number | null,
): VesselData {
  const v = emptyVessel("");
  if (name) v.name = name;
  if (description) v.description = description;
  if (year != null) v.year = year;

  // Copy any spec field whose key happens to match VesselData. unknown fields
  // (e.g. transmissions, heads, sleeps) ride along on the same object — they
  // don't hurt, and may be picked up by downstream features/description logic.
  const vRec = v as unknown as Record<string, unknown>;
  for (const [k, val] of Object.entries(specs)) {
    if (val && !vRec[k]) vRec[k] = val;
  }

  // Year fallback from raw text
  if (v.year == null) {
    const ym = rawText.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    if (ym) {
      const y = parseInt(ym[1]);
      if (y > 1900 && y <= new Date().getFullYear() + 10) v.year = y;
    }
  }

  // Images from any URLs embedded in the PDF
  const imgUrls = rawText.match(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)/gi) || [];
  v.images = [...new Set(imgUrls)].slice(0, 20).map(src => ({ src, alt: "" }));

  // Description fallback: if the Python pass produced none, take the longest
  // prose-shaped paragraph from the raw text (≥150 chars, reads like English).
  if (!v.description) {
    const paras = rawText.split(/\n{2,}/).map(s => s.trim());
    const candidates = paras.filter(p =>
      p.length > 150 && p.split("\n").length < 12 &&
      /\b(the|and|with|its|for|has|this|that|offers?)\b/i.test(p) &&
      !/^\d+\s+[A-Z]/.test(p)
    );
    if (candidates.length) {
      v.description = candidates.sort((a, b) => b.length - a.length)[0].slice(0, 4000);
    }
  }

  // Features list — bullet-style lines (8–140 chars, contain a lowercase letter,
  // not a pure measurement or a section header). Broker write-ups bullet feature
  // lists with "•", so we also strip a leading bullet glyph when present.
  const featureLines: string[] = [];
  for (const raw of rawText.split("\n")) {
    const t = raw.replace(/^[•·●○◦▪\-\*]\s*/, "").trim();
    if (t.length >= 8 && t.length <= 140 && /[a-z]/.test(t)) {
      if (!/^[\d.\s]+$/.test(t) && !/^(page|fig|table|\d+\s+[A-Z])/i.test(t)) {
        featureLines.push(t);
      }
    }
  }
  v.features = [...new Set(featureLines)].slice(0, 60);

  return v;
}
