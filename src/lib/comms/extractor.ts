/**
 * src/lib/comms/extractor.ts
 * Runs Claude extraction on a stored message.
 * Never invents facts. Always stores raw response + confidence scores.
 * Falls back gracefully if Claude is unavailable.
 */
import { getMessage, getLatestExtraction, updateExtraction, getThread } from "./storage";
import { callAI } from "@/lib/ai-client";

const SYSTEM_PROMPT = `You are a yacht brokerage CRM assistant extracting structured data from broker emails.
Rules:
- Extract ONLY information explicitly stated in the email. Never invent or infer facts not present.
- Assign confidence: 0.9+ = explicitly stated, 0.7-0.9 = strongly implied, 0.5-0.7 = inferred from context, <0.5 = do not include (return null).
- Do not auto-send emails. Do not make commitments. Only extract and draft.
- Return ONLY valid JSON matching the schema exactly. No markdown, no preamble.`;

const SCHEMA_PROMPT = `Return this exact JSON structure:
{
  "contact": {
    "name": "string or null",
    "name_confidence": 0.0,
    "email": "string or null",
    "email_confidence": 0.0,
    "phone": "string or null",
    "phone_confidence": 0.0,
    "company": "string or null",
    "company_confidence": 0.0
  },
  "deal": {
    "intent": "buy|sell|charter|inquire|other|null",
    "intent_confidence": 0.0,
    "yacht_makes": [],
    "yacht_models": [],
    "budget_range": "string or null",
    "budget_confidence": 0.0,
    "timeline": "string or null",
    "timeline_confidence": 0.0,
    "yacht_length_range": "string or null",
    "year_range": "string or null",
    "location_preference": "string or null",
    "features_mentioned": []
  },
  "classification": {
    "lead_category": "hot|warm|cold|broker|vendor|internal",
    "tags": [],
    "summary": "1-3 sentence plain English summary of this email and what action is needed"
  },
  "suggested_tasks": [
    { "text": "string", "due_days": 1, "priority": "high|medium|low" }
  ],
  "draft_reply": {
    "subject": "string",
    "body": "string — professional yacht broker tone, first-person, no AI references, no commitments, human approval required before send"
  }
}`;

export async function runExtraction(messageDbId: number): Promise<void> {
  const msg = getMessage(messageDbId);
  if (!msg) throw new Error(`Message ${messageDbId} not found`);

  const extraction = getLatestExtraction(messageDbId);
  if (!extraction) throw new Error(`No extraction record for message ${messageDbId}`);

  // Build context for Claude
  const thread = getThread(msg.thread_id);
  const emailContext = [
    `From: ${msg.from_name ? `${msg.from_name} <${msg.from_address}>` : msg.from_address}`,
    `To: ${msg.to_addresses.join(", ")}`,
    msg.cc_addresses.length ? `CC: ${msg.cc_addresses.join(", ")}` : "",
    `Subject: ${msg.subject}`,
    `Date: ${msg.sent_at}`,
    thread?.message_count && thread.message_count > 1 ? `[Thread with ${thread.message_count} messages]` : "",
    "",
    msg.body_plain.slice(0, 4000), // cap at 4k chars
  ].filter(Boolean).join("\n");

  const prompt = `${SYSTEM_PROMPT}\n\n${SCHEMA_PROMPT}\n\nEMAIL TO ANALYZE:\n\n${emailContext}`;

  let raw = "";
  try {
    raw = await callAI(prompt, 1200);
  } catch (e) {
    // Claude unavailable — mark extraction as pending, will retry later
    updateExtraction(extraction.id, { status: "pending", raw_extraction: `ERROR: ${String(e)}` });
    return;
  }

  // Parse JSON — strip markdown fences if present
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, "").trim());
  } catch {
    updateExtraction(extraction.id, { raw_extraction: `PARSE_ERROR: ${raw.slice(0, 500)}` });
    return;
  }

  const contact = (parsed.contact as Record<string, unknown>) || {};
  const deal = (parsed.deal as Record<string, unknown>) || {};
  const cls = (parsed.classification as Record<string, unknown>) || {};
  const tasks = (parsed.suggested_tasks as unknown[]) || [];
  const draft = (parsed.draft_reply as Record<string, unknown>) || {};

  updateExtraction(extraction.id, {
    // Contact
    contact_name:         contact.name ?? null,
    contact_name_conf:    contact.name_confidence ?? null,
    contact_email:        contact.email ?? null,
    contact_email_conf:   contact.email_confidence ?? null,
    contact_phone:        contact.phone ?? null,
    contact_phone_conf:   contact.phone_confidence ?? null,
    contact_company:      contact.company ?? null,
    contact_company_conf: contact.company_confidence ?? null,
    // Deal
    intent:              deal.intent ?? null,
    intent_conf:         deal.intent_confidence ?? null,
    yacht_makes:         JSON.stringify(deal.yacht_makes ?? []),
    yacht_models:        JSON.stringify(deal.yacht_models ?? []),
    budget_range:        deal.budget_range ?? null,
    budget_conf:         deal.budget_confidence ?? null,
    timeline:            deal.timeline ?? null,
    timeline_conf:       deal.timeline_confidence ?? null,
    yacht_length_range:  deal.yacht_length_range ?? null,
    year_range:          deal.year_range ?? null,
    location_pref:       deal.location_preference ?? null,
    features_mentioned:  JSON.stringify(deal.features_mentioned ?? []),
    // Classification
    lead_category:  cls.lead_category ?? null,
    tags:           JSON.stringify(cls.tags ?? []),
    summary:        cls.summary ?? null,
    // Tasks + draft
    suggested_tasks: JSON.stringify(tasks),
    draft_reply:     (draft.body as string) ?? null,
    draft_subject:   (draft.subject as string) ?? null,
    // Raw
    raw_extraction: raw,
    status: "pending", // stays pending until broker reviews
  });
}
