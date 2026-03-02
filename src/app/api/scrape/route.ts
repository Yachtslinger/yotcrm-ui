import { NextResponse } from "next/server";
import { resolveScrapeProvider } from "../../../lib/campaign/providers";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  const target = new URL(req.url).searchParams.get("url");
  return handleScrape(target);
}

export async function POST(req: Request): Promise<NextResponse> {
  const parsedUrl = new URL(req.url);
  let target = parsedUrl.searchParams.get("url");
  if (!target) {
    try {
      const body = (await req.json()) as { url?: string };
      target = body?.url || null;
    } catch {
      target = null;
    }
  }
  return handleScrape(target);
}

async function handleScrape(target: string | null): Promise<NextResponse> {
  if (!target) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }
  try {
    const normalized = normalizeUrl(target);
    const hostname = new URL(normalized).hostname.toLowerCase();
    const provider = resolveScrapeProvider(hostname);
    if (!provider) {
      return NextResponse.json({ ok: false, error: `Unsupported domain: ${hostname}` }, { status: 400 });
    }
    const data = await provider(normalized);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to scrape";
    const status = /unsupported domain|invalid url/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) throw new Error("Invalid url");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
