// 노무 AI 상담 — 백엔드 (Express + Anthropic SDK)
// 실행: npm install && npm start  (ANTHROPIC_API_KEY 필요. 없으면 데모 모드로 동작)

import "./lib/env.js"; // ⚠️ 반드시 첫 import — 이후 모듈들이 process.env를 읽기 전에 .env 로드
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AI_ENABLED, AI_INFO } from "./lib/ai.js";
import { renderBrandedPage, renderStateMarkup } from "./lib/branded-page.js";
import { retentionSweep } from "./lib/repo.js";
import { createAdminRouter } from "./lib/admin-routes.js";
import { createAiRouter } from "./lib/ai-routes.js";
import { createCaseRouter } from "./lib/case-routes.js";
import { createDocumentRouter } from "./lib/document-routes.js";
import { createExpertRouter } from "./lib/expert-routes.js";
import { createPartnerRouter } from "./lib/partner-routes.js";
import { createPublicOperationRouter } from "./lib/public-operation-routes.js";
import { createSecureSummaryRouter } from "./lib/secure-summary-routes.js";
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
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; " +
    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});

// ===== 쿠키 파서 + 서명 세션 (무의존) =====
const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (IS_PROD ? crypto.randomBytes(24).toString("hex") : "admin");
if (IS_PROD && !process.env.ADMIN_TOKEN) console.warn("⚠️  운영 모드 + ADMIN_TOKEN 미설정 → 관리자 로그인 비활성(무작위 토큰). 환경변수를 설정하세요.");
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_TOKEN + "::nomu-session";
const SESSION_TTL = 12 * 3600 * 1000;

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function setSessionCookie(req, res, payload, name = "nomu_sess") {
  const secure = req.secure ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${name}=${signSession(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000};${secure}`);
}

function clearSessionCookie(res, name = "nomu_sess") {
  res.setHeader("Set-Cookie", `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// ===== 레이트리밋 (인메모리 · 무의존) =====
const rlStore = new Map();
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip || "ip"}:${req.path}`;
    const now = Date.now();
    let entry = rlStore.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      rlStore.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: "too_many_requests" });
    }
    return next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rlStore) if (entry.reset < now) rlStore.delete(key);
}, 300000).unref?.();

// ===== 제품 API =====
app.use("/api/cases", rateLimit({ windowMs: 60000, max: 30 }), createCaseRouter());
if (!AI_ENABLED) console.warn("⚠️  AI 키 미설정(ANTHROPIC_API_KEY/GEMINI_API_KEY) → 데모 모드로 동작합니다(프론트가 목업 응답 사용).");
app.use("/api", createAiRouter({ rateLimit }));
app.use("/api", createExpertRouter({ rootDir: __dirname }));
app.use("/api", createDocumentRouter());

const clean = (value) => (typeof value === "string" ? value.slice(0, 2000).trim() : "");
app.use("/api", createPublicOperationRouter({ rateLimit, clean }));
app.use("/api", createAdminRouter({
  rateLimit,
  clean,
  adminToken: ADMIN_TOKEN,
  sessionTtl: SESSION_TTL,
  parseCookies,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
}));
app.use("/api", createPartnerRouter({
  rateLimit,
  clean,
  sessionTtl: SESSION_TTL,
  parseCookies,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
}));

// ===== 노무사 전달용 보안 요약 링크 =====
app.use(createSecureSummaryRouter({ sessionSecret: SESSION_SECRET }));

// 서버 상태(프론트가 데모/실모드 판단용)
app.get("/api/health", (_req, res) => res.json({ ai: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null }));

// 제품 홈 + 정적 파일
app.get("/", createProductHomeHandler(__dirname));
app.use(express.static(__dirname, {
  extensions: ["html"],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate");
  },
}));

// 알 수 없는 경로 — API는 JSON 404, 그 외는 브랜드 404 페이지
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  return res.status(404).set("Content-Type", "text/html; charset=utf-8").send(
    renderBrandedPage(
      "페이지를 찾을 수 없습니다",
      renderStateMarkup("🧭", "페이지를 찾을 수 없어요", `요청하신 주소가 없습니다. <a href="/">인사야 홈으로</a> 돌아가 상담·계산·문서를 이용해 보세요.`),
    ),
  );
});

// 개인정보 보존 자동 파기: 기동 시 1회 + 24시간 주기
function runSweep() {
  try {
    const result = retentionSweep();
    if (result.deletedBookings || result.deletedLeads || result.abandonedSoftDeleted) {
      console.log(`🧹 보존정책 정리: 예약삭제 ${result.deletedBookings}, 리드삭제 ${result.deletedLeads}, 미수락파기 ${result.abandonedSoftDeleted}`);
    }
  } catch (error) {
    console.warn("sweep error:", error?.message || error);
  }
}
runSweep();
setInterval(runSweep, 24 * 3600 * 1000).unref?.();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ 노무 AI 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${AI_ENABLED ? `${AI_INFO.provider} · ${AI_INFO.model}${AI_INFO.fallbacks?.length ? `  (폴백: ${AI_INFO.fallbacks.join(", ")})` : ""}` : "데모 모드(키 없음)"}\n`);
});