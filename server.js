// 노무 AI 상담 — 백엔드 (Express + Anthropic SDK)
// 실행: npm install && npm start  (ANTHROPIC_API_KEY 필요. 없으면 데모 모드로 동작)

import "./lib/env.js"; // ⚠️ 반드시 첫 import — 이후 모듈들이 process.env를 읽기 전에 .env 로드
import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AI_ENABLED, AI_INFO, streamChat, createSummary, classifyTopicsAI } from "./lib/ai.js";
import { buildKnowledgeFromIds, classifyTopics } from "./lib/knowledge.js";
import { SYSTEM_PROMPT, SUMMARY_SCHEMA, SUMMARY_INSTRUCTION } from "./lib/prompt.js";
import { listDocs, renderDoc, listPacks, renderPack } from "./lib/docs.js";
import { bookings, leads, nomusa, accessLogs, adminStats, privacy, retentionSweep, events, EVENT_TYPES, partners, feedback } from "./lib/repo.js";
import { notify, notifications, availableChannels } from "./lib/notify.js";
import { createCaseRouter } from "./lib/case-routes.js";
import { createProductHomeHandler } from "./lib/product-home.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Render/Railway 프록시 뒤 — req.protocol·ip 정확히
app.use(express.json({ limit: "1mb" }));

// ===== 보안 헤더 (helmet 대체 · 무의존) =====
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // SPA가 인라인 스타일/스크립트를 쓰므로 'unsafe-inline' 허용. 폰트는 jsdelivr CDN.
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; " +
    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});

// ===== 쿠키 파서 + 서명 세션 (무의존) =====
// 운영(NODE_ENV=production)에서 시크릿 미설정 시 추측가능한 "admin" 대신 무작위값으로 fail-closed.
// (관리자 로그인은 사실상 비활성 → 반드시 환경변수 설정. 로컬 개발은 편의상 "admin" 유지)
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (IS_PROD ? crypto.randomBytes(24).toString("hex") : "admin");
if (IS_PROD && !process.env.ADMIN_TOKEN) console.warn("⚠️  운영 모드 + ADMIN_TOKEN 미설정 → 관리자 로그인 비활성(무작위 토큰). 환경변수를 설정하세요.");
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_TOKEN + "::nomu-session";
const SESSION_TTL = 12 * 3600 * 1000; // 12시간
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  for (const part of h.split(";")) { const i = part.indexOf("="); if (i < 0) continue; out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return (p.exp && p.exp > Date.now()) ? p : null; } catch { return null; }
}
function setSessionCookie(req, res, payload, name = "nomu_sess") {
  const secure = req.secure ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${name}=${signSession(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000};${secure}`);
}
function clearSessionCookie(res, name = "nomu_sess") { res.setHeader("Set-Cookie", `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); }

// ===== 레이트리밋 (인메모리 · 무의존) =====
const rlStore = new Map();
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = (req.ip || "ip") + ":" + req.path;
    const now = Date.now(); let e = rlStore.get(key);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; rlStore.set(key, e); }
    e.count++;
    if (e.count > max) { res.setHeader("Retry-After", Math.ceil((e.reset - now) / 1000)); return res.status(429).json({ error: "too_many_requests" }); }
    next();
  };
}
// 주기적 정리(메모리 누수 방지)
setInterval(() => { const now = Date.now(); for (const [k, e] of rlStore) if (e.reset < now) rlStore.delete(k); }, 300000).unref?.();

// ===== Case API (인사야 1.0) =====
app.use("/api/cases", rateLimit({ windowMs: 60000, max: 30 }), createCaseRouter());

// AI provider는 lib/ai.js가 결정 (ANTHROPIC_API_KEY → Claude / GEMINI_API_KEY → Gemini / 없으면 데모).
if (!AI_ENABLED) {
  console.warn("⚠️  AI 키 미설정(ANTHROPIC_API_KEY/GEMINI_API_KEY) → 데모 모드로 동작합니다(프론트가 목업 응답 사용).");
}

// 사안 분류 → 노무 지식 주입 문자열 결정.
// 쿼터 절약: 키워드로 먼저 분류하고, 키워드가 잡으면 AI 호출을 생략한다(상담 1건당 AI 1회 유지).
// 키워드가 비었을 때(돌려 말한 질문 등)만 AI 의미 분류를 호출. AI 실패 시 일반 안내로 폴백.
async function resolveKnowledge(messages) {
  const users = messages.filter((m) => m.role === "user").map((m) => m.content);
  const text = (users.slice(-1)[0] || "") + " " + users.join(" ");
  const kwIds = classifyTopics(text);
  if (kwIds.length) return buildKnowledgeFromIds(kwIds); // 키워드 적중 → AI 분류 생략(쿼터 절약)
  const aiIds = await classifyTopicsAI(text); // 키워드 미적중 시에만 AI 의미 분류
  return buildKnowledgeFromIds(aiIds || []); // null/[] → GENERIC
}

