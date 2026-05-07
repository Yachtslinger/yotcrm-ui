const OLLAMA_URL = process.env.OLLAMA_URL;
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export async function callAI(prompt: string, maxTokens = 1200): Promise<string> {
  if (OLLAMA_URL && OLLAMA_API_KEY) return callOpenWebUI(prompt, maxTokens);
  if (ANTHROPIC_KEY) return callAnthropic(prompt, maxTokens);
  throw new Error("No AI backend configured. Set OLLAMA_URL+OLLAMA_API_KEY or ANTHROPIC_API_KEY.");
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
  });
  if (!res.ok) throw new Error(`YotBot API ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
