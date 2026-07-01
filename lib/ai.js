// AI provider 추상화 + 폴백 체인 — Anthropic(Claude) / Google(Gemini) / Groq를 같은 인터페이스로.
// primary(우선) provider가 실패하면(예: 429 무료 한도) 남은 provider로 자동 폴백 → 한도 초과에도 데모가 안 죽는다.
// 우선순위: AI_PROVIDER 지정 시 그것이 primary. 기본 precedence: anthropic > gemini > groq.
// zero-dependency: Gemini·Groq는 SDK 없이 fetch(REST / OpenAI 호환)로 직접 호출.
import Anthropic from "@anthropic-ai/sdk";
import { TOPIC_TAXONOMY, TOPIC_IDS } from "./knowledge.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

// 모델 (provider별 기본값 · 환경변수로 교체 가능)
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3-32b"; // 한국어 품질↑(다국어 강점). reasoning은 아래서 끔

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

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

// 업스트림 fetch 타임아웃(무한 대기 방지). 스트리밍 본문 읽기 완료까지 유지 → 반드시 clear() 호출.
function withTimeout(ms = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

// ===== Gemini (REST · fetch) =====
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
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
// 키는 URL 쿼리 대신 헤더로(로그·에러에 노출 방지)
const geminiHeaders = () => ({ "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY });
async function geminiStream({ system, messages, maxTokens, onText }) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const to = withTimeout();
  try {
    const res = await fetch(url, {
      method: "POST", headers: geminiHeaders(), signal: to.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: toGeminiContents(messages),
        // thinkingBudget:0 → 2.5-flash 사고 토큰이 답변 예산을 잠식해 중간 잘림 방지(상담엔 불필요·응답 빠름)
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${t.slice(0, 800)}`);
    }
    await readSSE(res.body, (payload) => {
      const j = JSON.parse(payload);
      const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
      if (txt) onText(txt);
    });
  } finally { to.clear(); }
}
async function geminiSummary({ system, messages, instruction, schema, maxTokens }) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`;
  const to = withTimeout();
  try {
    const res = await fetch(url, {
      method: "POST", headers: geminiHeaders(), signal: to.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [...toGeminiContents(messages), { role: "user", parts: [{ text: instruction }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(schema),
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${t.slice(0, 800)}`);
    }
    const j = await res.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("") || "{}";
    return JSON.parse(text);
  } finally { to.clear(); }
}

// ===== Groq (OpenAI 호환 REST) — 무료 등급이 관대해 폴백/대안으로 적합 =====
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const toOpenAIMessages = (system, messages) => [
  ...(system ? [{ role: "system", content: system }] : []),
  ...messages.map((m) => ({ role: m.role, content: m.content })),
];
const groqHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` });
async function groqStream({ system, messages, maxTokens, onText }) {
  const to = withTimeout();
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST", headers: groqHeaders(), signal: to.signal,
      body: JSON.stringify({
        model: GROQ_MODEL, messages: toOpenAIMessages(system, messages),
        max_tokens: maxTokens, temperature: 0.6, stream: true,
        reasoning_effort: "none", // qwen3 등 reasoning 모델의 사고 출력 끔(비reasoning 모델은 무시)
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`groq ${res.status}: ${t.slice(0, 800)}`);
    }
    await readSSE(res.body, (payload) => {
      const j = JSON.parse(payload);
      const txt = j.choices?.[0]?.delta?.content || "";
      if (txt) onText(txt);
    });
  } finally { to.clear(); }
}
async function groqSummary({ system, messages, instruction, schema, maxTokens }) {
  // Groq는 JSON 스키마 강제가 모델별로 상이 → json_object 모드 + 프롬프트에 스키마 명시로 호환성 확보.
  const sys = system + "\n\n[출력 형식] 반드시 아래 JSON 스키마에 맞는 유효한 JSON만 출력하라(설명·코드펜스 금지):\n" + JSON.stringify(schema);
  const to = withTimeout();
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST", headers: groqHeaders(), signal: to.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [...toOpenAIMessages(sys, messages), { role: "user", content: instruction }],
        max_tokens: maxTokens, temperature: 0.3, response_format: { type: "json_object" },
        reasoning_effort: "none",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`groq ${res.status}: ${t.slice(0, 800)}`);
    }
    const j = await res.json();
    return JSON.parse(j.choices?.[0]?.message?.content || "{}");
  } finally { to.clear(); }
}

// SSE 공용 파서: "data: {json}" 라인마다 onPayload(payloadJsonString). getReader()로 환경 호환.
async function readSSE(body, onPayload) {
  const reader = body.getReader();
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
      try { onPayload(payload); } catch { /* 분할된 JSON 라인은 건너뜀 */ }
    }
  }
}

// ===== provider 레지스트리 + 폴백 순서 =====
const PROVIDERS = {
  anthropic: { key: ANTHROPIC_KEY, model: ANTHROPIC_MODEL, stream: anthropicStream, summary: anthropicSummary },
  gemini: { key: GEMINI_KEY, model: GEMINI_MODEL, stream: geminiStream, summary: geminiSummary },
  groq: { key: GROQ_KEY, model: GROQ_MODEL, stream: groqStream, summary: groqSummary },
};
const PRECEDENCE = ["anthropic", "gemini", "groq"];
// ORDER[0]=primary, 나머지=폴백 체인 (키 있는 provider만)
const ORDER = (() => {
  const forced = process.env.AI_PROVIDER;
  const o = [];
  if (forced && PROVIDERS[forced]?.key) o.push(forced);
  for (const n of PRECEDENCE) if (PROVIDERS[n].key && !o.includes(n)) o.push(n);
  return o;
})();

export const AI_ENABLED = ORDER.length > 0;
export const AI_INFO = AI_ENABLED
  ? { provider: ORDER[0], model: PROVIDERS[ORDER[0]].model, fallbacks: ORDER.slice(1).map((n) => `${n}:${PROVIDERS[n].model}`) }
  : null;

// ===== 공개 API (폴백 체인) =====
// streamChat: 답변 텍스트를 onText(delta)로 흘려보냄. 출력 시작 전 실패 시에만 폴백(중복 출력 방지).
export async function streamChat(opts) {
  let emitted = false, lastErr;
  const onText = (t) => { emitted = true; opts.onText(t); };
  for (const name of ORDER) {
    try {
      await PROVIDERS[name].stream({ ...opts, onText });
      if (!emitted) throw new Error(`${name} 빈 응답`); // 200이지만 아무 텍스트도 없음 → 폴백
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`streamChat[${name}] 실패:`, e?.message || e);
      if (emitted) throw e; // 이미 스트리밍 시작 → 폴백 불가
    }
  }
  throw lastErr || new Error("no_ai_provider");
}
// createSummary: 구조화 JSON 반환. 실패/불완전 응답 시 다음 provider로 폴백.
export async function createSummary(opts) {
  const required = Array.isArray(opts.schema?.required) ? opts.schema.required : [];
  let lastErr;
  for (const name of ORDER) {
    try {
      const result = await PROVIDERS[name].summary(opts);
      // 필수 필드 누락(빈 {} 등) → 성공으로 인정하지 않고 폴백
      if (required.length && !required.every((k) => result && k in result)) throw new Error(`${name} 불완전 응답`);
      return result;
    } catch (e) { lastErr = e; console.warn(`createSummary[${name}] 실패:`, e?.message || e); }
  }
  throw lastErr || new Error("no_ai_provider");
}

// ===== AI 사안 분류기 =====
// 사용자 메시지를 읽고 쟁점 taxonomy에서 관련 id를 고른다(돌려 말한 질문·키워드 누락 대응).
// 실패/지연 시 null 반환 → 호출부가 키워드 분류로 폴백한다.
const CLASSIFY_SCHEMA = {
  type: "object",
  properties: { topics: { type: "array", items: { type: "string", enum: TOPIC_IDS } } },
  required: ["topics"],
  additionalProperties: false,
};
export async function classifyTopicsAI(text) {
  if (!AI_ENABLED || !text) return null;
  const list = TOPIC_TAXONOMY.map((t) => `${t.id}: ${t.label}`).join("\n");
  const system =
    "너는 한국 노무 상담 라우터다. 사용자 메시지를 읽고 가장 관련 깊은 쟁점 id를 1~3개 고른다. " +
    "표현이 달라도 의미로 판단하라(예: '잘렸다'→해고, '돈을 안 준다'→임금체불). " +
    "애매하면 가장 가까운 것을 고르고, 정말 해당 없으면 빈 배열. 추측으로 과하게 늘리지 말 것.";
  const instruction = `다음 쟁점 목록 중 사용자 사안에 관련된 id만 고르세요.\n[쟁점 목록]\n${list}`;
  try {
    const r = await Promise.race([
      createSummary({
        system,
        messages: [{ role: "user", content: String(text).slice(0, 2000) }],
        instruction,
        schema: CLASSIFY_SCHEMA,
        maxTokens: 200,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("classify_timeout")), 6000)),
    ]);
    const ids = Array.isArray(r?.topics) ? r.topics.filter((id) => TOPIC_IDS.includes(id)).slice(0, 3) : [];
    return ids;
  } catch (e) {
    console.warn("aiClassify error:", e?.message || e);
    return null;
  }
}
