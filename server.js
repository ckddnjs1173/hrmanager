// 노무 AI 상담 — 백엔드 (Express + Anthropic SDK)
// 실행: npm install && npm start  (ANTHROPIC_API_KEY 필요. 없으면 데모 모드로 동작)

import "./lib/env.js"; // ⚠️ 반드시 첫 import — 이후 모듈들이 process.env를 읽기 전에 .env 로드
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AI_ENABLED, AI_INFO } from "./lib/ai.js";
import { bookings, accessLogs, retentionSweep } from "./lib/repo.js";
import { createAdminRouter } from "./lib/admin-routes.js";
import { createAiRouter } from "./lib/ai-routes.js";
import { createCaseRouter } from "./lib/case-routes.js";
import { createDocumentRouter } from "./lib/document-routes.js";
import { createExpertRouter } from "./lib/expert-routes.js";
import { createPartnerRouter } from "./lib/partner-routes.js";
import { createPublicOperationRouter } from "./lib/public-operation-routes.js";
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
setInterval(() => { const now = Date.now(); for (const [k, e] of rlStore) if (e.reset < now) rlStore.delete(k); }, 300000).unref?.();

// ===== Case API (인사야 1.0) =====
app.use("/api/cases", rateLimit({ windowMs: 60000, max: 30 }), createCaseRouter());

if (!AI_ENABLED) {
  console.warn("⚠️  AI 키 미설정(ANTHROPIC_API_KEY/GEMINI_API_KEY) → 데모 모드로 동작합니다(프론트가 목업 응답 사용).");
}

// ===== AI 상담 + 상담 요약 =====
app.use("/api", createAiRouter({ rateLimit }));

// ===== 공개 노무사 검색 =====
app.use("/api", createExpertRouter({ rootDir: __dirname }));

// ===== 문서센터 + 상황별 문서팩 =====
app.use("/api", createDocumentRouter());

// ===== 공개 사용자 운영 API =====
const clean = (s) => (typeof s === "string" ? s.slice(0, 2000).trim() : "");
app.use("/api", createPublicOperationRouter({ rateLimit, clean }));

// ===== 운영자(관리자) API =====
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

// ===== 노무사 파트너 대시보드 API =====
app.use("/api", createPartnerRouter({
  rateLimit,
  clean,
  sessionTtl: SESSION_TTL,
  parseCookies,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
}));

// ===== 요약서 보안 열람 페이지 (노무사 전달용 링크) =====
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const telHref = (s) => { const d = String(s || "").replace(/[^\d+]/g, ""); return d.length >= 9 ? d : ""; };
app.get("/r/:token", (req, res) => {
  const r = bookings.byToken(req.params.token);
  res.set("Content-Type", "text/html; charset=utf-8");
  if (!r) return res.status(404).send(rPage("링크를 찾을 수 없습니다", rState("🔍", "유효하지 않은 링크예요", "주소가 정확한지 확인하거나, 운영자에게 링크 재발급을 요청해 주세요.")));
  if (r.expires && new Date(r.expires) < new Date()) return res.status(410).send(rPage("만료된 링크", rState("⏰", "만료된 열람 링크예요", "보안을 위해 링크는 발급 후 일정 기간만 유효합니다. 운영자에게 재발급을 요청해 주세요.")));
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

app.get("/", createProductHomeHandler(__dirname));
app.use(express.static(__dirname, {
  extensions: ["html"],
  setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate"); },
}));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
  res.status(404).set("Content-Type", "text/html; charset=utf-8")
    .send(rPage("페이지를 찾을 수 없습니다", rState("🧭", "페이지를 찾을 수 없어요", `요청하신 주소가 없습니다. <a href="/">인사야 홈으로</a> 돌아가 상담·계산·문서를 이용해 보세요.`)));
});

function runSweep() {
  try { const r = retentionSweep(); if (r.deletedBookings || r.deletedLeads || r.abandonedSoftDeleted) console.log(`🧹 보존정책 정리: 예약삭제 ${r.deletedBookings}, 리드삭제 ${r.deletedLeads}, 미수락파기 ${r.abandonedSoftDeleted}`); }
  catch (e) { console.warn("sweep error:", e?.message || e); }
}
runSweep();
setInterval(runSweep, 24 * 3600 * 1000).unref?.();

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ 노무 AI 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${AI_ENABLED ? `${AI_INFO.provider} · ${AI_INFO.model}${AI_INFO.fallbacks?.length ? `  (폴백: ${AI_INFO.fallbacks.join(", ")})` : ""}` : "데모 모드(키 없음)"}\n`);
});