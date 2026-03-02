/**
 * LAYER 2: Deterministic Denison-Style PDF Renderer v9
 * 
 * Takes normalized listing data and produces HTML that renders
 * identically to the Denison reference PDF structure.
 * 
 * Page 1: Cover — title/price/location, logo, hero, 4 thumbnails,
 *          3-column spec table, broker contact block
 * Page 2+: Description, Key Features, Information & Features
 * Final pages: Image gallery (6 per page, 2 per row)
 */

const fs = require('fs');
const path = require('path');

// === ASSETS ===
const ASSETS = path.join(__dirname, '..', '..', 'assets');
function b64(file) {
  const p = path.join(ASSETS, file);
  if (!fs.existsSync(p)) return '';
  const ext = path.extname(p).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}
function imgB64(filepath) {
  if (!filepath || !fs.existsSync(filepath)) return '';
  const ext = path.extname(filepath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filepath).toString('base64')}`;
}


const LOGOS = { slinger: b64('slinger-logo.png'), denison: b64('denison-logo.jpg') };

const BROKERS = {
  will: {
    name: 'William (Will) Noftsinger III',
    company: 'Denison Yachting',
    address: '1535 SE 17th Street #119, Fort Lauderdale, Florida, United States',
    phone: '+1 (850) 461-3342', fax: '954-763-3940',
    email: 'wn@denisonyachting.com',
    photo: b64('will-photo.jpeg'),
  },
  paolo: {
    name: 'Paolo Ameglio',
    company: 'Denison Yachting',
    address: '1535 SE 17th Street #119, Fort Lauderdale, Florida, United States',
    phone: '+1 (786) 952-6701', fax: '954-763-3940',
    email: 'pa@denisonyachting.com',
    photo: b64('paolo-photo.png'),
  },
};


// === CSS — Denison reference match ===
function getCSS() {
  return `
@page { size: A4; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; font-size: 9pt; line-height: 1.4; }

.page { width: 100%; page-break-after: always; position: relative; }
.page:last-child { page-break-after: avoid; }