// 대화 메시지 정규화 (안전): role/content만 통과
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30) // 최근 30턴까지만 (비용/컨텍스트 보호)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

// ===== AI 상담 (스트리밍) =====
// rateLimit: AI 호출은 비용/쿼터가 걸려 있어 반드시 제한(루프 남용·쿼터 소진 방지)
app.post("/api/chat", rateLimit({ windowMs: 60000, max: 12 }), async (req, res) => {
  if (!AI_ENABLED) return res.status(503).json({ error: "no_api_key" });
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages.length || messages[0].role !== "user") {
    return res.status(400).json({ error: "first message must be user" });
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  try {
    // 사안 분류(AI+키워드) → 2026 노무 지식을 시스템 프롬프트에 주입
    const system = SYSTEM_PROMPT + await resolveKnowledge(messages);
    await streamChat({
      system,
      messages,
      maxTokens: 1600, // 상담 답변 길이 상한 (비용 통제). thinking off라 전량 답변에 사용
      onText: (delta) => res.write(delta),
    });
    res.end();
  } catch (err) {
    console.error("chat error:", err?.message || err);
    // 무료 등급 분당 한도(429)는 사용자에게 친절한 안내로 구분
    const rateLimited = /\b429\b|quota|rate/i.test(String(err?.message || ""));
    if (!res.headersSent) res.status(rateLimited ? 429 : 500).json({ error: rateLimited ? "rate_limited" : "ai_error" });
    else res.end(rateLimited ? "\n\n(지금 이용자가 많아 잠시 후 다시 시도해 주세요.)" : "\n\n(일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.)");
  }
});

// ===== 상담 요약서 (구조화 출력) =====
app.post("/api/summary", rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  if (!AI_ENABLED) return res.status(503).json({ error: "no_api_key" });
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages.length) return res.status(400).json({ error: "no_messages" });
  try {
    const system = SYSTEM_PROMPT + await resolveKnowledge(messages);
    const summary = await createSummary({
      system,
      messages,
      instruction: SUMMARY_INSTRUCTION,
      schema: SUMMARY_SCHEMA,
      maxTokens: 1500,
    });
    res.json(summary);
  } catch (err) {
    console.error("summary error:", err?.message || err);
    res.status(500).json({ error: "ai_error" });
  }
});

// ===== 노무사 목록 (공공데이터 + 직접등록) =====
// 최초 1회 자동 시드: nomusa 테이블이 비어 있고 nomusa.json이 있으면 가져온다.
(function seedNomusa() {
  try {
    if (nomusa.count() === 0) {
      const arr = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "nomusa.json"), "utf-8"));
      if (Array.isArray(arr) && arr.length) { nomusa.replaceAll(arr); console.log(`   노무사 ${arr.length}건 DB 시드 완료`); }
    }
  } catch { /* nomusa.json 없으면 무시 */ }
})();
// 공개: 옵트아웃 제외 + featured 우선 정렬
app.get("/api/nomu", (req, res) => {
  res.json(nomusa.publicList({ region: (req.query.region || "").toString().trim() }));
});

// ===== 문서센터 (AI 미사용 · 템플릿 치환) =====
app.get("/api/docs", (req, res) => res.json(listDocs()));
app.post("/api/doc", (req, res) => {
  const { key, values } = req.body || {};
  const doc = renderDoc(key, values || {});
  if (!doc) return res.status(404).json({ error: "unknown_doc" });
  res.json(doc);
});

// ===== 상황별 문서팩 (여러 문서를 1회 입력으로 묶음 생성) =====
app.get("/api/docpacks", (req, res) => res.json(listPacks()));
app.post("/api/docpack", (req, res) => {
  const { key, values } = req.body || {};
  const pack = renderPack(key, values || {});
  if (!pack) return res.status(404).json({ error: "unknown_pack" });
  res.json(pack);
});

// ===== 리드 / 예약 (SQLite 저장 — lib/repo.js) =====
const clean = (s) => (typeof s === "string" ? s.slice(0, 2000).trim() : "");

