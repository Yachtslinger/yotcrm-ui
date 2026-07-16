// Dedicated PDF brochure template — A4 landscape, print-first.
//
// The web brochure (brochure-template.ts) is scroll-driven and interactive:
// sticky nav, tab-switched gallery, hover states, lazy-loaded images. None
// of that translates to paper. Trying to force one HTML template to serve
// both produced a PDF with tabs printed as buttons, empty gallery grids
// where lazy images never fired, and a nav bar on every page.
//
// This template is print-first:
//   • A4 landscape (297mm × 210mm), @page defaults so Puppeteer paginates
//     without invented margins.
//   • Full-bleed cover — hero photo + name + stat rail.
//   • No nav, no tabs. Every image is eagerly loaded so networkidle waits
//     capture the fully-rendered document.
//   • page-break-after per page section so major blocks start on new pages.

import type { VesselData, BrokerInfo } from "@/lib/brochure-storage";
import { formatCapacity } from "@/lib/capacity-utils";

function esc(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function specRow(key: string, val: string | null | undefined): string {
  if (!val) return "";
  return `<div class="pdf-spec-row"><div class="pdf-spec-key">${esc(key)}</div><div class="pdf-spec-val">${esc(val)}</div></div>`;
}

type SpecPage = { title: string; rows: [string, string | null | undefined][] };

export function generatePdfBrochureHTML(vessel: VesselData, brokers: BrokerInfo[]): string {
  const heroImg = vessel.images?.[0]?.src || "";

  const hasCategories = vessel.images.some(i => (i as { category?: string }).category);
  const cat = (i: { category?: string }) => (i as { category?: string }).category;
  const extImages  = hasCategories
    ? vessel.images.filter(i => cat(i) === "exterior" || !cat(i))
    : vessel.images;
  const intImages  = hasCategories ? vessel.images.filter(i => cat(i) === "interior")  : [];
  const techImages = hasCategories ? vessel.images.filter(i => cat(i) === "technical") : [];

  const allPhotos: { src: string; alt: string; group: string }[] = [
    ...extImages.map(i =>  ({ src: i.src, alt: i.alt || "Exterior",  group: "Exterior"  })),
    ...intImages.map(i =>  ({ src: i.src, alt: i.alt || "Interior",  group: "Interior"  })),
    ...techImages.map(i => ({ src: i.src, alt: i.alt || "Technical", group: "Technical" })),
  ].slice(0, 60);

  const gaImages = ((vessel as { gaImages?: { src: string; alt: string }[] }).gaImages) || [];

  const descParas = vessel.description
    ? vessel.description.split("\n\n").filter(p => p.trim()).slice(0, 12)
    : [];

  const featureBullets = (vessel.features || [])
    .map(f => f.trim())
    .filter(f => f.length >= 6 && f.length <= 200)
    .slice(0, 48);
  const featurePages: string[][] = [];
  for (let i = 0; i < featureBullets.length; i += 24) featurePages.push(featureBullets.slice(i, i + 24));

  const v = vessel as unknown as Record<string, string | undefined>;
  const s = (k: string) => v[k] || "";

  const coverStats = [
    vessel.loa          ? { label: "Length Overall", value: vessel.loa } : null,
    vessel.range        ? { label: "Range",          value: vessel.range } : null,
    vessel.guests       ? { label: "Accommodation",  value: `${vessel.guests}${vessel.staterooms ? ` in ${vessel.staterooms} staterooms` : ""}` } : null,
    vessel.maxSpeed     ? { label: "Max Speed",      value: vessel.maxSpeed } : null,
    vessel.grossTonnage ? { label: "Gross Tonnage",  value: vessel.grossTonnage } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const specPages: SpecPage[] = [
    { title: "Identity & Registration", rows: [
      ["Vessel Name",     vessel.name],
      ["Builder",         vessel.builder],
      ["Year / Delivery", vessel.year ? String(vessel.year) : ""],
      ["Location",        vessel.location],
      ["Asking Price",    vessel.price],
      ["Hull Number",     s("hullNumber")],
      ["Flag State",      vessel.flagState],
      ["Class Society",   vessel.classification],
      ["Gross Tonnage",   vessel.grossTonnage],
      ["Refit Details",   s("refitDetails")],
    ] },
    { title: "Dimensions & Construction", rows: [
      ["Length Overall",   vessel.loa],
      ["Length Waterline", vessel.lwl],
      ["Beam",             vessel.beam],
      ["Max Beam",         s("beamMax")],
      ["Draft (Max)",      vessel.draft],
      ["Draft (Min)",      s("draftMin")],
      ["Air Draft",        s("airDraft")],
      ["Displacement",     vessel.displacement],
      ["Number of Decks",  s("deckCount")],
      ["Hull Form",        vessel.hullForm],
      ["Hull Material",    vessel.hullMaterial],
      ["Deck Material",    s("deckMaterial")],
      ["Superstructure",   vessel.superstructure],
      ["Paint System",     s("paintSystem")],
      ["Keel Type",        s("keelType")],
    ] },
    { title: "Design", rows: [
      ["Exterior Design",     vessel.exteriorDesign],
      ["Interior Design",     vessel.interiorDesign],
      ["Naval Architecture",  vessel.navalArchitect],
      ["Interior Style",      s("interiorStyle")],
      ["Colour Scheme",       s("colorScheme")],
    ] },
    { title: "Propulsion & Performance", rows: [
      ["Main Engines",     vessel.engines],
      ["Power Output",     vessel.power],
      ["Engine Hours",     s("engineHours")],
      ["Gearbox",          vessel.gearbox],
      ["Propulsion Type",  vessel.propulsion],
      ["Shaft Count",      s("shaftCount")],
      ["Propellers",       vessel.propellers],
      ["Bow Thruster",     vessel.bowThruster],
      ["Stern Thruster",   vessel.sternThruster],
      ["Stabilisers",      vessel.stabilisers],
      ["Stabiliser Make",  s("stabiliserMake")],
      ["Maximum Speed",    vessel.maxSpeed],
      ["Cruise Speed",     vessel.cruiseSpeed],
      ["Economy Speed",    s("economySpeed")],
      ["Range (Cruise)",   vessel.range],
      ["Range (Economy)",  s("rangeEconomy")],
    ] },
    { title: "Electrical & Systems", rows: [
      ["Generator Sets",         vessel.gensets],
      ["Generator Output (kW)",  s("generatorKW")],
      ["Shore Power",            s("shorepower")],
      ["Voltage System",         s("voltageSystem")],
      ["Air Conditioning",       vessel.airCon],
      ["A/C Make",               s("airConMake")],
      ["Water Maker",            vessel.waterMaker],
      ["Water Maker Capacity",   s("waterMakerCapacity")],
    ] },
    { title: "Tank Capacities", rows: [
      ["Fuel Capacity",     formatCapacity(vessel.fuelTank)],
      ["Fuel Type",         s("fuelType")],
      ["Fresh Water",       formatCapacity(vessel.freshWater)],
      ["Holding Tank",      formatCapacity(vessel.holdingTank)],
      ["Grey Water",        s("greyWater")],
      ["Lube Oil",          vessel.lubeOil],
      ["Sewage Treatment",  s("sewageTreatment")],
    ] },
    { title: "Accommodation", rows: [
      ["Guest Capacity",  vessel.guests],
      ["Staterooms",      vessel.staterooms],
      ["Owner's Cabin",   s("ownersCabin")],
      ["Guest Cabins",    s("guestCabins")],
      ["Crew",            vessel.crew],
      ["Crew Cabins",     vessel.crewCabins],
      ["Crew Mess",       s("crewMess")],
      ["Interior Area",   vessel.livingSpace],
    ] },
    { title: "Amenities & Deck", rows: [
      ["Flybridge",         s("flybridge")],
      ["Beach Club",        s("beachClub")],
      ["Swimming Platform", s("swimmingPlatform")],
      ["Jacuzzi / Hot Tub", s("jacuzzi")],
      ["Gym",               s("gym")],
      ["Cinema / Theatre",  s("cinema")],
      ["Tender / Garage",   vessel.tender],
      ["Tender Count",      s("tenderCount")],
      ["Water Toys",        s("toys")],
      ["Garage Details",    s("garage")],
    ] },
    { title: "Navigation & Communications", rows: [
      ["Navigation",       vessel.navigation],
      ["Radar",            s("radar")],
      ["Chart Plotter",    s("chartPlotter")],
      ["Autopilot",        s("autopilot")],
      ["Satcom / VSAT",    s("satcom")],
      ["AIS",              s("aisSystem")],
      ["Anchoring System", s("anchoring")],
      ["Windlass",         s("windlass")],
    ] },
    { title: "Safety, Condition & Service", rows: [
      ["Fire Suppression",  s("fireSuppression")],
      ["Life Rafts",        s("lifeRafts")],
      ["MOB System",        s("mobSystem")],
      ["Helideck",          s("helideck")],
      ["Last Survey",       s("lastSurvey")],
      ["Last Dry Dock",     s("lastDrydock")],
      ["Last Service",      s("lastService")],
    ] },
  ]
    .map(p => ({ ...p, rows: p.rows.filter(([, val]) => val && String(val).trim()) as [string, string | null | undefined][] }))
    .filter(p => p.rows.length > 0);

  const runningFooter = `${esc(vessel.name)}${vessel.builder ? ` · ${esc(vessel.builder)}` : ""}`;

  return __PDF_HTML__(vessel, brokers, heroImg, coverStats, descParas, featurePages, allPhotos, gaImages, specPages, runningFooter, s);
}

function __PDF_HTML__(
  vessel: VesselData,
  brokers: BrokerInfo[],
  heroImg: string,
  coverStats: { label: string; value: string }[],
  descParas: string[],
  featurePages: string[][],
  allPhotos: { src: string; alt: string; group: string }[],
  gaImages: { src: string; alt: string }[],
  specPages: SpecPage[],
  runningFooter: string,
  s: (k: string) => string,
): string {
  const styles = `
  @page { size: A4 landscape; margin: 0; }
  :root {
    --navy-deep:#050d1a; --navy-mid:#091628; --navy-panel:#0a1b30;
    --gold-warm:#b8933a; --gold-bright:#d4af60; --gold-pale:#e8cc88;
    --cream:#f5efe6; --cream-dim:#ddd5c8; --white:#ffffff; --muted:#7a8fa8;
    --divider:rgba(184,147,58,.25);
    --page-w: 297mm; --page-h: 210mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: var(--navy-deep); color: var(--cream);
    font-family: 'Raleway', sans-serif; font-weight: 300;
    font-size: 11pt; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: var(--page-w); height: var(--page-h);
    padding: 18mm 22mm; position: relative; overflow: hidden;
    page-break-after: always; background: var(--navy-deep);
  }
  .page:last-child { page-break-after: auto; }
  .cover { padding: 0; display: block; }
  .cover-bg { position: absolute; inset: 0; z-index: 0; }
  .cover-bg img { width: 100%; height: 100%; object-fit: cover; filter: brightness(.72); }
  .cover-overlay {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(180deg, rgba(5,13,26,.05) 0%, rgba(5,13,26,.55) 65%, rgba(5,13,26,.92) 100%);
  }
  .cover-inner {
    position: relative; z-index: 2; height: 100%;
    display: grid; grid-template-columns: 1fr auto; align-items: end;
    padding: 22mm 22mm 26mm 22mm; gap: 24mm;
  }
  .cover-title-block { max-width: 165mm; }
  .cover-eyebrow {
    font-family: 'Cinzel', serif; font-size: 10pt; letter-spacing: .28em;
    color: var(--gold-warm); text-transform: uppercase; margin-bottom: 8mm;
  }
  .cover-title {
    font-family: 'Cormorant Garamond', serif; font-size: 84pt;
    font-weight: 300; line-height: .95; color: var(--white);
    margin-bottom: 6mm; letter-spacing: -0.005em;
  }
  .cover-title em { font-style: italic; color: var(--gold-pale); }
  .cover-subtitle { font-size: 13pt; color: var(--cream-dim); letter-spacing: .06em; font-weight: 300; }
  .cover-stats {
    display: flex; flex-direction: column; gap: 6mm;
    background: rgba(5,13,26,.62); padding: 10mm 12mm;
    border-left: 2px solid var(--gold-warm); min-width: 62mm;
  }
  .cover-stat-label {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .22em;
    color: var(--gold-warm); text-transform: uppercase; margin-bottom: 1mm;
  }
  .cover-stat-value {
    font-family: 'Cormorant Garamond', serif; font-size: 22pt;
    font-weight: 300; color: var(--white); line-height: 1.05;
  }
  .page-header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 5mm; margin-bottom: 8mm;
    border-bottom: 1px solid var(--divider);
  }
  .page-eyebrow {
    font-family: 'Cinzel', serif; font-size: 8pt; letter-spacing: .3em;
    color: var(--gold-warm); text-transform: uppercase;
  }
  .page-brand {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .25em;
    color: var(--muted); text-transform: uppercase;
  }
  .page-footer {
    position: absolute; bottom: 8mm; left: 22mm; right: 22mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .22em;
    color: var(--muted); text-transform: uppercase;
    padding-top: 4mm; border-top: 1px solid rgba(184,147,58,.12);
  }
  .page-title {
    font-family: 'Cormorant Garamond', serif; font-size: 34pt;
    font-weight: 300; line-height: 1.05; color: var(--white); margin-bottom: 4mm;
  }
  .page-title em { font-style: italic; color: var(--gold-pale); }
  .gold-rule { width: 18mm; height: 1px; background: var(--gold-warm); margin: 3mm 0 7mm; }
  .overview-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14mm; height: calc(var(--page-h) - 60mm); }
  .overview-prose p { font-size: 10.5pt; line-height: 1.7; color: var(--cream); margin-bottom: 4mm; }
  .overview-image { width: 100%; height: 100%; object-fit: cover; }
  .overview-caption {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .22em;
    color: var(--gold-warm); text-transform: uppercase; margin-top: 3mm;
  }
  .design-credits {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm;
    margin-top: 6mm; padding-top: 5mm; border-top: 1px solid var(--divider);
  }
  .credit-role {
    font-family: 'Cinzel', serif; font-size: 6.5pt; letter-spacing: .22em;
    color: var(--gold-warm); text-transform: uppercase; margin-bottom: 1mm;
  }
  .credit-name {
    font-family: 'Cormorant Garamond', serif; font-size: 13pt;
    color: var(--cream); font-weight: 400;
  }
  .highlights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 10mm; }
  .highlight-item {
    display: flex; gap: 3mm; align-items: flex-start;
    font-size: 9.5pt; line-height: 1.4; color: var(--cream);
    padding: 2mm 0; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .highlight-item::before {
    content: ''; flex-shrink: 0; width: 1.5mm; height: 1.5mm; margin-top: 2mm;
    background: var(--gold-warm); border-radius: 50%;
  }
  .refit-block {
    background: linear-gradient(135deg, rgba(184,147,58,.06), rgba(184,147,58,.02));
    border: 1px solid rgba(184,147,58,.18);
    padding: 8mm 10mm; margin-top: 6mm;
  }
  .refit-row {
    display: grid; grid-template-columns: 40mm 1fr;
    padding: 3mm 0; gap: 6mm;
    border-bottom: 1px solid rgba(184,147,58,.12);
  }
  .refit-row:last-child { border-bottom: none; }
  .refit-key {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .22em;
    color: var(--gold-bright); text-transform: uppercase; line-height: 1.5;
  }
  .refit-val { font-size: 10pt; color: var(--cream); line-height: 1.55; }
  .gallery-grid {
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
    gap: 4mm; height: calc(var(--page-h) - 36mm);
  }
  .gallery-cell { position: relative; overflow: hidden; background: var(--navy-mid); }
  .gallery-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gallery-group-label {
    position: absolute; top: 3mm; left: 3mm;
    background: rgba(5,13,26,.75); padding: 1.5mm 3mm;
    font-family: 'Cinzel', serif; font-size: 6.5pt; letter-spacing: .2em;
    color: var(--gold-warm); text-transform: uppercase;
  }
  .specs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
  .pdf-spec-row {
    display: grid; grid-template-columns: 46mm 1fr;
    padding: 2.5mm 0; gap: 4mm;
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .pdf-spec-key {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .18em;
    color: var(--gold-warm); text-transform: uppercase; line-height: 1.5;
  }
  .pdf-spec-val { font-size: 9.5pt; color: var(--cream); line-height: 1.5; word-break: break-word; }
  .contact-lead { font-size: 12pt; color: var(--cream-dim); max-width: 180mm; margin: 6mm 0 12mm; line-height: 1.7; }
  .brokers-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(80mm, 1fr)); gap: 8mm; }
  .broker-card { background: var(--navy-panel); border: 1px solid var(--divider); padding: 10mm 12mm; }
  .broker-photo {
    width: 22mm; height: 22mm; border-radius: 50%;
    object-fit: cover; border: 1.5px solid var(--gold-warm);
    display: block; margin-bottom: 4mm;
  }
  .broker-name { font-family: 'Cormorant Garamond', serif; font-size: 22pt; font-weight: 400; color: var(--white); margin-bottom: 1mm; }
  .broker-title {
    font-family: 'Cinzel', serif; font-size: 7pt; letter-spacing: .22em;
    color: var(--gold-warm); text-transform: uppercase; margin-bottom: 5mm;
  }
  .broker-row {
    display: grid; grid-template-columns: 30mm 1fr;
    padding: 2mm 0; gap: 4mm;
    border-top: 1px solid rgba(184,147,58,.12); font-size: 9.5pt;
  }
  .broker-key {
    font-family: 'Cinzel', serif; font-size: 6.5pt; letter-spacing: .2em;
    color: var(--gold-warm); text-transform: uppercase; align-self: center;
  }
  .broker-val { color: var(--cream); word-break: break-word; }`;

  return __PDF_BODY__(vessel, brokers, heroImg, coverStats, descParas, featurePages, allPhotos, gaImages, specPages, runningFooter, s, styles);
}

function __PDF_BODY__(
  vessel: VesselData,
  brokers: BrokerInfo[],
  heroImg: string,
  coverStats: { label: string; value: string }[],
  descParas: string[],
  featurePages: string[][],
  allPhotos: { src: string; alt: string; group: string }[],
  gaImages: { src: string; alt: string }[],
  specPages: SpecPage[],
  runningFooter: string,
  s: (k: string) => string,
  styles: string,
): string {
  const coverHtml = `
<section class="page cover">
  ${heroImg ? `<div class="cover-bg"><img src="${esc(heroImg)}" alt="${esc(vessel.name)}" loading="eager"></div>` : ""}
  <div class="cover-overlay"></div>
  <div class="cover-inner">
    <div class="cover-title-block">
      <p class="cover-eyebrow">${esc(vessel.builder || "")}${vessel.year ? ` · ${vessel.year} Delivery` : ""}</p>
      <h1 class="cover-title"><em>${esc(vessel.name)}</em></h1>
      <p class="cover-subtitle">${[vessel.loa, vessel.hullMaterial, vessel.hullForm].filter(Boolean).join(" · ")}</p>
    </div>
    ${coverStats.length ? `
    <div class="cover-stats">
      ${coverStats.map(st => `<div><div class="cover-stat-label">${esc(st.label)}</div><div class="cover-stat-value">${esc(st.value)}</div></div>`).join("")}
    </div>` : ""}
  </div>
</section>`;

  const overviewHtml = descParas.length > 0 ? `
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">Overview</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <h2 class="page-title">${esc(vessel.name)}<br><em>${esc(vessel.builder || "Luxury Motor Yacht")}</em></h2>
  <div class="gold-rule"></div>
  <div class="overview-grid">
    <div class="overview-prose">
      ${descParas.map(p => `<p>${esc(p.trim())}</p>`).join("")}
      ${vessel.exteriorDesign || vessel.interiorDesign || vessel.navalArchitect || vessel.classification ? `
      <div class="design-credits">
        ${vessel.exteriorDesign  ? `<div><div class="credit-role">Exterior Design</div><div class="credit-name">${esc(vessel.exteriorDesign)}</div></div>` : ""}
        ${vessel.interiorDesign  ? `<div><div class="credit-role">Interior Design</div><div class="credit-name">${esc(vessel.interiorDesign)}</div></div>` : ""}
        ${vessel.navalArchitect  ? `<div><div class="credit-role">Naval Architecture</div><div class="credit-name">${esc(vessel.navalArchitect)}</div></div>` : ""}
        ${vessel.classification  ? `<div><div class="credit-role">Classification</div><div class="credit-name">${esc(vessel.classification)}</div></div>` : ""}
      </div>` : ""}
    </div>
    <div>
      ${vessel.images[1] ? `<img class="overview-image" src="${esc(vessel.images[1].src)}" alt="${esc(vessel.name)}" loading="eager">` : ""}
      <div class="overview-caption">${esc(vessel.builder || "")} · ${esc(vessel.location || "Available Worldwide")}</div>
    </div>
  </div>
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>${[vessel.loa, vessel.hullMaterial, vessel.year ? `${vessel.year} Delivery` : ""].filter(Boolean).join(" · ")}</span>
  </div>
</section>` : "";

  const highlightsHtml = featurePages.map((page, pageIdx) => `
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">Highlights${featurePages.length > 1 ? ` · ${pageIdx + 1} of ${featurePages.length}` : ""}</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <h2 class="page-title">Key <em>Features</em></h2>
  <div class="gold-rule"></div>
  <div class="highlights-grid">
    ${page.map(f => `<div class="highlight-item">${esc(f)}</div>`).join("")}
  </div>
  ${pageIdx === featurePages.length - 1 && (s("refitYear") || s("refitDetails") || s("lastService")) ? `
  <div class="refit-block">
    <div class="page-eyebrow" style="margin-bottom: 3mm;">Refit &amp; Recent Service</div>
    ${s("refitYear")    ? `<div class="refit-row"><div class="refit-key">Refit Year</div><div class="refit-val">${esc(s("refitYear"))}</div></div>`       : ""}
    ${s("refitDetails") ? `<div class="refit-row"><div class="refit-key">Refit Details</div><div class="refit-val">${esc(s("refitDetails"))}</div></div>` : ""}
    ${s("lastService")  ? `<div class="refit-row"><div class="refit-key">Last Service</div><div class="refit-val">${esc(s("lastService"))}</div></div>`   : ""}
  </div>` : ""}
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>Highlights</span>
  </div>
</section>`).join("");

  const galleryHtml = (() => {
    const pages: string[] = [];
    let i = 0;
    while (i < allPhotos.length) {
      const chunk = allPhotos.slice(i, i + 4);
      const startGroup = chunk[0].group;
      const isNewGroup = i === 0 || chunk[0].group !== allPhotos[i - 1]?.group;
      pages.push(`
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">Photo Gallery${i > 0 ? ` · continued` : ""}</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <div class="gallery-grid">
    ${chunk.map((p, ci) => `
      <div class="gallery-cell">
        <img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="eager">
        ${ci === 0 && isNewGroup ? `<div class="gallery-group-label">${esc(startGroup)}</div>` : ""}
      </div>`).join("")}
  </div>
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>Gallery</span>
  </div>
</section>`);
      i += 4;
    }
    return pages.join("");
  })();

  const gaHtml = gaImages.map(ga => `
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">Deck Plans &amp; Layout</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <h2 class="page-title">General <em>Arrangements</em></h2>
  <div class="gold-rule"></div>
  <div style="width: 100%; height: calc(var(--page-h) - 78mm); display: flex; align-items: center; justify-content: center; background: var(--navy-mid);">
    <img src="${esc(ga.src)}" alt="${esc(ga.alt || "General Arrangement")}" loading="eager" style="max-width: 100%; max-height: 100%; object-fit: contain;">
  </div>
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>General Arrangement</span>
  </div>
</section>`).join("");

  const specsHtml = specPages.map(sp => `
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">${esc(sp.title)}</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <h2 class="page-title">Full <em>Specifications</em></h2>
  <div class="gold-rule"></div>
  <div class="specs-grid">
    ${sp.rows.map(([k, val]) => specRow(k, val || undefined)).join("")}
  </div>
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>${esc(sp.title)}</span>
  </div>
</section>`).join("");

  const contactHtml = `
<section class="page">
  <div class="page-header">
    <span class="page-eyebrow">Presented By</span>
    <span class="page-brand">${runningFooter}</span>
  </div>
  <h2 class="page-title">Enquire About<br><em>${esc(vessel.name)}</em></h2>
  <div class="gold-rule"></div>
  <p class="contact-lead">Contact our team to discuss specifications, pricing, and to arrange a private showing.</p>
  <div class="brokers-row">
    ${brokers.map(b => `
      <div class="broker-card">
        ${b.photo ? `<img class="broker-photo" src="${esc(b.photo)}" alt="${esc(b.name)}" loading="eager">` : ""}
        <div class="broker-name">${esc(b.name)}</div>
        ${b.title ? `<div class="broker-title">${esc(b.title)}</div>` : ""}
        <div class="broker-row"><span class="broker-key">Email</span><span class="broker-val">${esc(b.email)}</span></div>
        <div class="broker-row"><span class="broker-key">Cell / WhatsApp</span><span class="broker-val">${esc(b.mobile)}</span></div>
        ${b.office    ? `<div class="broker-row"><span class="broker-key">Office</span><span class="broker-val">${esc(b.office)}</span></div>`       : ""}
        ${b.instagram ? `<div class="broker-row"><span class="broker-key">Instagram</span><span class="broker-val">${esc(b.instagram)}</span></div>` : ""}
      </div>`).join("")}
  </div>
  <div class="page-footer">
    <span>${runningFooter}</span>
    <span>${[vessel.loa, vessel.hullMaterial, vessel.year ? `${vessel.year} Delivery` : ""].filter(Boolean).join(" · ")}</span>
  </div>
</section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(vessel.name)} — Brochure</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Cinzel:wght@400;500;600&family=Raleway:wght@300;400;500&display=swap" rel="stylesheet">
<style>${styles}</style>
</head>
<body>
${coverHtml}
${overviewHtml}
${highlightsHtml}
${galleryHtml}
${gaHtml}
${specsHtml}
${contactHtml}
</body>
</html>`;
}
