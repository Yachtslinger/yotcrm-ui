#!/usr/bin/env node
/**
 * YachtWorld Listing Scraper v3
 * 
 * v3 Improvements:
 * - Smart Make/Model/Name extraction from title + page metadata
 * - Optional Denison URL scraping for rich description content 
 *   (Accommodations, Machinery, AV, Navigation, etc.)
 * - Safeguards against garbage values in specs (A/C → Condition, Engine Type → Class)
 * - Clean description extraction (removes YW page noise)
 * - Better spec field validation
 * 
 * Usage: 
 *   node scrapeYachtWorld.js <yachtworld-url>
 *   node scrapeYachtWorld.js <yachtworld-url> --denison=<denison-url>
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = process.env.DATA_DIR || '/app/data/listings';

// === KNOWN SPEC LABELS (only these are valid for structured spec extraction) ===
const KNOWN_SPEC_LABELS = new Set([
  'make', 'model', 'year', 'price', 'condition', 'class', 'type', 'category',
  'hull material', 'hull shape', 'hull construction', 'beam', 'loa',
  'length overall', 'length', 'draft', 'max draft', 'displacement',
  'fuel type', 'max speed', 'cruising speed', 'range', 'guest cabins',
  'crew cabins', 'guest heads', 'crew heads', 'fuel', 'fresh water',
  'holding', 'designer', 'builder', 'flag', 'name', 'lwl',
  'gross tonnage', 'net tonnage', 'max passengers', 'engine hours',
  'power', 'total power', 'registry', 'flag of registry',
  'engine type', 'number of engines', 'generator', 'generators',
  'stabilizers', 'bow thruster', 'steering', 'air conditioning', 'a/c',
  'watermaker', 'classification', 'length at waterline',
]);

// === VALUES THAT SHOULD NEVER APPEAR IN CERTAIN FIELDS ===
const CONDITION_BLACKLIST = /flow|frequency|compressor|startup|amplifier|musiccast|speaker|antenna/i;
const CLASS_BLACKLIST = /^(inboard|outboard|sterndrive|diesel|gasoline|jet|electric)$/i;
const NAME_BLACKLIST = /^(boats?|yachts?|sale|power|sail|motor)$/i;


// === BROWSER SETUP (shared between YW and Denison) ===
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
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  return page;
}

async function scrollAndExpand(page) {
  // Scroll to trigger lazy content
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 800);
      await new Promise(r => setTimeout(r, 300));
    }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 2000));
  
  // Click expand buttons
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a, span');
    buttons.forEach(btn => {
      const text = btn.textContent.trim().toLowerCase();
      if (['show more', 'read more', 'view more', 'see full description'].includes(text)) {
        btn.click();
      }
    });
  });
  await new Promise(r => setTimeout(r, 1000));
}


// === PARSE MAKE/MODEL/NAME FROM YW TITLE ===
// YW titles follow patterns like:
//   "2022 Benetti Motopanfilo" 
//   "121 ft 2022 Benetti Motopanfilo"
//   "KOJU Motor Yachts Benetti for sale" (page <title>)
function parseTitleInfo(title, pageTitle) {
  const info = { make: '', model: '', name: '', year: '', length: '' };
  
  // Extract year
  const ym = title.match(/(\d{4})/);
  if (ym) info.year = ym[1];
  
  // Extract length (e.g., "121 ft" or "121'")
  const lm = title.match(/^(\d+)\s*(?:ft|'|foot)/i);
  if (lm) info.length = `${lm[1]} ft`;
  
  // Extract make/model from title: "121 ft 2022 Benetti Motopanfilo"
  // Remove length prefix, year, and trailing pipe info to get "Benetti Motopanfilo"  
  let remainder = title.replace(/^\d+\s*(?:ft|'|foot)\s*/i, '').replace(/\d{4}\s*/, '').trim();
  // Remove "| 121ft" style suffixes from YW title
  remainder = remainder.replace(/\s*\|\s*\d+(?:\.\d+)?(?:ft|m)\s*/gi, '').trim();
  // Remove trailing comma + name (e.g., ", KOJU")
  const commaName = remainder.match(/,\s*([A-Z][A-Z\s\d]+)$/);
  if (commaName) {
    info.name = commaName[1].trim();
    remainder = remainder.replace(/,\s*[A-Z][A-Z\s\d]+$/, '').trim();
  }
  
  // Known yacht builders for smart parsing
  const BUILDERS = ['Benetti', 'Azimut', 'Ferretti', 'Sunseeker', 'Princess', 'Riva',
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
    'Burger', 'Palmer Johnson', 'Trinity', 'Broward', 'Lekker', 'Mazu'];
  
  // Check if remainder starts with a known builder
  const lowerRem = remainder.toLowerCase();
  for (const builder of BUILDERS) {
    if (lowerRem.startsWith(builder.toLowerCase())) {
      info.make = builder;
      info.model = remainder.substring(builder.length).trim();
      break;
    }
  }
  // Fallback: split first word as make, rest as model
  if (!info.make && remainder) {
    const parts = remainder.split(/\s+/);
    info.make = parts[0] || '';
    info.model = parts.slice(1).join(' ') || '';
  }
  
  // Try to extract boat name from page title if not found
  // Page title format: "KOJU Motor Yachts Benetti for sale - YachtWorld"
  if (!info.name && pageTitle) {
    const pm = pageTitle.match(/^([A-Z][A-Z\s\d]+?)\s+(?:Motor|Sail|Power|Center)/);
    if (pm && !NAME_BLACKLIST.test(pm[1].trim())) {
      info.name = pm[1].trim();
    }
  }
  
  return info;
}


