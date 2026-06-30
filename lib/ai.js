// AI provider 추상화 — Anthropic(Claude) 또는 Google(Gemini)를 같은 인터페이스로.
// 우선순위: ANTHROPIC_API_KEY 있으면 Claude, 없고 GEMINI_API_KEY 있으면 Gemini, 둘 다 없으면 데모모드.
// AI_PROVIDER 환경변수로 강제 지정 가능("anthropic" | "gemini").
// zero-dependency 원칙: Gemini는 SDK 없이 fetch로 REST 직접 호출.
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// provider 결정
const PROVIDER =
  process.env.AI_PROVIDER ||
  (ANTHROPIC_KEY ? "anthropic" : GEMINI_KEY ? "gemini" : null);

// 모델 (provider별 기본값 · 환경변수로 교체 가능)
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const anthropic = PROVIDER === "anthropic" && ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

export const AI_ENABLED = PROVIDER === "anthropic" ? !!anthropic : PROVIDER === "gemini" ? !!GEMINI_KEY : false;
export const AI_INFO = AI_ENABLED
  ? { provider: PROVIDER, model: PROVIDER === "anthropic" ? ANTHROPIC_MODEL : GEMINI_MODEL }
  : null;

// ── 공통 메시지 형태: [{role:'user'|'assistant', content:string}] ──

// ===== Anthropic =====
async function anthropicStream({ system, messages, maxTokens, onText }) {
  const stream = anthropic.messages.stream({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages });
  stream.on("text", (delta) => onText(delta));
  await stream.finalMessage();
}
async function anthropicSummary({ system, messages, instruction, schema, maxTokens }) {
  const r = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [...messages, { role: "user", content: instruction }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const text = r.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}

// ===== Gemini (REST · fetch) =====
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Anthropic 메시지 → Gemini contents (assistant→model)
const toGeminiContents = (messages) =>
  messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
// JSON Schema → Gemini responseSchema (type 대문자화, additionalProperties 제거)
function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.type === "object") {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties || {})) out.properties[k] = toGeminiSchema(v);
    if (Array.isArray(s.required)) out.required = s.required;
  }
  if (s.type === "array" && s.items) out.items = toGeminiSchema(s.items);
  return out;
}

async function geminiStream({ system, messages, maxTokens, onText }) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  // SSE 파싱: "data: {json}" 라인마다 candidates[].content.parts[].text 추출
  // getReader() 사용 — res.body 비동기 이터레이터 의존성 제거(환경 호환성)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
        if (txt) onText(txt);
      } catch { /* 분할된 JSON 라인은 건너뜀 */ }
    }
  }
}

// 진단용: 최소 Gemini 호출로 상태/에러를 확인(키 미노출). 문제 해결 후 제거.
export async function geminiSelftest() {
  if (PROVIDER !== "gemini") return { provider: PROVIDER, note: "gemini 아님" };
  try {
    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "핑" }] }], generationConfig: { maxOutputTokens: 10 } }),
    });
    const t = await res.text();
    return { model: GEMINI_MODEL, status: res.status, ok: res.ok, body: t.slice(0, 500) };
  } catch (e) {
    return { model: GEMINI_MODEL, error: String(e?.message || e).slice(0, 300) };
  }
}
async function geminiSummary({ system, messages, instruction, schema, maxTokens }) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [...toGeminiContents(messages), { role: "user", parts: [{ text: instruction }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(schema),
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("") || "{}";
  return JSON.parse(text);
}

// ===== 공개 API =====
// streamChat: 답변 텍스트를 onText(delta)로 흘려보냄
export async function streamChat(opts) {
  if (PROVIDER === "anthropic") return anthropicStream(opts);
  if (PROVIDER === "gemini") return geminiStream(opts);
  throw new Error("no_ai_provider");
}
// createSummary: 구조화 JSON(상담요약서) 반환
export async function createSummary(opts) {
  if (PROVIDER === "anthropic") return anthropicSummary(opts);
  if (PROVIDER === "gemini") return geminiSummary(opts);
  throw new Error("no_ai_provider");
}
