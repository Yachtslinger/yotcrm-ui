import * as cheerio from "cheerio";
import { CampaignDraft } from "../providers/denison";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export async function scrapeYachtWorld(rawUrl: string): Promise<CampaignDraft> {
  const url = rawUrl.trim();
  // Try simple fetch first (faster, no Puppeteer overhead)
  try {
    const html = await fetchSimple(url);
    if (html.length > 5000 && !html.includes("challenge-platform")) {
      return parseYachtWorld(url, html);
    }
  } catch { /* fall through to Puppeteer */ }

  // Fallback to Puppeteer for Cloudflare-protected pages
  const html = await fetchWithPuppeteer(url);
  return parseYachtWorld(url, html);
}

async function fetchSimple(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchWithPuppeteer(url: string): Promise<string> {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: "new" as never,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Hide webdriver flag from Cloudflare detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // @ts-expect-error chrome shim
      window.chrome = { runtime: {} };
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    // Block fonts/stylesheets for speed
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["font", "stylesheet", "image", "media"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait for content to appear (up to 10s)
    await page.waitForSelector("h1, [data-testid]", { timeout: 10000 }).catch(() => {});

    // Small delay to let JS render
    await new Promise((r) => setTimeout(r, 3000));

    return await page.content();
  } finally {
    await browser.close();
  }
}

function parseYachtWorld(url: string, html: string): CampaignDraft {
  const $ = cheerio.load(html);
  const draft: CampaignDraft = { gallery: [], specs: {} };
  draft.listingUrl = url;

  // Try JSON-LD first
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json)
        ? json
        : json["@graph"]
          ? json["@graph"]
          : [json];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();
        if (/product|boat|vehicle|offer/i.test(type) || node.name) {
          draft.headline = draft.headline || node.name;
          draft.description = draft.description || node.description;
          if (node.image) {
            const imgs = Array.isArray(node.image)
              ? node.image
              : [node.image];
            for (const img of imgs) {
              const src = typeof img === "string" ? img : img?.url;
              if (src && /^https?:\/\//i.test(src)) draft.gallery.push(src);
            }
          }
          const offers = node.offers || {};
          if (offers.price || offers.priceCurrency) {
            const p = offers.price;
            const c = offers.priceCurrency;
            if (typeof p === "number") {
              draft.price = `${c === "EUR" ? "€" : "$"}${p.toLocaleString("en-US")}`;
            } else if (typeof p === "string") {
              draft.price = p;
            }
          }
          const addr = offers.availableAtOrFrom?.address || node.address;
          if (addr) {
            const city = addr.addressLocality;
            const region = addr.addressRegion;
            if (city || region)
              draft.location = [city, region].filter(Boolean).join(", ");
          }
        }
      }
    } catch {
      /* skip */
    }
  });

  // DOM fallbacks
  if (!draft.headline) {
    draft.headline =
      clean($("h1").first().text()) ||
      clean($('[data-testid="boat-title"]').text()) ||
      clean($(".listing-title").text());
  }

  if (!draft.price) {
    draft.price =
      clean($('[data-testid="boat-price"]').text()) ||
      clean($(".price").first().text()) ||
      clean($(".listing-price").first().text());
  }

  if (!draft.location) {
    draft.location =
      clean($('[data-testid="boat-location"]').text()) ||
      clean($(".location").first().text());
  }

  if (!draft.description) {
    draft.description =
      clean($('[data-testid="full-description"]').text()) ||
      clean($(".description").first().text()) ||
      clean($("article p").first().text());
    if (draft.description && draft.description.length > 600) {
      draft.description = draft.description
        .slice(0, 600)
        .replace(/\s\S*$/, "…");
    }
  }

  // Specs from detail rows
  const specMap: Record<string, keyof CampaignDraft["specs"]> = {
    length: "loa", loa: "loa", "overall length": "loa",
    beam: "beam",
    draft: "draft",
    year: "year",
    builder: "builder", make: "builder", manufacturer: "builder",
    model: "model",
    stateroom: "staterooms", cabin: "staterooms",
    head: "heads", bathroom: "heads",
    engine: "engines",
    power: "power", horsepower: "power", hp: "power",
  };

  $("dt, th, .detail-label, .spec-label").each((_, el) => {
    const label = clean($(el).text()).toLowerCase();
    const value = clean(
      $(el).next("dd, td, .detail-value, .spec-value").text(),
    );
    if (!value) return;
    for (const [key, field] of Object.entries(specMap)) {
      if (label.includes(key)) {
        draft.specs[field] = draft.specs[field] || value;
        break;
      }
    }
  });

  // Gallery images
  if (!draft.gallery.length) {
    $("img[src]").each((_, img) => {
      const src = $(img).attr("src") || "";
      if (
        /^https?:\/\//i.test(src) &&
        !/icon|logo|flag|avatar|sprite/i.test(src)
      ) {
        const w = Number($(img).attr("width"));
        if (!w || w >= 300) draft.gallery.push(src);
      }
    });
  }

  draft.gallery = Array.from(new Set(draft.gallery));
  draft.heroUrl = draft.gallery[0];
  draft.headline = stripListingSuffix(draft.headline);
  draft.subject = draft.headline;

  return draft;
}

function stripListingSuffix(s?: string): string | undefined {
  if (!s) return s;
  return (
    s
      .replace(
        /\s*[-–|]\s*(Denison|YachtWorld|Yacht\s*World|Boat\s*Trader|boats\.com|YATCO|James\s*Edition).*$/i,
        "",
      )
      .replace(
        /\s*[-–|]\s*(Yacht(s|ing)?\s*(Sales?|for\s*Sale)?).*$/i,
        "",
      )
      .trim() || undefined
  );
}

function clean(s?: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}
