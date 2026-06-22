/**
 * ai-client.ts
 * Anthropic (Claude Opus) is PRIMARY.
 * YotBot One (bore.pub:7777) is FALLBACK if Anthropic fails or has no credits.
 */

import { capReached, recordSpend, monthSpendUSD, MONTHLY_CAP_USD } from "./ai-spend";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Model routing: cheap by default; opt into the premium model with { tier:"smart" }.
// Both overridable by env so model strings can be updated without code changes.
const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-opus-4-7";
const MODEL_CHEAP = process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5";

const RAW_OLLAMA_URL = process.env.OLLAMA_URL || "";
const OLLAMA_URL = (RAW_OLLAMA_URL && !RAW_OLLAMA_URL.includes("trycloudflare") && !RAW_OLLAMA_URL.includes("loca.lt"))
  ? RAW_OLLAMA_URL : "http://bore.pub:7777";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY; // env-only — no hardcoded secret fallback
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:20b";

export async function callAI(
  prompt: string,
  maxTokens = 1200,
  opts: { tier?: "cheap" | "smart" } = {},
): Promise<string> {
  if (!ANTHROPIC_KEY && !OLLAMA_API_KEY) {
    throw new Error("AI not configured: set ANTHROPIC_API_KEY and/or OLLAMA_API_KEY in the environment.");
  }
  const model = opts.tier === "smart" ? MODEL_SMART : MODEL_CHEAP;

  // Try Anthropic first — unless this month's hard spend cap is already reached.
  if (ANTHROPIC_KEY) {
    if (capReached()) {
      console.warn(`[ai-client] Monthly AI cap $${MONTHLY_CAP_USD} reached ($${monthSpendUSD().toFixed(2)} spent) — using free fallback or pausing.`);
      if (OLLAMA_API_KEY) return await callOpenWebUI(prompt, maxTokens);
      throw new Error(`AI monthly spend cap of $${MONTHLY_CAP_USD} reached. Paused until next month, or raise AI_MONTHLY_CAP_USD.`);
    }
    try {
      return await callAnthropic(prompt, maxTokens, model);
    } catch (e) {
      console.warn("[ai-client] Anthropic failed, falling back to YotBot:", String(e).slice(0, 100));
    }
  }
  // Fall back to YotBot
  return await callOpenWebUI(prompt, maxTokens);
}

async function callAnthropic(prompt: string, maxTokens: number, model: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Anthropic: ${data.error?.message || JSON.stringify(data)}`);
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error("Anthropic empty response");
  recordSpend(model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
  return text;
}

async function callOpenWebUI(prompt: string, maxTokens: number): Promise<string> {
  if (!OLLAMA_API_KEY) throw new Error("YotBot not configured: OLLAMA_API_KEY missing.");
  const res = await fetch(`${OLLAMA_URL}/api/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OLLAMA_API_KEY}`,
      "bypass-tunnel-reminder": "true",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(55000),
  });
  if (!res.ok) throw new Error(`YotBot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`YotBot empty: ${JSON.stringify(data).slice(0, 100)}`);
  return text;
}
