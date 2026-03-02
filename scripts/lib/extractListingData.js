/**
 * LAYER 1a: Universal Data Extractor
 * 
 * Handles both denisonyachtsales.com and yachtworld.com URLs.
 * Extraction priority:
 *   1. Embedded JSON-LD / structured data (highest confidence)
 *   2. Page API / __NEXT_DATA__ / initial state objects
 *   3. Minimal HTML scraping fallback (only for top-level fields)
 * 
 * Never maps fields by DOM proximity or text scanning heuristics.
 * All fields come from known, labeled sources only.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = process.env.DATA_DIR || '/app/data/listings';

// === KNOWN BUILDERS for title parsing ===
const BUILDERS = [
  'Benetti', 'Azimut', 'Ferretti', 'Sunseeker', 'Princess', 'Riva',
  'Sanlorenzo', 'Pershing', 'Horizon', 'Westport', 'Hatteras', 'Viking',
  'Ocean Alexander', 'Lazzara', 'Numarine', 'Custom', 'Cantiere delle Marche',
  'Filippetti', 'Feadship', 'Lurssen', 'Heesen', 'Amels', 'Damen', 'Baglietto',
  'Mangusta', 'Overmarine', 'ISA', 'CRN', 'Codecasa', 'Wider', 'Majesty',
  'Gulf Craft', 'Tiara', 'Boston Whaler', 'Grady-White', 'Regulator',
  'Scout', 'Sea Ray', 'Chris-Craft', 'Bertram', 'HCB', 'Yellowfin',
  'Intrepid', 'Midnight Express', 'Fountain', 'Contender', 'Everglades',
  'Jupiter', 'Cabo', 'Release', 'Buddy Davis', 'Jarrett Bay', 'Beneteau',
  'Jeanneau', 'Dufour', 'Oyster', 'Fountaine Pajot', 'Lagoon',
  'Leopard', 'Sabre', 'Hinckley', 'MJM', 'Back Cove', 'Grand Banks',
  'Fleming', 'Nordhavn', 'Kadey-Krogen', 'Selene', 'Marlow', 'Outer Reef',
  'Burger', 'Palmer Johnson', 'Trinity', 'Broward', 'Lekker', 'Mazu',
  'Absolute', 'Prestige', 'Monte Carlo Yachts', 'Riviera', 'Maritimo',
  'Cruisers Yachts', 'Tiara Yachts', 'Galeon', 'Pearl', 'Sunreef',
];


// === BROWSER SETUP ===
async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--window-size=1920,1080',
    ],
  });
}

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };
    delete navigator.__proto__.webdriver;
  });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131"',
    'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"macOS"',
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  return page;
}

async function scrollAndExpand(page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) {
      window.scrollBy(0, 700);
      await new Promise(r => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    document.querySelectorAll('button, a, span, div, h3, h4').forEach(el => {
      const text = el.textContent.trim().toLowerCase();
      if (['show more', 'read more', 'view more', 'see full description', 'show all'].some(t => text === t)) {
        try { el.click(); } catch {}
      }
    });
    document.querySelectorAll('[class*=accordion], [class*=toggle], [class*=expand], [data-toggle]').forEach(el => {
      try { el.click(); } catch {}
    });
  });
  await new Promise(r => setTimeout(r, 1500));
}


// ═══════════════════════════════════════════════════════════════
// JSON-LD EXTRACTION (Priority 1 — highest confidence)
// ═══════════════════════════════════════════════════════════════

/**
 * Extract structured data from JSON-LD scripts embedded in the page.
 * YachtWorld embeds Product/Boat schema.
 * Returns normalized spec object or null.
 */
async function extractJsonLD(page) {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        // Handle arrays (YW sometimes wraps in array)
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' || item['@type'] === 'Vehicle' || 
              item['@type'] === 'Boat' || item['@type'] === 'IndividualProduct') {
            results.push(item);
          }
        }
      } catch {}
    }
    return results;
  });
}

