#!/usr/bin/env node
/**
 * Denison Yachting — Branded PDF Generator v9
 * 
 * TWO-LAYER ARCHITECTURE:
 *   Layer 1a: extractListingData.js — URL → scraped data (JSON-LD first, DOM fallback)
 *   Layer 1b: normalizeListingData.js — Raw data → normalized schema + confidence scoring
 *   Layer 2:  renderDenisonPDF.js — Normalized data → deterministic HTML → PDF
 * 
 * Usage:
 *   node generateListingPDF.js <listing-dir> [--broker=will|paolo|both] [--logo=slinger|denison]
 *   node generateListingPDF.js --url=<listing-url> [--denison=<denison-url>] [--broker=will|paolo|both] [--logo=slinger|denison]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { normalizeListingData } = require('./lib/normalizeListingData');
const { renderHTML } = require('./lib/renderDenisonPDF');


async function generatePDF(listingDir, brokerMode, logoMode) {
  console.log(`📄 Generating PDF v9 for: ${listingDir}`);
  console.log(`👤 Broker: ${brokerMode} | 🏷️ Logo: ${logoMode}`);
  
  // === LAYER 1: Load + Normalize ===
  const jsonPath = path.join(listingDir, 'listing.json');
  if (!fs.existsSync(jsonPath)) throw new Error(`No listing.json in ${listingDir}`);
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  console.log(`📊 Raw specs: ${Object.keys(rawData.specs || {}).length} fields`);
  console.log(`📸 Raw images: ${(rawData.images || []).length}`);
  
  const normalized = normalizeListingData(rawData);
  
  const { identity, confidence, validation_errors } = normalized;
  console.log(`\n✅ Normalized: ${identity.builder} ${identity.model} ${identity.year} "${identity.vessel_name}"`);
  console.log(`💰 Price: ${normalized.pricing.asking_price} | Location: ${normalized.pricing.location}`);
  console.log(`📐 LOA: ${normalized.dimensions.loa} | Beam: ${normalized.dimensions.beam} | Draft: ${normalized.dimensions.draft}`);
  console.log(`🏎️ Speed: ${normalized.propulsion.max_speed} cruise: ${normalized.propulsion.cruise_speed} range: ${normalized.propulsion.range}`);
  console.log(`🛏️ Cabins: ${normalized.accommodations.cabins} | Heads: ${normalized.accommodations.heads}`);
  console.log(`📸 Hero: ${normalized.assets.hero_image ? '✓' : '✗'} | Gallery: ${normalized.assets.gallery_images.length} | Thumbs: ${normalized.assets.thumbnail_images.length}`);
  
  const highConf = Object.entries(confidence).filter(([,v]) => v >= 0.7).map(([k]) => k);
  const lowConf = Object.entries(confidence).filter(([,v]) => v > 0 && v < 0.7).map(([k]) => k);
  const missing = Object.entries(confidence).filter(([,v]) => v === 0).map(([k]) => k);
  console.log(`\n🎯 High confidence: ${highConf.join(', ')}`);
  if (lowConf.length) console.log(`⚠️  Low confidence: ${lowConf.join(', ')}`);
  if (missing.length) console.log(`❌ Missing: ${missing.join(', ')}`);
  if (validation_errors.length) console.log(`⚠️  Warnings: ${validation_errors.join('; ')}`);
  
  fs.writeFileSync(path.join(listingDir, 'listing-normalized.json'), JSON.stringify(normalized, null, 2));
  
  // === LAYER 2: Render HTML ===
  const html = renderHTML(normalized, brokerMode, logoMode);
  fs.writeFileSync(path.join(listingDir, 'listing.html'), html);
  console.log(`\n📝 HTML template saved`);
  
  // === GENERATE PDF via headless Chromium ===
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    
    const suffix = brokerMode !== 'will' ? `-${brokerMode}` : '';
    const pdfName = path.basename(listingDir) + suffix + '.pdf';
    const pdfPath = path.join(listingDir, pdfName);
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:right;padding-right:15mm;font-size:7pt;color:#7a8fa6;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;"><span class="pageNumber"></span></div>',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
    
    const sz = fs.statSync(pdfPath).size;
    console.log(`\n✅ PDF Generated: ${pdfPath}`);
    console.log(`📊 Size: ${(sz / 1024 / 1024).toFixed(1)} MB`);
    return pdfPath;
  } finally {
    await browser.close();
  }
}


/**
 * Full pipeline: URL → Extract → Normalize → Render → PDF
 */
async function generateFromURL(url, options = {}) {
  const { broker = 'will', logo = 'slinger', denisonUrl } = options;
  
  // Dynamic import of extractor
  const { extractListing } = require('./lib/extractListingData');
  
  console.log(`🌐 Full pipeline: ${url}`);
  const { listingDir } = await extractListing(url, { denisonUrl });
  const pdfPath = await generatePDF(listingDir, broker, logo);
  return pdfPath;
}

// === CLI ===
const args = process.argv.slice(2);
const urlArg = args.find(a => a.startsWith('--url='));
const listingDir = args.find(a => !a.startsWith('--'));
const brokerArg = args.find(a => a.startsWith('--broker='));
const brokerMode = brokerArg ? brokerArg.split('=')[1] : 'will';
const logoArg = args.find(a => a.startsWith('--logo='));
const logoMode = logoArg ? logoArg.split('=')[1] : 'slinger';
const denisonArg = args.find(a => a.startsWith('--denison='));
const denisonUrl = denisonArg ? denisonArg.split('=')[1] : null;

if (!listingDir && !urlArg) {
  console.log('Usage:');
  console.log('  node generateListingPDF.js <listing-dir> [--broker=will|paolo|both] [--logo=slinger|denison]');
  console.log('  node generateListingPDF.js --url=<listing-url> [--denison=<url>] [--broker=will|paolo|both] [--logo=slinger|denison]');
  process.exit(1);
}
if (!['will', 'paolo', 'both'].includes(brokerMode)) {
  console.error('Invalid broker. Use: will, paolo, or both');
  process.exit(1);
}
if (!['slinger', 'denison'].includes(logoMode)) {
  console.error('Invalid logo. Use: slinger or denison');
  process.exit(1);
}

if (urlArg) {
  const url = urlArg.split('=').slice(1).join('=');
  generateFromURL(url, { broker: brokerMode, logo: logoMode, denisonUrl }).catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
} else {
  generatePDF(path.resolve(listingDir), brokerMode, logoMode).catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { generatePDF, generateFromURL };
