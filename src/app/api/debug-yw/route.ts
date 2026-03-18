import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  let browser: any = null;
  try {
    browser = await (puppeteer as any).launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    const info = await page.evaluate(() => {
      const rs = (window as any).__REDUX_STATE__;
      if (!rs) return { found: false };

      function getKeys(obj: any, depth: number = 0): any {
        if (depth > 3 || !obj || typeof obj !== "object") return typeof obj;
        if (Array.isArray(obj)) return "Array(" + obj.length + ")";
        const out: any = {};
        for (const k of Object.keys(obj).slice(0, 30)) {
          const v = obj[k];
          out[k] = (depth < 2 && v && typeof v === "object")
            ? getKeys(v, depth + 1)
            : (Array.isArray(v) ? "Array(" + v.length + ")" : typeof v + (v != null && typeof v !== "object" ? "=" + String(v).slice(0, 40) : ""));
        }
        return out;
      }

      return { found: true, keys: getKeys(rs) };
    });

    return NextResponse.json(info);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