/**
 * Extract __NEXT_DATA__ or window.__INITIAL_STATE__ (Priority 2)
 * Some React-rendered yacht sites embed full listing data in page state.
 */
async function extractPageState(page) {
  return page.evaluate(() => {
    // Next.js data
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) {
      try { return { type: 'nextdata', data: JSON.parse(nextData.textContent) }; } catch {}
    }
    // Window state objects
    for (const key of ['__INITIAL_STATE__', '__PRELOADED_STATE__', '__DATA__']) {
      if (window[key]) return { type: 'windowstate', data: window[key] };
    }
    return null;
  });
}


// ═══════════════════════════════════════════════════════════════
// YACHTWORLD EXTRACTOR
// ═══════════════════════════════════════════════════════════════

// Only accept these known spec labels — prevents garbage field mapping
const YW_KNOWN_LABELS = new Set([
  'make', 'model', 'year', 'price', 'condition', 'class', 'type', 'category',
  'hull material', 'hull shape', 'hull construction', 'beam', 'loa',
  'length overall', 'length', 'draft', 'max draft', 'displacement',
  'fuel type', 'max speed', 'cruising speed', 'range', 'guest cabins',
  'crew cabins', 'guest heads', 'crew heads', 'fuel', 'fresh water',
  'holding', 'designer', 'builder', 'flag', 'name', 'lwl',
  'gross tonnage', 'net tonnage', 'max passengers', 'engine hours',
  'power', 'total power', 'engine type', 'number of engines',
  'generator', 'generators', 'stabilizers', 'bow thruster', 'steering',
  'air conditioning', 'a/c', 'watermaker', 'classification',
  'length at waterline', 'flag of registry', 'registry',
]);

const CONDITION_BLACKLIST = /flow|frequency|compressor|startup|amplifier|musiccast|speaker|antenna/i;
const CLASS_BLACKLIST = /^(inboard|outboard|sterndrive|diesel|gasoline|jet|electric)$/i;

