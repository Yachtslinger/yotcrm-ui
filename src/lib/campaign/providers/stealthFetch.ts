/**
 * Puppeteer-based page fetcher with Cloudflare stealth bypass.
 * Used by campaign providers that face bot protection (YachtWorld, YATCO, etc).
 */
import puppeteer, { type Browser } from "puppeteer";

const TIMEOUT_MS = 30_000;

/** Launch options that work both locally and in Railway Docker */
function launchArgs() {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--window-size=1920,1080",
  ];
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  return { headless: "new" as const, executablePath, args };
}

/**
 * Fetch a page's HTML using a real Chromium browser with stealth measures.
 * Returns the fully-rendered HTML after JavaScript execution.
 */
export async function stealthFetch(url: string): Promise<string> {
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(launchArgs());
    const page = await browser.newPage();

    // --- Stealth: hide automation signals ---
    await page.evaluateOnNewDocument(() => {
      // Hide webdriver
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // Fake plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      // Fake languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // Chrome runtime stub
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
      // Permissions API patch
      const origQuery = window.navigator.permissions.query.bind(
        window.navigator.permissions
      );
      window.navigator.permissions.query = (params: PermissionDescriptor) =>
        params.name === "notifications"
          ? Promise.resolve({ state: "denied" } as PermissionStatus)
          : origQuery(params);
    });

    // Realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Realistic headers
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });

    // Block fonts/stylesheets for speed (keeps images for gallery detection)
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["font", "stylesheet"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate
    await page.goto(url, { waitUntil: "networkidle2", timeout: TIMEOUT_MS });

    // Wait a beat for any Cloudflare challenge JS to settle
    await new Promise((r) => setTimeout(r, 2000));

    // Accept cookie banners if present
    await page.evaluate(() => {
      document.querySelectorAll("button, a").forEach((el) => {
        const text = (el as HTMLElement).textContent || "";
        if (/accept|agree|got it|ok/i.test(text) && text.length < 30) {
          (el as HTMLElement).click();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 500));

    const html = await page.content();

    // Sanity check — Cloudflare challenge pages are tiny or have specific markers
    if (
      html.length < 5000 &&
      (/challenge-platform|just a moment|checking your browser/i.test(html))
    ) {
      throw new Error(
        "Cloudflare challenge detected — page did not resolve. Try again or use a different IP."
      );
    }

    return html;
  } finally {
    if (browser) await browser.close();
  }
}
