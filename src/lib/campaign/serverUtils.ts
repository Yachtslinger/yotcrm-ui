import { NextResponse } from "next/server";

const REQUEST_LOG = new Map<string, number[]>();
const WINDOW_MS = 60_000;

function clientId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "forwarded";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "local";
}

function isRateLimited(id: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entries = REQUEST_LOG.get(id) ?? [];
  const filtered = entries.filter((ts) => now - ts < windowMs);
  filtered.push(now);
  REQUEST_LOG.set(id, filtered);
  return filtered.length > limit;
}

function authError(req: Request): string | null {
  const serverToken = process.env.CAMPAIGN_API_TOKEN;
  if (!serverToken) return null;
  const clientToken = req.headers.get("x-campaign-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!clientToken) return "Missing API key";
  if (clientToken !== serverToken) return "Unauthorized";
  return null;
}

export function guardRequest(req: Request, limit = 30, windowMs = WINDOW_MS): NextResponse | null {
  const auth = authError(req);
  if (auth) {
    return NextResponse.json({ error: auth }, { status: 401 });
  }
  const id = clientId(req);
  if (isRateLimited(id, limit, windowMs)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}
