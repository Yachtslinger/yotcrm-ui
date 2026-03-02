import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

const AUTH_SECRET = process.env.YOTCRM_PASSWORD || "yotcrm2026";
const COOKIE_NAME = "yotcrm_session";
const SESSION_DAYS = 30;

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (password !== AUTH_SECRET) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
    // Simple signed token: expires.signature
    const expires = Date.now() + SESSION_DAYS * 86400000;
    const sig = crypto.createHmac("sha256", AUTH_SECRET)
      .update(String(expires)).digest("hex").slice(0, 16);
    const token = `${expires}.${sig}`;

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
