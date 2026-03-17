// src/app/api/debug/raw-fetch/route.ts
// Plain HTTP GET on any URL — shows exactly what the server returns.
// Usage: GET /api/debug/raw-fetch?url=https://oceanking.it/range/range-ducale/ducale-120/
//
// This mirrors what web_fetch did when building the original Explorer 34M brochure.

import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url param required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract key content
    const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    const h6s = $("h6").map((_, el) => $(el).text().trim()).get().filter(Boolean);

    // All <li> content
    const listItems: { label: string; value: string; raw: string }[] = [];
    $("li").each((_, li) => {
      const $li = $(li);
      const rawHtml = $li.html() || "";
      const labelEl = $li.clone(); labelEl.children().remove();
      const label = labelEl.text().trim();
      const value = $li.children().first().text().trim();
      const raw = $li.text().replace(/\s+/g, " ").trim();
      if (raw.length > 2 && raw.length < 300) {
        listItems.push({ label, value, raw });
      }
    });

    // All image srcs containing /media/
    const mediaImages: string[] = [];
    $("img, a[href]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("href") || "";
      if (/\/media\//i.test(src) && !/seen/.test(src)) mediaImages.push(src);
    });

    return NextResponse.json({
      ok: true,
      status: res.status,
      url,
      htmlLength: html.length,
      htmlSample: html.slice(0, 3000),
      h1,
      h6s: h6s.slice(0, 10),
      listItemCount: listItems.length,
      listItems: listItems.slice(0, 60),
      mediaImages: [...new Set(mediaImages)].slice(0, 60),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