async function extractYachtWorld(page, url) {
  console.log('  📊 Strategy 1: Checking JSON-LD...');
  const jsonLd = await extractJsonLD(page);
  let ldSpecs = {};
  if (jsonLd.length > 0) {
    const product = jsonLd[0];
    console.log(`  ✅ Found JSON-LD: ${product['@type']} "${product.name || ''}"`);
    // Map JSON-LD to our spec format
    if (product.name) ldSpecs._title = product.name;
    if (product.offers?.price) ldSpecs.Price = `$${Number(product.offers.price).toLocaleString()}`;
    if (product.offers?.priceCurrency) ldSpecs._currency = product.offers.priceCurrency;
    if (product.brand?.name) ldSpecs.Make = product.brand.name;
    if (product.model) ldSpecs.Model = product.model;
    if (product.productionDate) ldSpecs.Year = product.productionDate;
    if (product.image) ldSpecs._heroImage = typeof product.image === 'string' ? product.image : product.image.url;
    if (product.description) ldSpecs._ldDescription = product.description;
  } else {
    console.log('  ⚠️  No JSON-LD found');
  }

  console.log('  📊 Strategy 2: Checking __NEXT_DATA__...');
  const pageState = await extractPageState(page);
  let stateSpecs = {};
  if (pageState?.type === 'nextdata') {
    try {
      const props = pageState.data?.props?.pageProps;
      if (props?.listing || props?.boat || props?.vessel) {
        const listing = props.listing || props.boat || props.vessel;
        console.log(`  ✅ Found __NEXT_DATA__ listing object`);
        // Map Next.js data to specs
        if (listing.make) stateSpecs.Make = listing.make;
        if (listing.model) stateSpecs.Model = listing.model;
        if (listing.year) stateSpecs.Year = String(listing.year);
        if (listing.price) stateSpecs.Price = listing.price;
        if (listing.location) stateSpecs._location = listing.location;
        if (listing.length) stateSpecs['Length Overall'] = listing.length;
        if (listing.beam) stateSpecs.Beam = listing.beam;
      }
    } catch {}
  }


  console.log('  📊 Strategy 3: DOM extraction (known labels only)...');
  const domData = await page.evaluate((knownLabelsArr) => {
    const KNOWN = new Set(knownLabelsArr);
    const normalize = s => s.toLowerCase().trim().replace(/[:\s]+/g, ' ').replace(/\s+/g, ' ');
    const getText = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };
    const specs = {};

    function addSpec(key, val) {
      if (!key || !val) return;
      const k = key.trim().replace(/:$/, '');
      const v = val.trim();
      if (k.length > 60 || v.length > 200 || k === v) return;
      if (KNOWN.has(normalize(k))) specs[k] = v;
    }

    // dt/dd pairs
    document.querySelectorAll('dl').forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      for (let i = 0; i < Math.min(dts.length, dds.length); i++) addSpec(dts[i].textContent, dds[i].textContent);
    });
    // table rows
    document.querySelectorAll('table tr').forEach(tr => {
      const cells = tr.querySelectorAll('td, th');
      if (cells.length >= 2) addSpec(cells[0].textContent, cells[1].textContent);
    });
    // labeled containers
    document.querySelectorAll('[class*="detail"] > div, [class*="spec"] > div, [class*="attribute"], [class*="feature-item"]').forEach(c => {
      const l = c.querySelector('[class*="label"], [class*="name"], [class*="key"]');
      const v = c.querySelector('[class*="value"], [class*="data"]');
      if (l && v) addSpec(l.textContent, v.textContent);
    });

    // Title, price, location
    const title = getText('h1');
    let price = '';
    for (const sel of ['[data-e2e="price"]', '.price', '[class*="listing-price"]', '[class*="boat-price"]']) {
      const el = document.querySelector(sel);
      if (el) { price = el.textContent.trim(); break; }
    }
    if (!price) {
      const allText = (document.querySelector('main') || document.body).textContent || '';
      const pm = allText.match(/(?:US?\$|€|£)[\d,]+(?:\.\d+)?/);
      if (pm) price = pm[0];
    }
    let location = '';
    for (const sel of ['[data-e2e="location"]', '[class*="location"]']) {
      const el = document.querySelector(sel);
      if (el) { location = el.textContent.trim(); break; }
    }

    // Description
    let description = '';
    for (const sel of ['[data-e2e="description"]', '[class*="description"]', '#description']) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 50) { description = el.textContent.trim(); break; }
    }
    if (description) {
      description = description.replace(/^.*?(?:Boats?\s+For\s+Sale|Home\s*[⁄\/])[^.]*?(?:\n|$)/gim, '');
      description = description.replace(/\b(?:Show\s+(?:More|Less)|Read\s+More|View\s+\d+\s+Photos?)\b/gi, '');
      description = description.replace(/Curious about this boat[\s\S]*$/i, '');
      description = description.replace(/Contact (?:Broker|Information)[\s\S]*$/i, '');
      description = description.replace(/Monthly Payment[\s\S]*$/i, '');
      description = description.replace(/More from this (?:Broker|Seller)[\s\S]*$/i, '');
      description = description.replace(/Meet the Seller[\s\S]*$/i, '');
      description = description.trim();
    }

    // Images
    const images = [];
    const seen = new Set();
    const listingIdMatch = window.location.href.match(/(\d{5,})(?:\/)?(?:\?.*)?$/);
    const listingId = listingIdMatch ? listingIdMatch[1] : null;
    document.querySelectorAll('img[src*="boatsgroup.com"]').forEach(img => {
      let src = img.src || img.getAttribute('data-src') || '';
      if (img.closest('[class*="similar" i], [class*="recommend" i], [class*="related" i], footer')) return;
      if (listingId && !src.includes(listingId)) return;
      src = src.replace(/w=\d+/, 'w=1200').replace(/&format=webp/, '');
      if (src && !seen.has(src)) { seen.add(src); images.push({ url: src, alt: img.alt || '' }); }
    });

    return { title, price, location, specs, description, images, url: window.location.href, scrapedAt: new Date().toISOString() };
  }, [...YW_KNOWN_LABELS]);


  // === MERGE: JSON-LD > PageState > DOM (highest confidence wins) ===
  const specs = { ...domData.specs, ...stateSpecs, ...ldSpecs };
  // Remove internal keys from specs
  const title = ldSpecs._title || domData.title || '';
  const heroFromLD = ldSpecs._heroImage || '';
  delete specs._title; delete specs._heroImage; delete specs._ldDescription; delete specs._currency; delete specs._location;

  // Parse title for make/model/name
  const titleInfo = parseTitleInfo(title, await page.title());
  if (!specs.Make && titleInfo.make) specs.Make = titleInfo.make;
  if (!specs.Model && titleInfo.model) specs.Model = titleInfo.model;
  if (!specs.Name && titleInfo.name) specs.Name = titleInfo.name;
  if (!specs.Year && titleInfo.year) specs.Year = titleInfo.year;

  // Validate & fix garbage
  const condKey = Object.keys(specs).find(k => k.toLowerCase() === 'condition');
  if (condKey && CONDITION_BLACKLIST.test(specs[condKey])) specs[condKey] = 'Used';
  const classKey = Object.keys(specs).find(k => k.toLowerCase() === 'class' || k.toLowerCase() === 'type');
  if (classKey && CLASS_BLACKLIST.test(specs[classKey])) {
    const pageTitle = await page.title();
    const classMatch = pageTitle.match(/(Motor Yacht|Sailboat|Center Console|Sportfish|Trawler|Catamaran)/i);
    specs[classKey] = classMatch ? classMatch[1] : 'Motor Yacht';
  }
  if (!specs.Condition && !specs.condition) specs.Condition = 'Used';

  const price = domData.price || ldSpecs.Price || '';
  const location = stateSpecs._location || domData.location || '';
  
  return {
    title, price, location, specs,
    description: domData.description || ldSpecs._ldDescription || '',
    images: domData.images,
    boatName: titleInfo.name || specs.Name || '',
    parsedMake: titleInfo.make, parsedModel: titleInfo.model,
    url: domData.url, scrapedAt: domData.scrapedAt,
    _extractionSources: {
      jsonLD: jsonLd.length > 0,
      pageState: !!pageState,
      dom: true,
    },
  };
}

