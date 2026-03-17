import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@/lib/email/gmail-sender";

export async function GET() {
  try {
    const url = await getGmailAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gmail not configured";
    return NextResponse.json({ error: msg, hint: "Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI to Railway env vars, then run: npm install googleapis" }, { status: 503 });
  }
}
