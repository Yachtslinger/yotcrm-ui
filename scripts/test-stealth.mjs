/**
 * Quick smoke test for puppeteer-extra + stealth plugin.
 * Run: node scripts/test-stealth.mjs
 * Tests YachtWorld scrape and prints key fields.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const TEST_URL = "https://www.yachtworld.com/yacht/2003-inace-pilothouse-yacht-9454947/";

console.log("🧪 Testing stealth fetch against YachtWorld...");
console.log("   URL:", TEST_URL);

let browser;
try {
  browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  console.log("⏳ Navigating (up to 45s)...");
  await page.goto(TEST_URL, { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));

  const html = await page.content();
  const hasRedux = html.includes("__REDUX_STATE__");
  const hasCF = /challenge-platform|just a moment|checking your browser/i.test(html);

  console.log(`\n📄 HTML length: ${html.length.toLocaleString()} bytes`);
  console.log(`🔑 Has __REDUX_STATE__: ${hasRedux}`);
  console.log(`🛡️  Cloudflare blocked: ${hasCF}`);

  if (hasRedux) {
    // Quick parse of name/price
    const nameMatch = html.match(/"boatName"\s*:\s*"([^"]+)"/);
    const priceMatch = html.match(/"USD"\s*:\s*(\d+)/);
    const loaMatch = html.match(/"nominal"[^}]*?"ft"\s*:\s*([\d.]+)/);
    const imgCount = (html.match(/"originalImageUrl"/g) || []).length;

    console.log("\n✅ SCRAPE SUCCESSFUL");
    console.log("   name:", nameMatch?.[1] || "—");
    console.log("   price: $" + (priceMatch ? Number(priceMatch[1]).toLocaleString() : "—"));
    console.log("   loa:", loaMatch?.[1] ? loaMatch[1] + " ft" : "—");
    console.log("   images:", imgCount);
  } else if (hasCF) {
    console.log("\n❌ STILL BLOCKED by Cloudflare — stealth plugin insufficient for Railway IP");
    console.log("   Next step: consider residential proxy or scraping API");
  } else {
    console.log("\n⚠️  Page loaded but no Redux state — listing may have moved or DOM changed");
  }
} catch (err) {
  console.error("\n❌ Error:", err.message);
} finally {
  if (browser) await browser.close();
  process.exit(0);
}
