/**
 * ai-client.ts
 * Uses YotBot One (Open WebUI) via OLLAMA_URL env var if set.
 * Falls back to Anthropic if ANTHROPIC_API_KEY is set.
 * OLLAMA_URL defaults to http://bore.pub:7777 if not overridden.
 */

// Default to bore.pub:7777 — bore is started with fixed port on Will's Mac
const OLLAMA_URL = process.env.OLLAMA_URL || "http://bore.pub:7777";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "sk-yotcrm-301613feda903c146c05b8dd97869352af4846fdacfe9b01407deefd97103b31";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export async function callAI(prompt: string, maxTokens = 1200): Promise<string> {
  // Try YotBot first, fall back to Anthropic
  try {
    return await callOpenWebUI(prompt, maxTokens);
  } catch (e) {
    console.warn("[ai-client] YotBot failed, trying Anthropic:", e);
    if (ANTHROPIC_KEY) return await callAnthropic(prompt, maxTokens);
    throw e;
  }
}

async function callOpenWebUI(prompt: string, maxTokens: number): Promise<string> {
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
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`YotBot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`YotBot empty: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

async function callAnthropic(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Anthropic: ${data.error?.message || JSON.stringify(data)}`);
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error("Anthropic empty response");
  return text;
}