// === MAIN YW SCRAPER ===
async function scrapeYachtWorld(url, denisonUrl) {
  console.log(`🚢 Scraping YachtWorld: ${url}`);
  if (denisonUrl) console.log(`🏢 Will also scrape Denison: ${denisonUrl}`);
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await launchBrowser();

  try {
    const page = await setupPage(browser);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response && response.status() === 403) {
      console.log('⚠️  Got 403, waiting...');
      await new Promise(r => setTimeout(r, 5000));
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    // Extra wait for dynamic content
    await new Promise(r => setTimeout(r, 3000));
    await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
    await scrollAndExpand(page);

    // Get page title for name extraction
    const pageTitle = await page.title();
    console.log(`📄 Page title: ${pageTitle}`);

    // ═══ MAIN DATA EXTRACTION ═══
    const data = await page.evaluate((knownLabelsArr) => {
      const KNOWN = new Set(knownLabelsArr);
      const getText = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : ''; };

      // --- TITLE ---
      const title = getText('h1');
      
      // --- PRICE ---
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
      
      // --- LOCATION ---
      let location = '';
      for (const sel of ['[data-e2e="location"]', '[class*="location"]']) {
        const el = document.querySelector(sel);
        if (el) { location = el.textContent.trim(); break; }
      }

      // ═══ STRUCTURED SPECS (with validation) ═══
      const specs = {};
      const normalize = s => s.toLowerCase().trim().replace(/[:\s]+/g, ' ').replace(/\s+/g, ' ');
      
      function addSpec(key, val) {
        if (!key || !val) return;
        const k = key.trim().replace(/:$/, '');
        const v = val.trim();
        if (k.length > 60 || v.length > 200 || k === v) return;
        // Only accept known spec labels
        if (KNOWN.has(normalize(k))) {
          specs[k] = v;
        }
      }
      
      // Strategy 1: dt/dd pairs
      document.querySelectorAll('dl').forEach(dl => {
        const dts = dl.querySelectorAll('dt');
        const dds = dl.querySelectorAll('dd');
        for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
          addSpec(dts[i].textContent, dds[i].textContent);
        }
      });
      
      // Strategy 2: table rows
      document.querySelectorAll('table tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (cells.length >= 2) addSpec(cells[0].textContent, cells[1].textContent);
      });
      
      // Strategy 3: labeled containers
      document.querySelectorAll('[class*="detail"] > div, [class*="spec"] > div, [class*="attribute"], [class*="feature-item"]').forEach(c => {
        const l = c.querySelector('[class*="label"], [class*="name"], [class*="key"]');
        const v = c.querySelector('[class*="value"], [class*="data"]');
        if (l && v) addSpec(l.textContent, v.textContent);
      });

      // Strategy 4: "Label: Value" text scanning (only known labels)
      document.querySelectorAll('span, div, p, li, td').forEach(el => {
        const text = el.textContent.trim();
        if (text.length < 4 || text.length > 150) return;
        const ci = text.indexOf(':');
        if (ci > 0 && ci < 40) {
          addSpec(text.substring(0, ci), text.substring(ci + 1));
        }
      });


      // ═══ DESCRIPTION (clean extraction) ═══
      let description = '';
      
      // Primary: find the description container
      for (const sel of ['[data-e2e="description"]', '[class*="description"]', '#description']) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 50) {
          description = el.textContent.trim();
          break;
        }
      }
      
      // Clean description: remove YW page noise
      if (description) {
        // Remove breadcrumb noise at the start
        description = description.replace(/^.*?(?:Boats?\s+For\s+Sale|Home\s*[⁄\/])[^.]*?(?:\n|$)/gim, '');
        // Remove "Show More/Less" buttons text
        description = description.replace(/\b(?:Show\s+(?:More|Less)|Read\s+More|View\s+\d+\s+Photos?)\b/gi, '');
        // Remove "Curious about this boat" and contact sections
        description = description.replace(/Curious about this boat[\s\S]*$/i, '');
        description = description.replace(/Contact (?:Broker|Information)[\s\S]*$/i, '');
        // Remove loan calculator sections
        description = description.replace(/Monthly Payment[\s\S]*$/i, '');
        // Remove "More from this Broker" sections
        description = description.replace(/More from this (?:Broker|Seller)[\s\S]*$/i, '');
        // Remove "Meet the Seller" sections
        description = description.replace(/Meet the Seller[\s\S]*$/i, '');
        // Remove other listing snippets (price patterns after main content)
        description = description.replace(/(?:US?\$[\d,]+\s+\w+,\s+\w+\s*){2,}/g, '');
        description = description.trim();
      }

      // Fallback: try deeper content extraction
      if (!description || description.length < 200) {
        const main = document.querySelector('main') || document.body;
        const sections = main.querySelectorAll('section, article, [class*="content"], [class*="detail"]');
        let best = description || '';
        sections.forEach(s => {
          if (s.closest('nav, footer, header, [class*="similar"], [class*="gallery"]')) return;
          const t = s.innerText || '';
          if (t.length > best.length && t.length > 200 && t.length < 50000) {
            if (t.includes('cabin') || t.includes('engine') || t.includes('yacht') || t.includes('vessel')) {
              best = t.trim();
            }
          }
        });
        if (best.length > (description || '').length) description = best;
      }

      // ═══ IMAGES ═══
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

      // ═══ BROKER INFO ═══
      let broker = {};
      const brokerEl = document.querySelector('[class*="broker"], [class*="dealer"], [class*="seller"]');
      if (brokerEl) {
        broker.name = brokerEl.querySelector('[class*="name"], h3, h4')?.textContent?.trim() || '';
        broker.phone = brokerEl.querySelector('a[href^="tel:"]')?.textContent?.trim() || '';
      }

      return { title, price, location, specs, description, images, broker,
               url: window.location.href, scrapedAt: new Date().toISOString() };
    }, [...KNOWN_SPEC_LABELS]);

    // ═══ POST-PROCESS: Parse title for Make/Model/Name ═══
    const titleInfo = parseTitleInfo(data.title, pageTitle);
    data.boatName = titleInfo.name;
    data.parsedMake = titleInfo.make;
    data.parsedModel = titleInfo.model;
    data.parsedYear = titleInfo.year;
    data.parsedLength = titleInfo.length;
    
    // Inject parsed values into specs if not already present
    const s = data.specs;
    if (!s.Make && !s.make && titleInfo.make) s.Make = titleInfo.make;
    if (!s.Model && !s.model && titleInfo.model) s.Model = titleInfo.model;
    if (!s.Name && !s.name && titleInfo.name) s.Name = titleInfo.name;
    
    // ═══ VALIDATE & FIX GARBAGE SPECS ═══
    // Fix Condition: should be "Used", "New", etc. — not equipment descriptions
    const condKey = Object.keys(s).find(k => k.toLowerCase() === 'condition');
    if (condKey && CONDITION_BLACKLIST.test(s[condKey])) {
      console.log(`⚠️  Fixed garbage Condition: "${s[condKey]}" → "Used"`);
      s[condKey] = 'Used';
    }
    // Fix Class: should be "Motor Yacht", "Sailboat", etc. — not engine type
    const classKey = Object.keys(s).find(k => k.toLowerCase() === 'class' || k.toLowerCase() === 'type');
    if (classKey && CLASS_BLACKLIST.test(s[classKey])) {
      console.log(`⚠️  Fixed garbage Class: "${s[classKey]}" → from breadcrumb or default`);
      // Try to extract from breadcrumbs (e.g., "Motor Yachts" in page title)
      const classMatch = pageTitle.match(/(Motor Yacht|Sailboat|Center Console|Sportfish|Trawler)/i);
      s[classKey] = classMatch ? classMatch[1] : 'Motor Yacht';
    }
    // Fix Fresh Water: shouldn't be a length dimension
    const fwKey = Object.keys(s).find(k => k.toLowerCase().includes('fresh water'));
    if (fwKey && /^\d+\.\d+ft$/i.test(s[fwKey])) {
      console.log(`⚠️  Removed garbage Fresh Water value: "${s[fwKey]}"`);
      delete s[fwKey];
    }
    
    // Set sensible defaults for missing fields
    if (!s.Condition && !s.condition) s.Condition = 'Used';
    if (!s.Class && !s.class && !s.type && !s.Type) {
      // Try to extract from page title
      const classMatch = pageTitle.match(/(Motor Yacht|Sailboat|Center Console|Sportfish|Trawler|Catamaran)/i);
      s.Class = classMatch ? classMatch[1] + 's' : 'Motor Yacht';
      // Normalize "Motor Yachts" → "Motor Yacht"
      s.Class = s.Class.replace(/s$/i, '');
    }

    console.log(`📝 YW Description: ${(data.description || '').length} chars`);
    console.log(`📋 Specs: ${Object.keys(s).length} (Make: ${s.Make||'?'}, Model: ${s.Model||'?'}, Name: ${data.boatName||'?'})`);
    console.log(`📸 Images: ${data.images.length}`);


    // ═══ SCRAPE DENISON LISTING (if URL provided) ═══
    if (denisonUrl) {
      console.log(`\n🏢 Scraping Denison listing...`);
      try {
        const dPage = await setupPage(browser);
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        await dPage.goto(denisonUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await dPage.waitForSelector('h1, h2', { timeout: 15000 }).catch(() => {});
        
        // Thorough scroll to trigger lazy-loaded content (Denison uses accordions)
        await dPage.evaluate(async () => {
          for (let i = 0; i < 20; i++) {
            window.scrollBy(0, 600);
            await new Promise(r => setTimeout(r, 300));
          }
          window.scrollTo(0, 0);
        });
        await new Promise(r => setTimeout(r, 3000));
        
        // Click all expand/accordion buttons
        await dPage.evaluate(() => {
          document.querySelectorAll('button, a, span, div, h3, h4').forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            if (text === 'show more' || text === 'read more' || text === 'view more' || text.includes('show all')) {
              el.click();
            }
          });
          document.querySelectorAll('[class*=accordion], [class*=toggle], [class*=expand], [data-toggle]').forEach(el => el.click());
        });
        await new Promise(r => setTimeout(r, 2000));
        
        const denisonData = await dPage.evaluate(() => {
          // Get full page text
          const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
          const fullText = main.innerText || '';
          const lines = fullText.split('\n');
          
          // === EXTRACT YACHT NAME from page title ===
          let yachtName = '';
          const h1 = document.querySelector('h1');
          if (h1) {
            const nm = h1.textContent.trim().match(/^(\w+)\s+(?:Yacht|for\s+Sale)/i);
            if (nm) yachtName = nm[1].toUpperCase();
          }
          // Also check h2 elements
          if (!yachtName) {
            document.querySelectorAll('h2').forEach(h2 => {
              const nm = h2.textContent.trim().match(/^(\w+)\s+Yacht\b/i);
              if (nm && !yachtName) yachtName = nm[1].toUpperCase();
            });
          }
          
          // === EXTRACT RICH CONTENT by finding section boundaries ===
          // Denison listing pages have ALL CAPS section headers for spec sheet content.
          // We need: Description paragraphs + SPECIFICATIONS through EXCLUSIONS
          
          // Known Denison spec sheet section headers (in order they appear)
          const SECTION_HEADERS = [
            'SPECIFICATIONS', 'ACCOMMODATIONS', 'AUDIO VISUAL EQUIPMENT',
            'MACHINERY', 'GENERATORS & AUXILIARY SYSTEMS', 'ANCILLARY EQUIPMENT',
            'COMMUNICATION EQUIPMENT', 'NAVIGATION EQUIPMENT', 'DECK EQUIPMENT',
            'GALLEY & DOMESTIC EQUIPMENT', 'OTHER FEATURES & UPGRADES',
            'SAFETY & SECURITY EQUIPMENT', 'TANK CAPACITIES', 'WATERSPORT EQUIPMENT',
            'EXCLUSIONS',
          ];
          
          // End markers: content AFTER these lines is footer/related yachts
          const END_MARKERS = [
            'Schedule a Tour', 'SIMILAR YACHTS', 'FAST &', 'RELATED SERVICES',
            'Price Watch', 'Our Newsletter', 'Schedule your tour',
          ];
          
          // Find the main description start — look for the listing description text
          // It appears after "Last updated" and "views" line, before "INQUIRE ABOUT" 
          let descStartIdx = -1;
          let descEndIdx = -1;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // The description typically starts with the yacht name or a sentence about the yacht
            // Look for first substantial paragraph after the page header content
            if (descStartIdx === -1 && line.length > 100 && 
                (line.includes('accommodates') || line.includes('cabin') || line.includes('guest') ||
                 line.includes('yacht') || line.includes('vessel') || line.includes('interior'))) {
              descStartIdx = i;
            }
            // Description narrative ends at "INQUIRE ABOUT" or form section
            if (descStartIdx > -1 && descEndIdx === -1) {
              if (line.startsWith('INQUIRE ABOUT') || line.startsWith('Denison Yachting -') ||
                  line === 'Denison Yacht Sales offers the details') {
                descEndIdx = i;
              }
            }
          }
          
          // Extract the description narrative (before the form/spec sections)
          let descriptionNarrative = '';
          if (descStartIdx > -1 && descEndIdx > descStartIdx) {
            descriptionNarrative = lines.slice(descStartIdx, descEndIdx)
              .map(l => l.trim()).filter(l => l).join('\n');
          }
          
          // Find rich spec content: from first SECTION_HEADER to last SECTION_HEADER's content
          let specStartIdx = -1;
          let specEndIdx = lines.length;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Find first spec section header
            if (specStartIdx === -1 && SECTION_HEADERS.includes(line)) {
              specStartIdx = i;
            }
            // Find end marker
            if (specStartIdx > -1) {
              for (const marker of END_MARKERS) {
                if (line.startsWith(marker)) {
                  specEndIdx = i;
                  break;
                }
              }
              if (specEndIdx < lines.length) break;
            }
          }
          
          let richContent = '';
          if (specStartIdx > -1) {
            richContent = lines.slice(specStartIdx, specEndIdx)
              .map(l => l.trim()).filter(l => l).join('\n');
          }
          
          // === EXTRACT STRUCTURED SPECS from the SPECIFICATIONS section ===
          const denisonSpecs = {};
          let inSpecs = false;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === 'SPECIFICATIONS') { inSpecs = true; continue; }
            if (inSpecs && SECTION_HEADERS.includes(line) && line !== 'SPECIFICATIONS') break;
            if (inSpecs && line.includes(':')) {
              const ci = line.indexOf(':');
              const key = line.substring(0, ci).trim();
              const val = line.substring(ci + 1).trim();
              if (key && val && key.length < 40) {
                denisonSpecs[key] = val;
              }
            }
          }
          
          // Combine: description narrative + rich spec sections  
          let fullContent = '';
          if (descriptionNarrative) {
            fullContent = descriptionNarrative + '\n\n';
          }
          if (richContent) {
            // Skip SPECIFICATIONS section in the rich content since we extract it as structured data
            // Keep everything from ACCOMMODATIONS onward
            const accomIdx = richContent.indexOf('ACCOMMODATIONS');
            if (accomIdx > -1) {
              fullContent += richContent.substring(accomIdx);
            } else {
              fullContent += richContent;
            }
          }
          
          return { fullContent, yachtName, denisonSpecs, richContent: richContent.length };
        });
        
        // Merge Denison data into listing data
        if (denisonData.fullContent && denisonData.fullContent.length > 500) {
          data.denisonDescription = denisonData.fullContent;
          data.description = denisonData.fullContent;
          console.log(`✅ Denison content: ${denisonData.fullContent.length} chars (rich: ${denisonData.richContent} chars)`);
        }
        
        // Merge Denison structured specs (override garbage YW values)
        if (denisonData.denisonSpecs && Object.keys(denisonData.denisonSpecs).length > 0) {
          const ds = denisonData.denisonSpecs;
          console.log(`✅ Denison specs: ${Object.keys(ds).join(', ')}`);
          // Map Denison spec keys to our spec format (Denison values override YW — cleaner format)
          if (ds['Cruising Speed']) s['Cruising Speed'] = ds['Cruising Speed'];
          if (ds['Maximum Speed']) s['Max Speed'] = ds['Maximum Speed'];
          if (ds['Beam']) s['Beam'] = ds['Beam'];
          if (ds['Hull Material']) s['Hull Material'] = ds['Hull Material'];
          if (ds['Max Draft']) s['Max Draft'] = ds['Max Draft'];
          if (ds['Displacement']) s['Displacement'] = ds['Displacement'];
          if (ds['Fuel Tank']) s['Fuel'] = ds['Fuel Tank'].replace(/\|/g, ' ');
          if (ds['Fresh Water']) s['Fresh Water'] = ds['Fresh Water'].replace(/\|/g, ' ');
          if (ds['Cabins']) s['Guest Cabins'] = ds['Cabins'];
          if (ds['Heads']) s['Guest Heads'] = ds['Heads'];
        }
        
        if (denisonData.yachtName) {
          data.boatName = denisonData.yachtName;
          if (!s.Name) s.Name = denisonData.yachtName;
          console.log(`✅ Yacht name from Denison: ${denisonData.yachtName}`);
        }
        
        await dPage.close();
      } catch (err) {
        console.log(`⚠️  Denison scrape failed: ${err.message}`);
      }
    }


    // ═══ CREATE OUTPUT DIRECTORY ═══
    const slug = data.title
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
    
    const listingDir = path.join(OUTPUT_DIR, slug);
    if (!fs.existsSync(listingDir)) fs.mkdirSync(listingDir, { recursive: true });
    const imgDir = path.join(listingDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    
    // ═══ DOWNLOAD IMAGES ═══
    console.log(`\n⬇️  Downloading ${data.images.length} images...`);
    const downloadedImages = [];
    
    for (let i = 0; i < data.images.length; i++) {
      const img = data.images[i];
      try {
        const imgPage = await browser.newPage();
        const response = await imgPage.goto(img.url, { timeout: 15000 });
        if (response && response.ok()) {
          const buffer = await response.buffer();
          const ext = img.url.includes('.png') ? 'png' : 'jpg';
          const filename = `image_${String(i + 1).padStart(2, '0')}.${ext}`;
          const filepath = path.join(imgDir, filename);
          fs.writeFileSync(filepath, buffer);
          downloadedImages.push({ ...img, localPath: filepath, filename });
          process.stdout.write(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(0)}KB)\n`);
        }
        await imgPage.close();
      } catch (err) {
        console.log(`  ⚠️  Failed image ${i + 1}: ${err.message}`);
      }
    }
    
    data.images = downloadedImages;

    // ═══ SAVE JSON ═══
    const jsonPath = path.join(listingDir, 'listing.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved: ${jsonPath}`);
    console.log(`📁 Images: ${imgDir} (${downloadedImages.length} files)`);
    console.log(`\n✅ Done! Make: ${s.Make||'?'} | Model: ${s.Model||'?'} | Name: ${data.boatName||'?'}`);
    
    return { data, listingDir, jsonPath };
    
  } finally {
    await browser.close();
  }
}

// --- CLI ---
const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const denisonArg = args.find(a => a.startsWith('--denison='));
const denisonUrl = denisonArg ? denisonArg.replace('--denison=', '') : null;

if (!url || !url.includes('yachtworld.com')) {
  console.error('Usage: node scrapeYachtWorld.js <yachtworld-url> [--denison=<denison-url>]');
  console.error('');
  console.error('Examples:');
  console.error('  node scrapeYachtWorld.js https://www.yachtworld.com/yacht/2022-benetti-motopanfilo-10060062/');
  console.error('  node scrapeYachtWorld.js https://www.yachtworld.com/yacht/2022-benetti-motopanfilo-10060062/ --denison=https://www.denisonyachtsales.com/yachts-for-sale/koju-121-benetti');
  process.exit(1);
}

scrapeYachtWorld(url, denisonUrl).catch(err => {
  console.error('❌ Scraping failed:', err.message);
  process.exit(1);
});
