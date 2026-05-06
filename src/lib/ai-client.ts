/**
 * ai-client.ts
 * Unified AI client — uses local Ollama via Cloudflare tunnel if OLLAMA_URL is set,
 * falls back to Anthropic API otherwise.
 */

const OLLAMA_URL = process.env.OLLAMA_URL; // set on Railway
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export async function callAI(prompt: string, maxTokens = 1200): Promise<string> {
  if (OLLAMA_URL) {
    return callOllama(prompt, maxTokens);
  }
  if (ANTHROPIC_KEY) {
    return callAnthropic(prompt, maxTokens);
  }
  throw new Error("No AI backend configured. Set OLLAMA_URL or ANTHROPIC_API_KEY.");
}

async function callOllama(prompt: string, maxTokens: number): Promise<string> {
  // Use Ollama's OpenAI-compatible /v1/chat/completions endpoint
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Ollama returned empty response: ${JSON.stringify(data).slice(0, 200)}`);
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
  if (!res.ok || data.error || data.type === "error") {
    throw new Error(`Anthropic error: ${data.error?.message || JSON.stringify(data)}`);
  }
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error(`Anthropic returned empty response`);
  return text;
}
