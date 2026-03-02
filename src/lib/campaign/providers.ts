import { CampaignData } from "./schema";
import { scrapeDenison, CampaignDraft } from "./providers/denison";
import { scrapeYachtWorld } from "./providers/yachtworld";
import { scrapeYatco } from "./providers/yatco";
import { scrapeGeneric } from "./providers/generic";

type OutboundMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  testMode?: boolean;
};

interface EmailProvider {
  send(message: OutboundMessage): Promise<string>;
}

class MockProvider implements EmailProvider {
  async send(message: OutboundMessage): Promise<string> {
    const id = `mock_${Date.now().toString(36)}`;
    console.info("Mock send", { id, ...message });
    return id;
  }
}

class PostmarkProvider implements EmailProvider {
  constructor(private token: string) {}

  async send(message: OutboundMessage): Promise<string> {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": this.token,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM || "noreply@example.com",
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        MessageStream: message.testMode ? "outbound" : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Postmark send failed (${res.status})`);
    }
    const json = (await res.json()) as { MessageID: string };
    return json.MessageID;
  }
}

class SendGridProvider implements EmailProvider {
  constructor(private apiKey: string) {}

  async send(message: OutboundMessage): Promise<string> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: process.env.SENDGRID_FROM || "noreply@example.com" },
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`SendGrid send failed (${res.status})`);
    }
    const id = res.headers.get("x-message-id") || `sendgrid_${Date.now().toString(36)}`;
    return id;
  }
}

export function resolveProvider(): EmailProvider {
  if (process.env.POSTMARK_SERVER_TOKEN) {
    return new PostmarkProvider(process.env.POSTMARK_SERVER_TOKEN);
  }
  if (process.env.SENDGRID_API_KEY) {
    return new SendGridProvider(process.env.SENDGRID_API_KEY);
  }
  return new MockProvider();
}

export function buildSubject(data: CampaignData): string {
  return data.title || "Denison Yachting";
}

export type ScrapeProvider = (url: string) => Promise<CampaignDraft>;

export const scrapeProviders: Record<string, ScrapeProvider> = {
  "denisonyachtsales.com": scrapeDenison,
  "www.denisonyachtsales.com": scrapeDenison,
  "yachtworld.com": scrapeYachtWorld,
  "www.yachtworld.com": scrapeYachtWorld,
  "boattrader.com": scrapeGeneric,
  "www.boattrader.com": scrapeGeneric,
  "boats.com": scrapeGeneric,
  "www.boats.com": scrapeGeneric,
  "jamesedition.com": scrapeGeneric,
  "www.jamesedition.com": scrapeGeneric,
  "yatco.com": scrapeYatco,
  "www.yatco.com": scrapeYatco,
  "boatinternational.com": scrapeGeneric,
  "www.boatinternational.com": scrapeGeneric,
  "marinemax.com": scrapeGeneric,
  "www.marinemax.com": scrapeGeneric,
};

export function resolveScrapeProvider(hostname: string): ScrapeProvider | null {
  const host = hostname.toLowerCase();
  const exact = scrapeProviders[host] || scrapeProviders[host.replace(/^www\./, "")];
  if (exact) return exact;
  // Fallback: use generic scraper for any URL
  return scrapeGeneric;
}

export type { CampaignDraft };