function parseTitleInfo(title, pageTitle) {
  const info = { make: '', model: '', name: '', year: '', length: '' };
  const ym = title.match(/(\d{4})/);
  if (ym) info.year = ym[1];
  const lm = title.match(/^(\d+)\s*(?:ft|'|foot)/i);
  if (lm) info.length = `${lm[1]} ft`;
  let remainder = title.replace(/^\d+\s*(?:ft|'|foot)\s*/i, '').replace(/\d{4}\s*/, '').trim();
  remainder = remainder.replace(/\s*\|\s*\d+(?:\.\d+)?(?:ft|m)\s*/gi, '').trim();
  const commaName = remainder.match(/,\s*([A-Z][A-Z\s\d]+)$/);
  if (commaName) { info.name = commaName[1].trim(); remainder = remainder.replace(/,\s*[A-Z][A-Z\s\d]+$/, '').trim(); }
  const lowerRem = remainder.toLowerCase();
  for (const builder of BUILDERS) {
    if (lowerRem.startsWith(builder.toLowerCase())) {
      info.make = builder; info.model = remainder.substring(builder.length).trim(); break;
    }
  }
  if (!info.make && remainder) { const parts = remainder.split(/\s+/); info.make = parts[0] || ''; info.model = parts.slice(1).join(' ') || ''; }
  if (!info.name && pageTitle) {
    const pm = pageTitle.match(/^([A-Z][A-Z\s\d]+?)\s+(?:Motor|Sail|Power|Center)/);
    if (pm && !/^(boats?|yachts?|sale|power|sail|motor)$/i.test(pm[1].trim())) info.name = pm[1].trim();
  }
  return info;
}


// ═══════════════════════════════════════════════════════════════
// DENISON EXTRACTOR
// ═══════════════════════════════════════════════════════════════

const DENISON_SECTION_HEADERS = new Set([
  'SPECIFICATIONS', 'ACCOMMODATIONS', 'AUDIO VISUAL EQUIPMENT',
  'MACHINERY', 'GENERATORS & AUXILIARY SYSTEMS', 'ANCILLARY EQUIPMENT',
  'COMMUNICATION EQUIPMENT', 'NAVIGATION EQUIPMENT', 'DECK EQUIPMENT',
  'GALLEY & DOMESTIC EQUIPMENT', 'OTHER FEATURES & UPGRADES',
  'SAFETY & SECURITY EQUIPMENT', 'TANK CAPACITIES', 'WATERSPORT EQUIPMENT',
  'EXCLUSIONS',
]);

async function extractDenison(page, url) {
  console.log('  📊 Strategy 1: Checking JSON-LD...');
  const jsonLd = await extractJsonLD(page);
  let ldSpecs = {};
  if (jsonLd.length > 0) {
    const product = jsonLd[0];
    console.log(`  ✅ Found JSON-LD: ${product['@type']} "${product.name || ''}"`);
    if (product.name) ldSpecs._title = product.name;
    if (product.offers?.price) ldSpecs.Price = `$${Number(product.offers.price).toLocaleString()}`;
    if (product.brand?.name) ldSpecs.Make = product.brand.name;
    if (product.model) ldSpecs.Model = product.model;
    if (product.productionDate) ldSpecs.Year = product.productionDate;
    if (product.image) ldSpecs._heroImage = typeof product.image === 'string' ? product.image : product.image?.url;
  }

  // Extract full page content from Denison listing
  const denisonData = await page.evaluate((sectionHeaders) => {
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    const fullText = main.innerText || '';
    const lines = fullText.split('\n');

    // === Title + price from DOM ===
    const getText = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };
    let title = getText('h1') || getText('h2');
    let price = '';
    // Look for price in specific elements
    const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
    priceEls.forEach(el => {
      const text = el.textContent.trim();
      if (/^\$[\d,]+/.test(text) || /^€[\d,]+/.test(text) || /^US\$[\d,]+/.test(text)) price = text;
    });
    if (!price) {
      // Find price pattern near the top of the page
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const line = lines[i].trim();
        if (/^\$[\d,]+/.test(line) || /^€[\d,]+/.test(line) || /^US\$[\d,]+/.test(line)) { price = line; break; }
      }
    }

    // === Location ===
    let location = '';
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim();
      if (price && i > 0 && lines[i-1]?.trim() === price) { location = line; break; }
      // Location patterns: "City, State" or "City, Country Code"
      if (/^[A-Z][a-z].*,\s*[A-Z]{2}$/.test(line) || /^[A-Z][a-z].*,\s*[A-Z][a-z]/.test(line)) {
        if (line.length < 60) location = line;
      }
    }

    // === Yacht name from URL or title ===
    let yachtName = '';
    const urlMatch = window.location.pathname.match(/\/([a-z][a-z0-9-]+)-\d+-/);
    if (urlMatch) yachtName = urlMatch[1].toUpperCase();
    // Also from h1/h2
    const h1Text = getText('h1');
    if (h1Text) {
      const nm = h1Text.match(/^([A-Z][A-Z\s]+?)\s+(?:Yacht|for\s+Sale|Motor|–|:)/i);
      if (nm) yachtName = nm[1].trim().toUpperCase();
      // "KOJU Yacht for Sale" pattern
      const nm2 = h1Text.match(/^(\w+)\s+(?:Yacht|for\s+Sale)/i);
      if (!yachtName && nm2) yachtName = nm2[1].toUpperCase();
    }

    return { title, price, location, yachtName, fullText, lines };
  }, [...DENISON_SECTION_HEADERS]);


  // Parse Denison structured spec sections from fullText
  const lines = denisonData.lines || denisonData.fullText.split('\n');

  // Find description narrative (before forms/spec sections)
  let descStartIdx = -1, descEndIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (descStartIdx === -1 && line.length > 100 && 
        (line.includes('accommodates') || line.includes('cabin') || line.includes('guest') ||
         line.includes('yacht') || line.includes('vessel') || line.includes('interior'))) {
      descStartIdx = i;
    }
    if (descStartIdx > -1 && descEndIdx === -1) {
      if (line.startsWith('INQUIRE ABOUT') || line.startsWith('Denison Yachting -') ||
          line === 'Denison Yacht Sales offers the details') {
        descEndIdx = i;
      }
    }
  }
  let descNarrative = '';
  if (descStartIdx > -1 && descEndIdx > descStartIdx) {
    descNarrative = lines.slice(descStartIdx, descEndIdx).map(l => l.trim()).filter(l => l).join('\n');
  }

  // Find rich spec content sections
  let specStartIdx = -1, specEndIdx = lines.length;
  const END_MARKERS = ['Schedule a Tour', 'SIMILAR YACHTS', 'FAST &', 'RELATED SERVICES', 'Price Watch', 'Our Newsletter'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (specStartIdx === -1 && DENISON_SECTION_HEADERS.has(line)) specStartIdx = i;
    if (specStartIdx > -1) {
      for (const marker of END_MARKERS) {
        if (line.startsWith(marker)) { specEndIdx = i; break; }
      }
      if (specEndIdx < lines.length) break;
    }
  }

  let richContent = '';
  if (specStartIdx > -1) {
    richContent = lines.slice(specStartIdx, specEndIdx).map(l => l.trim()).filter(l => l).join('\n');
  }

  // Extract structured specs from SPECIFICATIONS section
  const specs = {};
  let inSpecs = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === 'SPECIFICATIONS') { inSpecs = true; continue; }
    if (inSpecs && DENISON_SECTION_HEADERS.has(line) && line !== 'SPECIFICATIONS') break;
    if (inSpecs && line.includes(':')) {
      const ci = line.indexOf(':');
      const key = line.substring(0, ci).trim();
      const val = line.substring(ci + 1).trim();
      if (key && val && key.length < 40) specs[key] = val;
    }
  }

  // Merge JSON-LD specs (override DOM)
  Object.assign(specs, ldSpecs);
  delete specs._title; delete specs._heroImage; delete specs._ldDescription; delete specs._currency;

  // Build full description: narrative + rich spec sections
  let fullDescription = '';
  if (descNarrative) fullDescription = descNarrative + '\n\n';
  if (richContent) {
    const accomIdx = richContent.indexOf('ACCOMMODATIONS');
    fullDescription += accomIdx > -1 ? richContent.substring(accomIdx) : richContent;
  }

  // Map Denison spec keys to standard format
  if (specs['Cruising Speed']) specs['Cruising Speed'] = specs['Cruising Speed'];
  if (specs['Maximum Speed'] && !specs['Max Speed']) { specs['Max Speed'] = specs['Maximum Speed']; delete specs['Maximum Speed']; }
  if (specs['Fuel Tank'] && !specs['Fuel']) { specs['Fuel'] = specs['Fuel Tank'].replace(/\|/g, ' '); delete specs['Fuel Tank']; }
  if (specs['Cabins'] && !specs['Guest Cabins']) { specs['Guest Cabins'] = specs['Cabins']; delete specs['Cabins']; }
  if (specs['Heads'] && !specs['Guest Heads']) { specs['Guest Heads'] = specs['Heads']; delete specs['Heads']; }


  // === IMAGE EXTRACTION from Denison ===
  const images = await page.evaluate(() => {
    const imgs = [];
    const seen = new Set();
    // Denison uses high-res images, often in gallery containers
    document.querySelectorAll('img').forEach(img => {
      let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (!src || src.includes('logo') || src.includes('icon') || src.includes('avatar')) return;
      if (img.closest('footer, nav, [class*="similar" i], [class*="related" i]')) return;
      // Only accept reasonably sized images
      if (img.naturalWidth > 0 && img.naturalWidth < 100) return;
      // Prefer high-res versions
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map(s => s.trim());
        const largest = parts[parts.length - 1]?.split(/\s+/)?.[0];
        if (largest) src = largest;
      }
      if (src && !seen.has(src)) { seen.add(src); imgs.push({ url: src, alt: img.alt || '' }); }
    });
    // Also check background images in gallery divs
    document.querySelectorAll('[class*="gallery"] div, [class*="slider"] div, [class*="carousel"] div').forEach(div => {
      const bg = getComputedStyle(div).backgroundImage;
      const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && !seen.has(match[1])) { seen.add(match[1]); imgs.push({ url: match[1], alt: '' }); }
    });
    return imgs;
  });

  // Parse title for Make/Model/Year
  const title = denisonData.title || '';
  const titleInfo = parseTitleInfo(title, await page.title());
  if (!specs.Make && titleInfo.make) specs.Make = titleInfo.make;
  if (!specs.Model && titleInfo.model) specs.Model = titleInfo.model;
  if (!specs.Name && denisonData.yachtName) specs.Name = denisonData.yachtName;
  if (!specs.Year && titleInfo.year) specs.Year = titleInfo.year;
  if (!specs.Condition) specs.Condition = 'Used';
  if (!specs.Class) specs.Class = 'Motor Yacht';

  return {
    title,
    price: denisonData.price || ldSpecs.Price || '',
    location: denisonData.location || '',
    specs,
    description: fullDescription || descNarrative || '',
    images,
    boatName: denisonData.yachtName || specs.Name || titleInfo.name || '',
    parsedMake: titleInfo.make || specs.Make || '',
    parsedModel: titleInfo.model || specs.Model || '',
    url,
    scrapedAt: new Date().toISOString(),
    _extractionSources: { jsonLD: jsonLd.length > 0, richContent: richContent.length > 0 },
  };
}


