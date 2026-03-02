#!/usr/bin/env node
/**
 * YATCO Listing Scraper
 * Usage: node scrapeYatco.js <yatco-url>
 * 
 * Extracts: title, price, location, specs, description, images
 * Outputs: JSON file in DATA_DIR (default: /app/data/listings/)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = process.env.DATA_DIR || '/app/data/listings';

async function scrapeYatco(url) {
  console.log(`🚢 Scraping YATCO: ${url}`);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    
    // Hide webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    
    // Block fonts/stylesheets for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['font', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Accept cookies if prompted
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a');
      btns.forEach(b => {
        if (b.textContent && (b.textContent.includes('Accept') || b.textContent.includes('ACCEPT'))) {
          b.click();
        }
      });
    });
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Extract data — YATCO-specific selectors
    const data = await page.evaluate(() => {
      // --- TITLE (h1 works) ---
      const h1 = document.querySelector('h1');
      const title = h1 ? h1.textContent.trim() : '';

      // --- BOAT NAME (first word of title before year) ---
      let boatName = '';
      const nameMatch = title.match(/^([A-Za-z][A-Za-z\s]+?)\s+\d{4}/);
      if (nameMatch) boatName = nameMatch[1].trim();

      // --- LOCATION: text node right after h1 ---
      let location = '';
      if (h1) {
        let sibling = h1.nextElementSibling || h1.parentElement;
        // Walk siblings/children looking for a short location string
        const candidates = h1.parentElement ? h1.parentElement.querySelectorAll('*') : [];
        for (const el of candidates) {
          const t = el.textContent.trim();
          if (t.match(/,\s*(United States|USA|Italy|France|Spain|UK|Netherlands|Greece|Turkey|Monaco|Croatia)/i) && t.length < 100) {
            location = t;
            break;
          }
        }
      }

      // --- PRICE: look for "ASKING PRICE" or "$X,XXX,XXX" near top ---
      let price = '';
      const bodyText = document.body.textContent;
      const priceMatch = bodyText.match(/ASKING\s+PRICE\s*\n?\s*\$[\d,]+(?:\.\d+)?\s*(?:USD)?/i);
      if (priceMatch) {
        const m = priceMatch[0].match(/\$[\d,]+(?:\.\d+)?/);
        if (m) price = m[0];
      }
      if (!price) {
        // Fallback: find currency near top of page
        const topText = bodyText.substring(0, 3000);
        const m2 = topText.match(/\$[\d,]{5,}/);
        if (m2) price = m2[0];
      }

      // --- MLS # ---
      let mlsNumber = '';
      const mlsMatch = bodyText.match(/MLS\s*#?\s*(\d+)/i);
      if (mlsMatch) mlsNumber = mlsMatch[1];

      // --- SPECS: YATCO uses dt/dd pairs outside the nav ---
      const specs = {};
      // Only look at dt/dd that are NOT inside nav/header
      document.querySelectorAll('dt').forEach(dt => {
        // Skip if inside nav
        if (dt.closest('nav, header, [class*="menu"]')) return;
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const key = dt.textContent.trim().replace(/:$/, '');
          const val = dd.textContent.trim();
          if (key && val && key !== val && key.length < 60 && val.length < 200) {
            // Skip junk values
            if (!/^(Search|Count|Close|Open)$/i.test(val)) {
              specs[key] = val;
            }
          }
        }
      });

      // --- DESCRIPTION: the main text block, skip nav junk ---
      let description = '';
      document.querySelectorAll('p, div').forEach(el => {
        if (description) return;
        if (el.closest('nav, header, footer, [class*="menu"], [class*="cookie"], [class*="breadcrumb"], [class*="share"]')) return;
        const text = el.textContent.trim();
        // Must be real description text — not nav/breadcrumbs/CSS
        if (text.length > 150 && text.length < 5000
          && !text.includes('Charter Destinations')
          && !text.includes('Cookie')
          && !text.includes('Call Broker')
          && !text.includes('Email Broker')
          && !text.includes('ASKING PRICE')
          && !text.includes('Share on Facebook')
          && !text.includes('Yacht Search')
          && !text.includes('share-buttons')
          && !text.includes('text-decoration')
          && !/^\s*(Home|For Sale|For Charter)/.test(text)) {
          description = text;
        }
      });

      // --- SPECS: also try regex patterns on body text ---
      const specPatterns = {
        'Length': /(?:Length|LOA)[:\s]+(\d+[''′][\s\d"″()\s.m]*)/i,
        'Beam': /Beam[:\s]+(\d+[''′]?\s*[\d"″()\s.m]*)/i,
        'Draft': /Draft[:\s]+(\d+[''′]?\s*[\d"″()\s.m]*)/i,
        'Year': /Year[:\s]+(\d{4})/i,
        'Builder': /(?:Builder|Make|Manufacturer)[:\s]+([A-Z][A-Za-z\s&]+?)(?:\s*$|\s*\n)/im,
        'Cabins': /Cabins?[:\s]+(\d+)/i,
        'Heads': /Heads?[:\s]+(\d+)/i,
        'Fuel Type': /Fuel\s*Type[:\s]+(\w+)/i,
        'Gross Tonnage': /Gross\s*Tonnage[:\s]+([\d.]+)/i,
        'Engines': /Engine\s*Count[:\s]+(\d+)/i,
      };
      // Only search the main content area, not nav
      const mainContent = (document.querySelector('main') || document.querySelector('[class*="content"]') || document.body).textContent;
      for (const [key, regex] of Object.entries(specPatterns)) {
        if (!specs[key]) {
          const m = mainContent.match(regex);
          if (m) specs[key] = m[1].trim();
        }
      }

      // --- IMAGES: YATCO hosts on cloud.yatco.com, use large_ versions ---
      const images = [];
      const seen = new Set();
      // Get large images from gallery links
      document.querySelectorAll('a[href*="cloud.yatco.com"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.includes('/large_') && !seen.has(href)) {
          seen.add(href);
          images.push({ url: href, alt: '' });
        }
      });
      // Fallback: img tags with cloud.yatco.com src
      if (!images.length) {
        document.querySelectorAll('img[src*="cloud.yatco.com"]').forEach(img => {
          let src = img.src || '';
          src = src.replace('/small_', '/large_');
          if (!seen.has(src)) {
            seen.add(src);
            images.push({ url: src, alt: img.alt || '' });
          }
        });
      }

      // --- BROKER INFO ---
      let broker = {};
      const phoneEl = document.querySelector('a[href^="tel:"]');
      if (phoneEl) broker.phone = phoneEl.textContent.trim();
      const mailEl = document.querySelector('a[href^="mailto:"]');
      if (mailEl) broker.email = mailEl.textContent.trim();

      return {
        title,
        boatName,
        price,
        location,
        mlsNumber,
        specs,
        description,
        images,
        broker,
        source: 'yatco',
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
      };
    });

    console.log(`📸 Found ${data.images.length} images`);
    
    // Create listing directory
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
    
    const listingDir = path.join(OUTPUT_DIR, slug);
    if (!fs.existsSync(listingDir)) {
      fs.mkdirSync(listingDir, { recursive: true });
    }
    
    // Download images
    const imgDir = path.join(listingDir, 'images');
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }
    
    console.log(`⬇️  Downloading images to ${imgDir}`);
    const downloadedImages = [];
    
    for (let i = 0; i < Math.min(data.images.length, 30); i++) {
      const img = data.images[i];
      try {
        const imgPage = await browser.newPage();
        const response = await imgPage.goto(img.url, { timeout: 15000 });
        if (response && response.ok()) {
          const buffer = await response.buffer();
          if (buffer.length > 5000) { // Skip tiny images
            const ext = img.url.includes('.png') ? 'png' : 'jpg';
            const filename = `image_${String(i + 1).padStart(2, '0')}.${ext}`;
            const filepath = path.join(imgDir, filename);
            fs.writeFileSync(filepath, buffer);
            downloadedImages.push({ ...img, localPath: filepath, filename });
            process.stdout.write(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(0)}KB)\n`);
          }
        }
        await imgPage.close();
      } catch (err) {
        console.log(`  ⚠️  Failed image ${i + 1}: ${err.message}`);
      }
    }
    
    data.images = downloadedImages;
    
    // Save JSON
    const jsonPath = path.join(listingDir, 'listing.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved to: ${jsonPath}`);
    console.log(`✅ Done! ${downloadedImages.length} images downloaded.`);
    
    return { data, listingDir, jsonPath };
    
  } finally {
    await browser.close();
  }
}

// --- MAIN ---
const url = process.argv[2];
if (!url || !url.includes('yatco.com')) {
  console.error('Usage: node scrapeYatco.js <yatco-url>');
  console.error('Example: node scrapeYatco.js https://www.yatco.com/yacht/78-74-arcadia-yachts-motor-yacht-2023-441434/');
  process.exit(1);
}

scrapeYatco(url).catch(err => {
  console.error('❌ Scraping failed:', err.message);
  process.exit(1);
});