// 출시 알림 · 노무사 입점 등 리드 수집
app.post("/api/lead", rateLimit({ max: 20 }), (req, res) => {
  const contact = clean(req.body?.contact);
  if (!contact) return res.status(400).json({ error: "contact_required" });
  const rec = leads.insert({
    kind: clean(req.body?.kind) || "general",
    name: clean(req.body?.name), contact, message: clean(req.body?.message),
  });
  events.add("lead", rec.kind);
  res.json({ ok: true, id: rec.id });
});

// 노무사 상담 신청 → 운영자에게 접수(동의·보안토큰·상태)
app.post("/api/booking", rateLimit({ max: 20 }), (req, res) => {
  const contact = clean(req.body?.contact);
  if (!contact) return res.status(400).json({ error: "contact_required" });
  if (!req.body?.consent) return res.status(400).json({ error: "consent_required" });
  const token = crypto.randomBytes(16).toString("hex");
  const rec = bookings.insert({
    nomu: clean(req.body?.nomu), name: clean(req.body?.name), contact,
    message: clean(req.body?.message), summary: clean(req.body?.summary),
    consent: true, token, expires: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  // 알림(틀): 키 없으면 콘솔/발송함에 적재 — 키 확보 시 어댑터 교체로 자동화
  events.add("booking", rec.nomu || "");
  notify({ template: "new_booking", recipient: "operator", subject: "새 상담 접수", body: `${rec.name || "(미입력)"} · 희망: ${rec.nomu || "-"}` }).catch(() => {});
  res.json({ ok: true, id: rec.id });
});

// 경량 이벤트 수집(비식별·화이트리스트) — 퍼널 분석용
app.post("/api/event", rateLimit({ max: 120 }), (req, res) => {
  const type = String(req.body?.type || "");
  if (!EVENT_TYPES.includes(type)) return res.status(400).json({ error: "bad_type" });
  events.add(type, clean(req.body?.ref).slice(0, 60));
  res.json({ ok: true });
});

// AI 답변 오답 신고 등 사용자 피드백
app.post("/api/feedback", rateLimit({ max: 20 }), (req, res) => {
  feedback.add({ kind: clean(req.body?.kind) || "answer", ref: clean(req.body?.ref), message: clean(req.body?.message) });
  res.json({ ok: true });
});

// ===== 개인정보 삭제 요청 (정책: 지체 없이 파기) =====
app.post("/api/privacy/delete", rateLimit({ max: 10 }), (req, res) => {
  const token = clean(req.body?.token), contact = clean(req.body?.contact);
  if (token) { const n = privacy.deleteByToken(token); return res.json({ ok: true, deleted: n }); }
  if (contact) { const n = privacy.deleteByContact(contact); return res.json({ ok: true, deleted: n }); }
  return res.status(400).json({ error: "token_or_contact_required" });
});

// ===== 운영자(관리자) 인증 — 서명 세션 쿠키 + CSRF (헤더 토큰도 호환) =====
// ADMIN_TOKEN은 상단에서 fail-closed로 정의됨
const STAT = ["received", "reviewed", "sent", "in_progress", "done", "canceled"];
function tokenOk(t) {
  if (!t || t.length !== ADMIN_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN)); } catch { return false; }
}
// 로그인: 토큰 검증 → 세션 쿠키 발급 + CSRF 토큰 반환
app.post("/api/admin/login", rateLimit({ max: 10 }), (req, res) => {
  if (!tokenOk(String(req.body?.token || ""))) return res.status(401).json({ error: "invalid_token" });
  const csrf = crypto.randomBytes(16).toString("hex");
  setSessionCookie(req, res, { exp: Date.now() + SESSION_TTL, csrf });
  res.json({ ok: true, csrf });
});
app.post("/api/admin/logout", (req, res) => { clearSessionCookie(res); res.json({ ok: true }); });
// 세션 확인: 새로고침 후 CSRF 토큰 복구용
app.get("/api/admin/session", (req, res) => {
  const sess = verifySession(parseCookies(req).nomu_sess);
  if (!sess) return res.status(401).json({ error: "no_session" });
  res.json({ ok: true, csrf: sess.csrf });
});
// 인증 미들웨어: 세션 쿠키(쓰기 시 CSRF 검사) 또는 x-admin-token 헤더
function adminAuth(req, res, next) {
  if (tokenOk(req.get("x-admin-token") || "")) return next(); // 헤더 인증(스크립트·CSRF 무관)
  const sess = verifySession(parseCookies(req).nomu_sess);
  if (!sess) return res.status(401).json({ error: "unauthorized" });
  if (req.method !== "GET" && (req.get("x-csrf-token") || "") !== sess.csrf) return res.status(403).json({ error: "csrf" });
  req.adminSession = sess;
  next();
}
app.get("/api/admin/data", adminAuth, (req, res) => {
  res.json({ bookings: bookings.all(), leads: leads.all(), origin: `${req.protocol}://${req.get("host")}` });
});
app.get("/api/admin/summary", adminAuth, (req, res) => res.json({ ...adminStats(), notifyPending: notifications.pendingCount(), notifyChannels: availableChannels(), feedbackNew: feedback.count() }));
app.get("/api/admin/notifications", adminAuth, (req, res) => res.json(notifications.recent(30)));
app.get("/api/admin/feedback", adminAuth, (req, res) => res.json(feedback.recent(50)));
app.get("/api/admin/bookings", adminAuth, (req, res) => {
  res.json(bookings.list({ status: req.query.status, q: clean(req.query.q), page: +req.query.page || 1, size: Math.min(200, +req.query.size || 50) }));
});
app.post("/api/admin/booking/:id", adminAuth, (req, res) => {
  const fields = {};
  if (req.body?.status && STAT.includes(req.body.status)) fields.status = req.body.status;
  if (typeof req.body?.memo === "string") fields.memo = clean(req.body.memo;
  // 노무사 배정: id로 배정하면 표시용 이름도 함께 저장
  if (typeof req.body?.assigned_nomusa_id === "string") {
    fields.assigned_nomusa_id = clean(req.body.assigned_nomusa_id);
    const n = fields.assigned_nomusa_id ? nomusa.get(fields.assigned_nomusa_id) : null;
    fields.assigned = n ? (n.n || n.name || "") : "";
  } else if (typeof req.body?.assigned === "string") {
    fields.assigned = clean(req.body.assigned);
  }
  if (!bookings.update(req.params.id, fields)) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
// 예약 이력(감사): 상태전환·동의·열람 기록 — 리드 전달·동의 이력 보관
app.get("/api/admin/booking/:id/events", adminAuth, (req, res) => {
  const b = bookings.get(req.params.id);
  if (!b) return res.status(404).json({ error: "not_found" });
  res.json({ consent: !!b.consent, consentAt: b.at, events: bookings.events(req.params.id), views: accessLogs.forBooking(req.params.id) });
});
// 노무사 관리: 전체 목록(옵트아웃 포함) + 노출/추천 토글
app.get("/api/admin/nomu", adminAuth, (req, res) => res.json(nomusa.adminList()));
app.post("/api/admin/nomu/:id", adminAuth, (req, res) => {
  let done = false;
  if (typeof req.body?.opted_out === "boolean") done = nomusa.toggle(req.params.id, "opted_out", req.body.opted_out) || done;
  if (typeof req.body?.featured === "boolean") done = nomusa.toggle(req.params.id, "featured", req.body.featured) || done;
  if (!done) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
// 노무사 대시보드 접속 토큰 발급(운영자) → 평문 토큰·접속 링크 1회 반환
app.post("/api/admin/nomu/:id/token", adminAuth, (req, res) => {
  const n = nomusa.get(req.params.id);
  if (!n) return res.status(404).json({ error: "not_found" });
  const token = partners.issue(req.params.id, n.n || n.name || "");
  res.json({ ok: true, token, link: `${req.protocol}://${req.get("host")}/partner#token=${token}` });
});

// ===== 노무사 대시보드 (운영자 발급 토큰 → 세션) =====
function partnerAuth(req, res, next) {
  const sess = verifySession(parseCookies(req).nomu_partner);
  if (!sess || !sess.nomusa_id) return res.status(401).json({ error: "unauthorized" });
  if (req.method !== "GET" && (req.get("x-csrf-token") || "") !== sess.csrf) return res.status(403).json({ error: "csrf" });
  req.partner = sess;
  next();
}
app.post("/api/partner/login", rateLimit({ max: 10 }), (req, res) => {
  const acc = partners.verify(String(req.body?.token || ""));
  if (!acc) return res.status(401).json({ error: "invalid_token" });
  partners.touch(acc.id);
  const csrf = crypto.randomBytes(16).toString("hex");
  setSessionCookie(req, res, { exp: Date.now() + SESSION_TTL, csrf, nomusa_id: acc.nomusa_id, name: acc.name }, "nomu_partner");
  res.json({ ok: true, csrf, name: acc.name });
});
app.post("/api/partner/logout", (req, res) => { clearSessionCookie(res, "nomu_partner"); res.json({ ok: true }); });
app.get("/api/partner/me", (req, res) => {
  const sess = verifySession(parseCookies(req).nomu_partner);
  if (!sess || !sess.nomusa_id) return res.status(401).json({ error: "no_session" });
  res.json({ ok: true, csrf: sess.csrf, name: sess.name, nomusa_id: sess.nomusa_id });
});
app.get("/api/partner/bookings", partnerAuth, (req, res) => res.json(bookings.byNomusa(req.partner.nomusa_id)));
app.post("/api/partner/booking/:id", partnerAuth, (req, res) => {
  const b = bookings.get(req.params.id);
  if (!b || b.assigned_nomusa_id !== req.partner.nomusa_id) return res.status(404).json({ error: "not_found" });
  const fields = {};
  // 노무사는 진행 상태(상담진행·완료)와 메모만 변경 가능
  if (["in_progress", "done"].includes(req.body?.status)) fields.status = req.body.status;
  if (typeof req.body?.memo === "string") fields.memo = clean(req.body.memo);
  if (Object.keys(fields).length) bookings.update(req.params.id, fields, "partner:" + req.partner.nomusa_id);
  res.json({ ok: true });
});

// ===== 요약서 보안 열람 페이지 (노무사 전달용 링크) =====
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const telHref = (s) => { const d = String(s || "").replace(/[^\d+]/g, ""); return d.length >= 9 ? d : ""; };
app.get("/r/:token", (req, res) => {
  const r = bookings.byToken(req.params.token);
  res.set("Content-Type", "text/html; charset=utf-8");
  if (!r) return res.status(404).send(rPage("링크를 찾을 수 없습니다", rState("🔍", "유효하지 않은 링크예요", "주소가 정확한지 확인하거나, 운영자에게 링크 재발급을 요청해 주세요.")));
  if (r.expires && new Date(r.expires) < new Date()) return res.status(410).send(rPage("만료된 링크", rState("⏰", "만료된 열람 링크예요", "보안을 위해 링크는 발급 후 일정 기간만 유효합니다. 운영자에게 재발급을 요청해 주세요.")));
  // 열람 로그(분쟁 대비) — IP는 해시로만
  accessLogs.add({ booking_id: r.id, token: r.token, ip_hash: crypto.createHash("sha256").update((req.ip || "") + SESSION_SECRET).digest("hex").slice(0, 16), ua: req.get("user-agent") });
  const tel = telHref(r.contact);
  const body = `
    <div class="rv-head">
      <div><div class="rv-eb">노무사 전달용 · 상담 요약서</div><div class="rv-title">${esc(r.nomu) || "노무 상담"} 요청</div></div>
      <span class="badge info dot">접수 ${esc((r.at || "").slice(0, 10))}</span>
    </div>
    <div class="rv-grid">
      <div class="rv-row"><span class="k">신청자</span><span class="v">${esc(r.name) || "(미입력)"}</span></div>
      <div class="rv-row"><span class="k">연락처</span><span class="v">${tel ? `<a href="tel:${tel}">${esc(r.contact)}</a>` : esc(r.contact) || "-"}</span></div>
      <div class="rv-row"><span class="k">희망 노무사</span><span class="v">${esc(r.nomu) || "-"}</span></div>
      ${r.message ? `<div class="rv-row"><span class="k">남긴 말</span><span class="v">${esc(r.message)}</span></div>` : ""}
    </div>
    ${r.summary ? `<div class="rv-sum"><div class="k">상담 요약 (AI 정리)</div><pre>${esc(r.summary)}</pre></div>` : ""}
    <div class="rv-actions no-print">
      ${tel ? `<a class="btn primary" href="tel:${tel}">📞 신청자에게 전화</a>` : ""}
      <button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF</button>
    </div>
    <div class="rv-note">
      <b>안내</b> · 회사명·실명 등 민감정보는 <b>마스킹</b>되어 있습니다. 본 링크는 <b>${esc((r.expires || "").slice(0, 10))}</b>까지 유효하며, <b>상담 목적 외 사용을 금합니다</b>. 열람 기록은 보안을 위해 저장됩니다.
    </div>`;
  res.send(rPage("상담 요약서 (노무사 전달용)", body));
});
function rState(icon, title, desc) {
  return `<div class="rv-state"><div class="ic">${icon}</div><div class="t">${title}</div><p>${desc}</p></div>`;
}
function rPage(title, inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/><title>${title} · 인사야</title>
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg"/>
  <link rel="stylesheet" href="/assets/brand/app.css"/>
  <style>
    body{padding:0}
    .rv-top{background:#fff;border-bottom:1px solid var(--line);padding:1rem 1.2rem;display:flex;align-items:center;gap:.5rem;font-weight:800;color:var(--ink-900)}
    .rv-top .b{color:var(--accent)}
    .rv-wrap{max-width:640px;margin:0 auto;padding:1.4rem 1.1rem}
    .rv-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-lg);padding:1.5rem 1.4rem;box-shadow:var(--e1)}
    .rv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.6rem;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1rem}
    .rv-eb{font-size:.74rem;font-weight:800;color:var(--accent-ink)}
    .rv-title{font-size:1.25rem;font-weight:800;color:var(--ink-900);margin-top:.2rem}
    .rv-row{display:flex;gap:.8rem;padding:.6rem 0;border-bottom:1px dashed var(--line);font-size:.95rem}
    .rv-row .k{width:88px;color:var(--ink-400);font-weight:700;flex-shrink:0}
    .rv-row .v{color:var(--ink-800)}
    .rv-sum{margin-top:1rem}
    .rv-sum .k{color:var(--accent-ink);font-weight:800;font-size:.9rem;margin-bottom:.4rem}
    .rv-sum pre{white-space:pre-wrap;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:1rem;font-family:inherit;font-size:.92rem;color:var(--ink-700);margin:0}
    .rv-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem}
    .rv-note{margin-top:1.2rem;background:var(--accent-soft);border-radius:var(--r-md);padding:.9rem 1rem;font-size:.82rem;color:var(--ink-600);line-height:1.6}
    .rv-state{text-align:center;padding:2.5rem 1rem}
    .rv-state .ic{font-size:3rem}
    .rv-state .t{font-size:1.2rem;font-weight:800;color:var(--ink-900);margin:.6rem 0 .3rem}
    .rv-state p{color:var(--ink-400);font-size:.92rem;margin:0}
    @media print{.no-print{display:none!important}.rv-top{border:none}.rv-card{box-shadow:none;border:none}body{background:#fff}}
  </style></head>
  <body>
    <div class="rv-top no-print"><span class="b">●</span> 인사야</div>
    <div class="rv-wrap"><div class="rv-card">${inner}</div></div>
  </body></html>`;
}

// 서버 상태(프론트가 데모/실모드 판단용)
app.get("/api/health", (req, res) => res.json({ ai: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null }));

// 홈은 기존 index.html을 유지하면서 제품 전환용 런처 스크립트만 주입한다.
app.get("/", createProductHomeHandler(__dirname));

// 정적 파일 (프론트 + 생성된 정적 글/sitemap). extensions로 /articles/wage 도 동작.
app.use(express.static(__dirname, {
  extensions: ["html"],
  setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate"); },
}));

// 알 수 없는 경로 — API는 JSON 404, 그 외는 브랜드 404 페이지
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  res.status(404).set("Content-Type", "text/html; charset=utf-8")
    .send(rPage("페이지를 찾을 수 없습니다", rState("🧭", "페이지를 찾을 수 없어요", `요청하신 주소가 없습니다. <a href="/">인사야 홈으로</a> 돌아가 상담·계산·문서를 이용해 보세요.`)));
});

// 개인정보 보존 자동 파기: 기동 시 1회 + 24시간 주기
function runSweep() {
  try { const r = retentionSweep(); if (r.deletedBookings || r.deletedLeads || r.abandonedSoftDeleted) console.log(`🧹 보존정책 정리: 예약삭제 ${r.deletedBookings}, 리드삭제 ${r.deletedLeads}, 미수락파기 ${r.abandonedSoftDeleted}`); }
  catch (e) { console.warn("sweep error:", e?.message || e); }
}
runSweep();
setInterval(runSweep, 24 * 3600 * 1000).unref?.();

const PORT = process.env.PORT || 3000;
// 0.0.0.0 바인딩: 클라우드 호스트(Render/Railway/Fly 등)에서 외부 접속 허용에 필요
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ 노무 AI 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${AI_ENABLED ? `${AI_INFO.provider} · ${AI_INFO.model}${AI_INFO.fallbacks?.length ? `  (폴백: ${AI_INFO.fallbacks.join(", ")})` : ""}` : "데모 모드(키 없음)"}\n`);
});
