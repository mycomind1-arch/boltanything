export async function chat(opts: {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
}): Promise<string> {
  const apiKey = import.meta.env.VITE_AI_GATEWAY_KEY ?? '';
  const baseUrl = import.meta.env.VITE_AI_GATEWAY_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const contents = opts.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: opts.temperature ?? 0.2 },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI Gateway returned ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty AI response');
  return text;
}

export async function chatJSON<T>(opts: {
  system?: string;
  prompt: string;
  schema: import('zod').ZodSchema<T>;
}): Promise<T> {
  const systemPrompt = `${opts.system ?? ''}\n\nOutput ONLY strict JSON. No prose, no markdown, no code fences.`.trim();
  const result = await chat({
    system: systemPrompt,
    messages: [{ role: 'user', content: opts.prompt }],
    temperature: 0.1,
  });
  const cleaned = result.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return opts.schema.parse(JSON.parse(cleaned));
}

export async function embed(text: string): Promise<number[]> {
  const apiKey = import.meta.env.VITE_AI_GATEWAY_KEY ?? '';
  const baseUrl = import.meta.env.VITE_AI_GATEWAY_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/text-embedding-004:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
  });
  if (!res.ok) throw new Error(`Embed API returned ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const embedding = data?.embedding?.values;
  if (!Array.isArray(embedding)) throw new Error('Invalid embedding response');
  return embedding as number[];
}
