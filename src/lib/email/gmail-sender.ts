/**
 * gmail-sender.ts — src/lib/email/gmail-sender.ts
 *
 * Sends emails via Gmail OAuth2 as WN@DenisonYachting.com.
 * Uses dynamic import for googleapis so the app builds without it installed.
 *
 * Setup (one-time):
 *   1. npm install googleapis   (add to package.json manually)
 *   2. Create OAuth app at console.cloud.google.com → Gmail API → OAuth 2.0 Client ID
 *   3. Add to Railway env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI
 *   4. Visit /api/auth/gmail/connect once while logged into Denison Google account
 */

import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// ── Token storage ─────────────────────────────────────────────────────────────

function migrateGmailTokens() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      email         TEXT PRIMARY KEY,
      access_token  TEXT,
      refresh_token TEXT NOT NULL,
      expiry_date   INTEGER
    )
  `);
  db.close();
}

export function saveGmailTokens(email: string, tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  migrateGmailTokens();
  const db = new Database(DB_PATH);
  db.prepare(`
    INSERT INTO gmail_tokens (email, access_token, refresh_token, expiry_date)
    VALUES (@email, @accessToken, @refreshToken, @expiryDate)
    ON CONFLICT(email) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date  = excluded.expiry_date
  `).run({
    email,
    accessToken:  tokens.access_token  ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate:   tokens.expiry_date   ?? null,
  });
  db.close();
}

export function loadGmailTokens(email: string) {
  migrateGmailTokens();
  const db = new Database(DB_PATH);
  const row = db.prepare(
    "SELECT access_token, refresh_token, expiry_date FROM gmail_tokens WHERE email = ?"
  ).get(email) as { access_token: string; refresh_token: string; expiry_date: number } | undefined;
  db.close();
  return row ?? null;
}

// ── OAuth helpers (dynamic import — requires googleapis installed) ─────────────

export async function getOAuthClient() {
  const pkg = "googleapis";
  const { google } = await import(/* webpackIgnore: true */ pkg).catch(() => {
    throw new Error("googleapis not installed. Run: npm install googleapis then redeploy.");
  });
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID!,
    process.env.GMAIL_CLIENT_SECRET!,
    process.env.GMAIL_REDIRECT_URI!
  );
}

export async function getGmailAuthUrl(): Promise<string> {
  const client = await getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt:      "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
}

// ── Send email ────────────────────────────────────────────────────────────────

export interface GmailSendOptions {
  from:     string;
  to:       string;
  subject:  string;
  html:     string;
  text:     string;
  replyTo?: string;
}

export interface GmailSendResult {
  messageId: string;
  threadId:  string;
}

export async function sendViaGmail(
  fromEmail: string,
  opts: GmailSendOptions
): Promise<GmailSendResult> {
  const tokens = loadGmailTokens(fromEmail);
  if (!tokens) {
    throw new Error(`No Gmail tokens for ${fromEmail}. Visit /api/auth/gmail/connect first.`);
  }

  const pkg = "googleapis";
  const { google } = await import(/* webpackIgnore: true */ pkg).catch(() => {
    throw new Error("googleapis not installed. Run: npm install googleapis then redeploy.");
  });

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID!,
    process.env.GMAIL_CLIENT_SECRET!,
    process.env.GMAIL_REDIRECT_URI!
  );
  auth.setCredentials({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   tokens.expiry_date,
  });
  auth.on("tokens", (newTokens: Record<string, unknown>) => {
    saveGmailTokens(fromEmail, newTokens as Parameters<typeof saveGmailTokens>[1]);
  });

  const gmail = google.gmail({ version: "v1", auth });

  const boundary = `boundary_${Date.now()}`;
  const raw = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : "",
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    opts.html,
    ``,
    `--${boundary}--`,
  ].filter(l => l !== null).join("\r\n");

  const encoded = Buffer.from(raw).toString("base64url");
  const res = await gmail.users.messages.send({
    userId:      "me",
    requestBody: { raw: encoded },
  });

  return {
    messageId: res.data.id!,
    threadId:  res.data.threadId!,
  };
}

export async function checkForReply(
  fromEmail: string,
  threadId:  string
): Promise<{ replied: boolean; replySnippet?: string }> {
  const tokens = loadGmailTokens(fromEmail);
  if (!tokens) return { replied: false };

  const pkg2 = "googleapis";
  const { google } = await import(/* webpackIgnore: true */ pkg2).catch(() => {
    throw new Error("googleapis not installed");
  });

  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID!,
    process.env.GMAIL_CLIENT_SECRET!,
    process.env.GMAIL_REDIRECT_URI!
  );
  auth.setCredentials({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   tokens.expiry_date,
  });

  const gmail = google.gmail({ version: "v1", auth });
  const thread = await gmail.users.threads.get({
    userId: "me", id: threadId, format: "metadata",
    metadataHeaders: ["From", "Subject"],
  });
  const messages = thread.data.messages ?? [];
  if (messages.length > 1) {
    return { replied: true, replySnippet: messages[messages.length - 1].snippet ?? undefined };
  }
  return { replied: false };
}
