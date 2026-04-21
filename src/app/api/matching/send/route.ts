import { NextRequest, NextResponse } from "next/server";
import { buildMatchEmail, buildMatchEmailText, buildSubjectLine, type MatchEmailTone, type MatchEmailData } from "@/lib/matching/email-templates";
import { sendViaGmail } from "@/lib/email/gmail-sender";
import { logMatchSend, migrateMatchSendLog } from "@/lib/matching/match-send-log";

export const runtime = "nodejs";

const BROKER: Pick<MatchEmailData, "brokerName" | "brokerFull" | "brokerTitle" | "brokerEmail" | "brokerPhone" | "brokerCompany"> = {
  brokerName:    "Will",
  brokerFull:    "Will Noftsinger",
  brokerTitle:   "Build Consultant, The Americas",
  brokerEmail:   "WN@DenisonYachting.com",
  brokerPhone:   "850.461.3342",
  brokerCompany: "Denison Yachting · Ocean King Yachts",
};

const FROM_EMAIL = "WN@DenisonYachting.com";
const FROM_DISPLAY = `Will Noftsinger <${FROM_EMAIL}>`;

export async function POST(req: NextRequest) {
  // Ensure table exists on first use
  try { migrateMatchSendLog(); } catch { /* already exists */ }

  const body = await req.json();

  const {
    leadId,
    clientFirstName,
    clientEmail,
    tone,
    vessel,
    personalNote,
  } = body as {
    leadId:          number;
    clientFirstName: string;
    clientEmail:     string;
    tone:            MatchEmailTone;
    vessel: {
      year:          number | string;
      make:          string;
      model:         string;
      vesselName?:   string;
      loa?:          string;
      price?:        string;
      location?:     string;
      listingUrl?:   string;
      brochureUrl?:  string;
      features?:     string;
      matchReasons?: string[];
      brokerNotes?:  string;
      brokerage?:    string;
      vesselType?:   string;
    };
    personalNote?:   string;
  };

  if (!clientEmail) {
    return NextResponse.json({ error: "clientEmail required" }, { status: 400 });
  }

  const listingUrl = vessel?.listingUrl || "";
  const vesselYear = typeof vessel.year === "number" ? vessel.year : parseInt(String(vessel.year)) || new Date().getFullYear();

  const emailData: MatchEmailData = {
    ...BROKER,
    clientFirstName: clientFirstName || "there",
    personalNote,
    year:        vesselYear,
    make:        vessel.make || "",
    model:       vessel.model || "",
    loa:         vessel.loa,
    price:       vessel.price,
    location:    vessel.location,
    vesselName:   vessel.vesselName,
    listingUrl:   listingUrl || undefined,
    brochureUrl:  vessel.brochureUrl,
    features:     vessel.features,
    matchReasons: vessel.matchReasons,
    brokerNotes:  vessel.brokerNotes,
    brokerage:    vessel.brokerage,
    vesselType:   vessel.vesselType,
  };

  const subject = buildSubjectLine(emailData, tone);
  const html    = buildMatchEmail(emailData, tone);
  const text    = buildMatchEmailText(emailData, tone);

  let messageId = "";
  let threadId  = "";

  try {
    const result = await sendViaGmail(FROM_EMAIL, {
      from:    FROM_DISPLAY,
      to:      clientEmail,
      subject,
      html,
      text,
    });
    messageId = result.messageId;
    threadId  = result.threadId;
  } catch (gmailErr) {
    // Gmail not configured yet — log the send attempt anyway without a thread ID
    // so history still records it. Return a specific message so the UI can guide setup.
    const msg = gmailErr instanceof Error ? gmailErr.message : "Gmail send failed";
    const isNotConfigured = msg.includes("No Gmail tokens") || msg.includes("googleapis");

    try {
      logMatchSend({
        leadId: leadId || 0,
        vesselYear,
        vesselMake:  vessel.make,
        vesselModel: vessel.model,
        vesselLoa:   vessel.loa,
        vesselPrice: vessel.price,
        listingUrl:  listingUrl || "",
        tone,
        fromEmail:   FROM_EMAIL,
        subject,
      });
    } catch { /* log failure is non-fatal */ }

    if (isNotConfigured) {
      return NextResponse.json({
        error: "Gmail not connected. Visit /api/auth/gmail/connect to authorise YotCRM to send as WN@DenisonYachting.com.",
        gmailSetupRequired: true,
      }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Log the successful send
  let logId = 0;
  try {
    logId = logMatchSend({
      leadId: leadId || 0,
      vesselYear,
      vesselMake:     vessel.make,
      vesselModel:    vessel.model,
      vesselLoa:      vessel.loa,
      vesselPrice:    vessel.price,
      listingUrl,
      tone,
      fromEmail:      FROM_EMAIL,
      gmailMessageId: threadId,
      subject,
    });
  } catch { /* log failure is non-fatal */ }

  return NextResponse.json({ success: true, messageId, threadId, logId });
}