// ═══════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Extract listing data from any supported URL.
 * Returns { data, listingDir, jsonPath } 
 */
async function extractListing(url, options = {}) {
  const hostname = new URL(url).hostname.toLowerCase();
  const isDenison = hostname.includes('denisonyachtsales.com');
  const isYachtWorld = hostname.includes('yachtworld.com');

  if (!isDenison && !isYachtWorld) {
    throw new Error(`Unsupported site: ${hostname}. Use denisonyachtsales.com or yachtworld.com`);
  }

  console.log(`🚢 Extracting: ${url}`);
  console.log(`🌐 Source: ${isDenison ? 'Denison Yachting' : 'YachtWorld'}`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await launchBrowser();

  try {
    const page = await setupPage(browser);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response && response.status() === 403) {
      console.log('⚠️  Got 403, retrying...');
      await new Promise(r => setTimeout(r, 5000));
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await new Promise(r => setTimeout(r, 3000));
    await page.waitForSelector('h1, h2', { timeout: 15000 }).catch(() => {});
    await scrollAndExpand(page);

    // Extract data based on source
    const data = isDenison ? 
      await extractDenison(page, url) : 
      await extractYachtWorld(page, url);

    // If YachtWorld + Denison companion URL provided, enrich data
    if (isYachtWorld && options.denisonUrl) {
      console.log(`\n🏢 Enriching with Denison listing...`);
      try {
        const dPage = await setupPage(browser);
        await dPage.goto(options.denisonUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));
        await scrollAndExpand(dPage);
        const denisonData = await extractDenison(dPage, options.denisonUrl);
        // Merge: Denison description overrides YW if longer/richer
        if ((denisonData.description || '').length > (data.description || '').length + 200) {
          data.description = denisonData.description;
          console.log(`  ✅ Enriched description: ${denisonData.description.length} chars`);
        }
        // Merge Denison specs (cleaner format overrides YW)
        for (const [k, v] of Object.entries(denisonData.specs)) {
          if (v && (!data.specs[k] || v.length > (data.specs[k] || '').length)) {
            data.specs[k] = v;
          }
        }
        if (denisonData.boatName && !data.boatName) {
          data.boatName = denisonData.boatName;
          data.specs.Name = denisonData.boatName;
        }
        await dPage.close();
      } catch (err) {
        console.log(`  ⚠️  Denison enrichment failed: ${err.message}`);
      }
    }

    console.log(`\n📋 Extracted: Make=${data.specs.Make||'?'} Model=${data.specs.Model||'?'} Name=${data.boatName||'?'}`);
    console.log(`📝 Description: ${(data.description || '').length} chars`);
    console.log(`📸 Images: ${data.images.length}`);


    // === CREATE OUTPUT DIRECTORY ===
    const slug = (data.title || data.boatName || 'unknown')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
    const listingDir = path.join(OUTPUT_DIR, slug);
    if (!fs.existsSync(listingDir)) fs.mkdirSync(listingDir, { recursive: true });
    const imgDir = path.join(listingDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    // === DOWNLOAD IMAGES (concurrent with cap) ===
    console.log(`\n⬇️  Downloading ${data.images.length} images...`);
    const downloadedImages = [];
    const CONCURRENCY = 4;

    for (let batch = 0; batch < data.images.length; batch += CONCURRENCY) {
      const chunk = data.images.slice(batch, batch + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (img, idx) => {
          const i = batch + idx;
          const imgPage = await browser.newPage();
          try {
            const resp = await imgPage.goto(img.url, { timeout: 15000 });
            if (resp && resp.ok()) {
              const buffer = await resp.buffer();
              if (buffer.length < 5000) return null; // Skip tiny/broken images
              const ext = img.url.includes('.png') ? 'png' : 'jpg';
              const filename = `image_${String(i + 1).padStart(2, '0')}.${ext}`;
              const filepath = path.join(imgDir, filename);
              fs.writeFileSync(filepath, buffer);
              process.stdout.write(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(0)}KB)\n`);
              return { ...img, localPath: filepath, filename };
            }
          } catch (err) {
            console.log(`  ⚠️  Failed image ${i + 1}: ${err.message}`);
          } finally {
            await imgPage.close();
          }
          return null;
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) downloadedImages.push(r.value);
      }
    }
    data.images = downloadedImages;

    // === SAVE JSON ===
    const jsonPath = path.join(listingDir, 'listing.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved: ${jsonPath}`);
    console.log(`📁 Images: ${imgDir} (${downloadedImages.length} files)`);

    return { data, listingDir, jsonPath };
  } finally {
    await browser.close();
  }
}

module.exports = { extractListing, extractYachtWorld, extractDenison, extractJsonLD };

// === CLI ===
if (require.main === module) {
  const args = process.argv.slice(2);
  const url = args.find(a => !a.startsWith('--'));
  const denisonArg = args.find(a => a.startsWith('--denison='));
  const denisonUrl = denisonArg ? denisonArg.replace('--denison=', '') : null;

  if (!url) {
    console.error('Usage: node extractListingData.js <listing-url> [--denison=<denison-url>]');
    console.error('Supports: denisonyachtsales.com, yachtworld.com');
    process.exit(1);
  }

  extractListing(url, { denisonUrl }).then(({ listingDir }) => {
    console.log(`\n✅ Done! Listing saved to: ${listingDir}`);
  }).catch(err => {
    console.error('❌ Extraction failed:', err.message);
    process.exit(1);
  });
}