/* === COVER PAGE === */
.cover { padding: 0; }
.cover-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3mm; }
.cover-title h1 { font-size: 13.5pt; color: #34495e; font-weight: 400; line-height: 1.2; max-width: 380px; }
.cover-title .price { font-size: 13pt; color: #34495e; font-weight: 700; margin-top: 0.5mm; }
.cover-title .location { font-size: 8.5pt; color: #7a8fa6; margin-top: 0.5mm; }
.logo-box { width: 115px; flex-shrink: 0; text-align: right; }
.logo-box img { width: 115px; height: auto; }

.hero { width: 100%; height: 0; padding-bottom: 56%; overflow: hidden; border-radius: 2px; margin-bottom: 2.5mm; position: relative; }
.hero img { position: absolute; width: 100%; height: 100%; object-fit: cover; display: block; }

.thumb-row { display: flex; gap: 2mm; margin-bottom: 2.5mm; }
.thumb-cell { flex: 1; overflow: hidden; border-radius: 2px; aspect-ratio: 16/9; }
.thumb-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-cell.empty { visibility: hidden; }

`;
}



function getCSS2() {
  return `
/* === BOAT DETAILS TABLE — 3-column grid === */
.details-box { border: 1px solid #d0d5dd; border-radius: 3px; padding: 2.5mm 3mm; margin-bottom: 3mm; }
.details-box h2 { font-size: 10pt; color: #34495e; font-weight: 700; margin-bottom: 1.5mm; }
.details-table { width: 100%; border-collapse: collapse; }
.details-table td { padding: 0.8mm 1.2mm; vertical-align: top; font-size: 7.5pt; }
.details-table .label { color: #7a8fa6; width: 11%; white-space: nowrap; }
.details-table .value { color: #34495e; width: 22%; }
.details-table .value strong { font-weight: 600; }

/* === BROKER CONTACT BLOCK === */
.broker-block { display: flex; align-items: center; gap: 3mm; border-top: 1.5px solid #d0d5dd; padding-top: 2.5mm; }
.broker-cards { display: flex; gap: 4mm; flex: 1; }
.broker-card { display: flex; align-items: center; gap: 2.5mm; }
.two-brokers .broker-card { flex: 1; }
.broker-photo { width: 14mm; height: 14mm; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
.broker-photo img { width: 100%; height: 100%; object-fit: cover; }
.broker-info h3 { font-size: 8pt; color: #34495e; font-weight: 700; line-height: 1.2; }
.broker-info .co { font-weight: 400; color: #666; }
.broker-info p { font-size: 6.5pt; color: #555; margin-top: 0.3mm; line-height: 1.35; }
.broker-info .ph { color: #34495e; font-weight: 600; }

`;
}


function getCSS3() {
  return `
/* === CONTENT PAGES === */
.content-page { padding: 0 4mm; }
.content-header { margin-bottom: 4mm; padding-bottom: 2mm; border-bottom: 2px solid #34495e; margin-top: 2mm; }
.content-header h2 { font-size: 11pt; color: #34495e; font-weight: 400; }

.desc p { font-size: 8pt; line-height: 1.55; color: #333; margin-bottom: 1.5mm; }
.desc h3 { font-size: 9.5pt; color: #34495e; font-weight: 700; margin-top: 5mm; margin-bottom: 2mm; border-bottom: 1px solid #e0e4ea; padding-bottom: 1mm; }
.desc h4 { font-size: 8.5pt; color: #34495e; font-weight: 600; margin-top: 3mm; margin-bottom: 1mm; }
.desc .sub-header { font-size: 8pt; color: #34495e; font-weight: 600; margin-top: 2.5mm; margin-bottom: 0.5mm; }
.desc ul { margin-left: 4mm; margin-bottom: 2mm; }
.desc li { font-size: 7.5pt; line-height: 1.5; color: #333; margin-bottom: 0.5mm; }

.features-box { margin-top: 3mm; }
.features-box h3 { font-size: 9pt; color: #34495e; font-weight: 700; margin-bottom: 1.5mm; }
.features-list { columns: 2; column-gap: 4mm; }
.features-list li { font-size: 7.5pt; line-height: 1.5; color: #333; margin-bottom: 0.5mm; break-inside: avoid; }

.disclaimer { font-size: 5.5pt; color: #aaa; margin-top: 3mm; padding-top: 1.5mm; border-top: 1px solid #e8e8e8; line-height: 1.3; }

/* === SPECS PAGE === */
.engine-grid { display: flex; gap: 3mm; margin-bottom: 3mm; }
.engine-card { flex: 1; background: #f7f9fb; border: 1px solid #e0e4ea; border-radius: 3px; padding: 2.5mm; }
.engine-card h3 { font-size: 8pt; color: #34495e; font-weight: 700; margin-bottom: 1mm; border-bottom: 1px solid #e0e4ea; padding-bottom: 0.8mm; }

.specs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-bottom: 3mm; }
.spec-card { background: #f7f9fb; border: 1px solid #e0e4ea; border-radius: 3px; padding: 2mm; }
.spec-card h3 { font-size: 8pt; color: #34495e; font-weight: 700; margin-bottom: 1mm; border-bottom: 1px solid #e0e4ea; padding-bottom: 0.8mm; }
.spec-table { width: 100%; border-collapse: collapse; }
.spec-table td { padding: 0.6mm 1.2mm; font-size: 7pt; border-bottom: 1px solid #eef0f3; }
.spec-table td:first-child { color: #7a8fa6; width: 48%; }
.spec-table td:last-child { color: #34495e; font-weight: 500; }

`;
}


function getCSS4() {
  return `
/* === GALLERY PAGES === */
.gallery-page { padding: 0; }
.gallery-row { display: flex; gap: 2mm; margin-bottom: 2mm; }
.gallery-cell { flex: 1; overflow: hidden; border-radius: 2px; aspect-ratio: 4/3; }
.gallery-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-cell.empty { visibility: hidden; }

.last-footer { margin-top: 5mm; }
.last-logo { text-align: center; padding: 5mm 0 3mm; }
.last-logo img { width: 140px; height: auto; opacity: 0.8; }
`;
}



// === FORMAT HELPERS ===
function fmtMeasure(val) {
  if (!val) return '';
  const feetInches = val.match(/^(\d+)['\u2032]\s*(\d+)['\u2032"\u2033]+$/);
  if (feetInches) return `${feetInches[1]} ft ${feetInches[2]} in`;
  const decFeet = val.match(/^(\d+)\.(\d+)\s*ft$/i);
  if (decFeet) {
    const feet = parseInt(decFeet[1]);
    const decimal = parseFloat(`0.${decFeet[2]}`);
    const inches = Math.round(decimal * 12);
    return inches > 0 ? `${feet} ft ${inches} in` : `${feet} ft`;
  }
  return val;
}

function fmtPrice(val) {
  if (!val) return '';
  return val.replace(/^US\$/, '$').replace(/^EUR\s*/, '€').replace(/^GBP\s*/, '£');
}

function fmtUnit(val) {
  if (!val) return '';
  return val.replace(/(\d)nm$/i, '$1 nmi').replace(/(\d)kn$/i, '$1 kn');
}

function fmtCapacity(val) {
  if (!val) return '';
  return val.replace(/(\d)(\d{3})\s*gal(?:lon)?/gi, (_, a, b) => `${a},${b} gal`)
            .replace(/gallon/gi, 'gal');
}


// === HELPER FUNCTIONS ===
function row(label, value) {
  if (!value) return '';
  return `<tr><td>${label}</td><td>${value}</td></tr>`;
}

function specCard(title, rows) {
  const filtered = rows.filter(r => r);
  if (filtered.length === 0) return '';
  return `<div class="spec-card"><h3>${title}</h3><table class="spec-table">${filtered.join('')}</table></div>`;
}

function brokerHTML(mode) {
  const brokers = mode === 'both' ? [BROKERS.will, BROKERS.paolo] :
                  mode === 'paolo' ? [BROKERS.paolo] : [BROKERS.will];
  const cards = brokers.map(b => `
    <div class="broker-card">
      <div class="broker-photo">
        ${b.photo ? `<img src="${b.photo}" />` : `<div style="width:100%;height:100%;background:#ccc;border-radius:50%"></div>`}
      </div>
      <div class="broker-info">
        <h3>${b.name} | <span class="co">${b.company}</span></h3>
        <p>${b.address}<br/>Tel: <span class="ph">${b.phone}</span>&nbsp;&nbsp;Fax: ${b.fax}<br/>${b.email}</p>
      </div>
    </div>
  `).join('');
  return `<div class="broker-block">
    <div class="broker-cards ${mode === 'both' ? 'two-brokers' : ''}">${cards}</div>
  </div>`;
}


function formatDescription(text) {
  if (!text || text.length < 50) return '';
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  
  // Only these ALL-CAPS section names become h3 headers
  const SECTION_HEADERS = new Set([
    'ACCOMMODATIONS', 'AUDIO VISUAL EQUIPMENT', 'MACHINERY',
    'GENERATORS & AUXILIARY SYSTEMS', 'ANCILLARY EQUIPMENT',
    'COMMUNICATION EQUIPMENT', 'NAVIGATION EQUIPMENT', 'DECK EQUIPMENT',
    'GALLEY & DOMESTIC EQUIPMENT', 'OTHER FEATURES & UPGRADES',
    'SAFETY & SECURITY EQUIPMENT', 'TANK CAPACITIES', 'WATERSPORT EQUIPMENT',
    'EXCLUSIONS', 'KEY FEATURES',
  ]);

  // Known sub-section headers (mixed case) that should be h3
  const SUB_HEADERS = new Set([
    'Key Features', 'Lower Deck', 'Main Deck', 'Upper Deck', 'Crew',
    'Crew Mess', 'VHF System', 'WI-FI Network', 'Radars', 'Magnetic Compass',
    'Auto Pilot', 'Cartography System', 'GPS', 'AIS', 'Weather Station',
    'Chart Plotter', 'Navtex', 'Safety', 'Fire fighting', 'Emergency Lighting System',
    'Intercom System', 'Security System', 'Main Galley Equipment',
    'Crew Galley / Mess Equipment / Cooking Equipment',
    'Beach Club Pantry Equipment', 'Main Deck Pantry Equipment',
    'Bridge Deck Pantry Equipment', 'Sundeck Pantry Equipment',
    'Centralized Racks', 'TV/Radio', 'Wind/Speed Log',
    'Monitors/Wheelhouse Visualization System', 'Monitors/External Wings Visualization System',
    'Monitors/Wheelhouse Control System', 'Ecosounder-Log',
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }

    // ALL-CAPS section headers
    if (SECTION_HEADERS.has(line) || SECTION_HEADERS.has(line.replace(/\s+/g, ' '))) {
      if (inList) { html += '</ul>'; inList = false; }
      const titleCased = line.split(/\s+/).map(w => {
        if (w.length <= 2 && w !== 'A') return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
      html += `<h3>${titleCased}</h3>`;
      continue;
    }
    // ALL-CAPS lines not in our set — only if multi-word (has spaces), no colons/digits
    if (line === line.toUpperCase() && line.length > 5 && line.length < 50 && /[A-Z]/.test(line) && /\s/.test(line) && !/[:\d]/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      const titleCased = line.split(/\s+/).map(w => {
        if (w.length <= 2 && w !== 'A') return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
      html += `<h3>${titleCased}</h3>`;
      continue;
    }

    // Known sub-section headers — render as subtle bold, not full h3
    if (SUB_HEADERS.has(line) || SUB_HEADERS.has(line.replace(/:$/, ''))) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p class="sub-header">${line.replace(/:$/, '')}</p>`;
      continue;
    }

    // Bullet points
    const bulletMatch = line.match(/^[-•*]\s+(.+)/) || line.match(/^\d+[.)]\s+(.+)/);
    if (bulletMatch) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bulletMatch[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }

    // Everything else is plain text — no bold, no special treatment
    html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}



// === MAIN RENDER FUNCTION ===
function renderHTML(normalized, brokerMode, logoMode) {
  const { identity, pricing, dimensions, propulsion, accommodations, capacities,
          construction, systems, narrative, assets } = normalized;
  
  const selectedLogo = logoMode === 'denison' ? LOGOS.denison : LOGOS.slinger;
  
  // Format values for display
  const price = fmtPrice(pricing.asking_price);
  const loaDisplay = fmtMeasure(dimensions.loa);
  const beamDisplay = fmtMeasure(dimensions.beam);
  const draftDisplay = fmtMeasure(dimensions.draft);
  const lwlDisplay = fmtMeasure(dimensions.lwl);
  const maxSpeedDisplay = fmtUnit(propulsion.max_speed);
  const cruiseSpeedDisplay = fmtUnit(propulsion.cruise_speed);
  const rangeDisplay = fmtUnit(propulsion.range);
  const fuelDisplay = fmtCapacity(capacities.fuel);
  const waterDisplay = fmtCapacity(capacities.water);
  const holdingDisplay = fmtCapacity(capacities.holding);
  
  // Build display title
  const lengthStr = loaDisplay.match(/^(\d+\s*ft)/)?.[1] || '';
  const displayTitle = `${lengthStr} ${identity.year} ${identity.builder} ${identity.model}`.replace(/\s+/g, ' ').trim();
  const fullTitle = identity.vessel_name ? `${displayTitle}, ${identity.vessel_name}` : displayTitle;
  
  // Hero + thumbnails
  const heroB64 = assets.hero_image ? imgB64(assets.hero_image.localPath) : '';
  const thumbs = (assets.thumbnail_images || []).slice(0, 4);
  let thumbCells = thumbs.map(img => 
    `<div class="thumb-cell"><img src="${imgB64(img.localPath)}" /></div>`
  ).join('');
  for (let i = thumbs.length; i < 4; i++) thumbCells += `<div class="thumb-cell empty"></div>`;


  // Engine data
  const eng = propulsion.engines[0] || {};
  let eng1Title = 'Engine (Engine 1)';
  let eng2Title = 'Engine (Engine 2)';
  if (eng.make && eng.model) {
    eng1Title = `${identity.year} ${eng.make} ${eng.model} (Engine 1)`;
    eng2Title = `${identity.year} ${eng.make} ${eng.model} (Engine 2)`;
  } else if (eng.make) {
    eng1Title = `${eng.make} (Engine 1)`;
    eng2Title = `${eng.make} (Engine 2)`;
  }

  // === PAGE 1: COVER ===
  const page1 = `
<div class="page cover">
  <div class="cover-header">
    <div class="cover-title">
      <h1>${fullTitle}</h1>
      <div class="price">${price}</div>
      <div class="location">${pricing.location}</div>
    </div>
    <div class="logo-box">${selectedLogo ? `<img src="${selectedLogo}" />` : ''}</div>
  </div>
  <div class="hero">${heroB64 ? `<img src="${heroB64}" />` : ''}</div>
  <div class="thumb-row">${thumbCells}</div>
  <div class="details-box">
    <h2>Boat Details</h2>
    <table class="details-table">

      <tr>
        <td class="label">Make</td><td class="value"><strong>${identity.builder || ''}</strong></td>
        <td class="label">Model</td><td class="value"><strong>${identity.model || ''}</strong></td>
        <td class="label">Year</td><td class="value"><strong>${identity.year || ''}</strong></td>
      </tr>
      <tr>
        <td class="label">Price</td><td class="value"><strong>${price}</strong></td>
        <td class="label">Condition</td><td class="value"><strong>${construction.condition || ''}</strong></td>
        <td class="label">Class</td><td class="value"><strong>${identity.vessel_type || 'Motor Yacht'}</strong></td>
      </tr>
      <tr>
        <td class="label">Hull Material</td><td class="value"><strong>${construction.hull_material || ''}</strong></td>
        <td class="label">Beam</td><td class="value"><strong>${beamDisplay}</strong></td>
        <td class="label">Name</td><td class="value"><strong>${identity.vessel_name || ''}</strong></td>
      </tr>
      <tr>
        <td class="label">Guest Cabins</td><td class="value"><strong>${accommodations.cabins || ''}</strong></td>
        <td class="label">Guest Heads</td><td class="value"><strong>${accommodations.heads || ''}</strong></td>
        <td class="label">Fuel Type</td><td class="value"><strong>${(propulsion.engines[0] || {}).fuel || 'Diesel'}</strong></td>
      </tr>
      <tr>
        <td class="label">Max Speed</td><td class="value"><strong>${maxSpeedDisplay}</strong></td>
        <td class="label">Max Draft</td><td class="value"><strong>${draftDisplay}</strong></td>
        <td class="label"></td><td class="value"></td>
      </tr>
    </table>
  </div>
  ${brokerHTML(brokerMode)}
</div>`;


  // === PAGE 2+: DESCRIPTION + INFO & FEATURES (inline, matching reference) ===
  const descHTML = formatDescription(narrative.full_description || narrative.description || '');
  
  // Build "Information & Features" section as inline text (reference pages 2-3)
  let infoHTML = '<h3>Information & Features</h3>';
  
  // Engine blocks
  const engData = propulsion.engines[0] || {};
  const engMake = engData.make || 'Engine';
  const engModel = engData.model || '';
  const engLabel = `${identity.year} ${engMake} ${engModel}`.trim();
  infoHTML += `<p class="sub-header">${engLabel} (Engine 1)</p>`;
  if (propulsion.drive_type || engData.type) infoHTML += `<p>Engine Type: ${propulsion.drive_type || engData.type}</p>`;
  infoHTML += `<p>Fuel Type: ${engData.fuel || propulsion.fuel_type || 'Diesel'}</p>`;
  if (propulsion.engine_hours || engData.hours) infoHTML += `<p>Engine Hours: ${propulsion.engine_hours || engData.hours}</p>`;
  if (engData.power || engData.horsepower) infoHTML += `<p>Power: ${engData.power || engData.horsepower}</p>`;
  
  // Twin engines
  const descText = (narrative.full_description || narrative.description || '').toLowerCase();
  const hasTwinEngines = /twin|2\s*x\s*man|2\s*x\s*cat|2\s*x\s*mtu|2\s*x\s*volvo|two .* engines/i.test(descText)
    || propulsion.num_engines >= 2 || propulsion.engines.length >= 2;
  if (hasTwinEngines) {
    infoHTML += `<p class="sub-header">${engLabel} (Engine 2)</p>`;
    if (propulsion.drive_type || engData.type) infoHTML += `<p>Engine Type: ${propulsion.drive_type || engData.type}</p>`;
    infoHTML += `<p>Fuel Type: ${engData.fuel || propulsion.fuel_type || 'Diesel'}</p>`;
    if (propulsion.engine_hours || engData.hours) infoHTML += `<p>Engine Hours: ${propulsion.engine_hours || engData.hours}</p>`;
    if (engData.power || engData.horsepower) infoHTML += `<p>Power: ${engData.power || engData.horsepower}</p>`;
  }
  
  // Dimensions
  if (loaDisplay || lwlDisplay || beamDisplay || draftDisplay) {
    infoHTML += `<p class="sub-header">Dimensions</p>`;
    if (loaDisplay) infoHTML += `<p>LOA: ${loaDisplay}</p>`;
    if (lwlDisplay) infoHTML += `<p>LWL: ${lwlDisplay}</p>`;
    if (beamDisplay) infoHTML += `<p>Beam: ${beamDisplay}</p>`;
    if (draftDisplay) infoHTML += `<p>Max Draft: ${draftDisplay}</p>`;
  }
  // Weights
  if (dimensions.displacement || dimensions.gross_tonnage) {
    infoHTML += `<p class="sub-header">Weights</p>`;
    if (dimensions.displacement) infoHTML += `<p>Displacement: ${dimensions.displacement}</p>`;
  }
  // Speed
  if (cruiseSpeedDisplay || maxSpeedDisplay || rangeDisplay) {
    infoHTML += `<p class="sub-header">Speed</p>`;
    if (cruiseSpeedDisplay) infoHTML += `<p>Cruising Speed: ${cruiseSpeedDisplay}</p>`;
    if (maxSpeedDisplay) infoHTML += `<p>Max Speed: ${maxSpeedDisplay}</p>`;
    if (rangeDisplay) infoHTML += `<p>Range: ${rangeDisplay}</p>`;
  }
  // Tanks
  if (fuelDisplay || waterDisplay) {
    infoHTML += `<p class="sub-header">Tanks</p>`;
    if (fuelDisplay) infoHTML += `<p>Fuel: ${fuelDisplay}</p>`;
    if (waterDisplay) infoHTML += `<p>Fresh Water: ${waterDisplay}</p>`;
  }
  // Accommodations
  if (accommodations.cabins || accommodations.heads) {
    infoHTML += `<p class="sub-header">Accommodations</p>`;
    if (accommodations.cabins) infoHTML += `<p>Guest Cabins: ${accommodations.cabins}</p>`;
    if (accommodations.heads) infoHTML += `<p>Guest Heads: ${accommodations.heads}</p>`;
  }
  // Other
  if (construction.flag) {
    infoHTML += `<p class="sub-header">Other</p>`;
    infoHTML += `<p>Flag Of Registry: ${construction.flag}</p>`;
  }

  // Insert Info & Features between Key Features and ACCOMMODATIONS
  let finalDescHTML = descHTML;
  const accomSplit = descHTML.indexOf('<h3>Accommodations</h3>');
  if (accomSplit > -1) {
    finalDescHTML = descHTML.slice(0, accomSplit) + infoHTML + descHTML.slice(accomSplit);
  } else {
    finalDescHTML = descHTML + infoHTML;
  }

  const page2 = finalDescHTML ? `
<div class="page content-page">
  <div class="content-header"><h2>${fullTitle}</h2></div>
  <div class="desc">
    ${finalDescHTML}
  </div>
  <div class="disclaimer">
    The Company offers the details of this vessel in good faith but cannot guarantee or warrant the accuracy
    of this information nor warrant the condition of the vessel. A buyer should instruct his agents, or his
    surveyors, to investigate such details as the buyer desires validated. This vessel is offered subject to
    prior sale, price change, or withdrawal without notice.
  </div>
</div>` : '';


  // === GALLERY PAGES (6 images per page, 2 per row) ===
  const galleryImages = (assets.gallery_images || []).filter(img => img.localPath && fs.existsSync(img.localPath));
  let galleryPages = '';
  for (let i = 0; i < galleryImages.length; i += 6) {
    const pageImgs = galleryImages.slice(i, i + 6);
    let rowsHTML = '';
    for (let r = 0; r < pageImgs.length; r += 2) {
      const img1 = pageImgs[r];
      const img2 = pageImgs[r + 1];
      const cell1 = `<div class="gallery-cell"><img src="${imgB64(img1.localPath)}" /></div>`;
      const cell2 = img2
        ? `<div class="gallery-cell"><img src="${imgB64(img2.localPath)}" /></div>`
        : `<div class="gallery-cell empty"></div>`;
      rowsHTML += `<div class="gallery-row">${cell1}${cell2}</div>`;
    }
    const isLast = i + 6 >= galleryImages.length;
    const footer = isLast ? `<div class="last-footer"><div class="last-logo">${selectedLogo ? `<img src="${selectedLogo}" />` : ''}</div></div>` : '';
    galleryPages += `
<div class="page gallery-page">
  ${rowsHTML}
  ${footer}
</div>`;
  }


  // === ASSEMBLE FULL HTML ===
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
${getCSS()}
${getCSS2()}
${getCSS3()}
${getCSS4()}
</style></head><body>
${page1}
${page2}
${galleryPages}
</body></html>`;
}


module.exports = { renderHTML };
