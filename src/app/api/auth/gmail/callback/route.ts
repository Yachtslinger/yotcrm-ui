export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveGmailTokens } from "@/lib/email/gmail-sender";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "No code in callback" }, { status: 400 });
  try {
    const pkg = "googleapis";
  const { google } = await import(/* webpackIgnore: true */ pkg);
    const client = await getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email!;
    saveGmailTokens(email, tokens);
    return NextResponse.json({ success: true, email, message: `YotCRM can now send emails as ${email}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
