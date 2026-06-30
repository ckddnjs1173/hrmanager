// AI provider 추상화 — Anthropic(Claude) 또는 Google(Gemini)를 같은 인터페이스로.
// 우선순위: ANTHROPIC_API_KEY 있으면 Claude, 없고 GEMINI_API_KEY 있으면 Gemini, 둘 다 없으면 데모모드.
// AI_PROVIDER 환경변수로 강제 지정 가능("anthropic" | "gemini").
// zero-dependency 원칙: Gemini는 SDK 없이 fetch로 REST 직접 호출.
import Anthropic from "@anthropic-ai/sdk";
import { TOPIC_TAXONOMY, TOPIC_IDS } from "./knowledge.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// provider 결정
const PROVIDER =
  process.env.AI_PROVIDER ||
  (ANTHROPIC_KEY ? "anthropic" : GEMINI_KEY ? "gemini" : null);

// 모델 (provider별 기본값 · 환경변수로 교체 가능)
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
      // thinkingBudget:0 → 2.5-flash의 사고 토큰이 답변 예산을 잠식해 중간 잘림을 막음(상담엔 사고 불필요·응답 빠름)
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } },
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
        thinkingConfig: { thinkingBudget: 0 }, // 사고 토큰이 JSON 출력 예산을 잠식해 잘리는 것 방지
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

// 진단용(임시): 최소 Gemini 호출로 상태/에러 확인(키 미노출).
export async function geminiSelftest() {
  if (PROVIDER !== "gemini") return { provider: PROVIDER };
  try {
    const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "핑" }] }], generationConfig: { maxOutputTokens: 10 } }),
    });
    const t = await res.text();
    return { model: GEMINI_MODEL, status: res.status, ok: res.ok, body: t.slice(0, 400) };
  } catch (e) { return { error: String(e?.message || e).slice(0, 300) }; }
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
    return null; // 폴백 신호
  }
}
