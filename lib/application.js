import express from "express";
import { AI_ENABLED, AI_INFO } from "./ai.js";
import { renderBrandedPage, renderStateMarkup } from "./branded-page.js";
import { createAdminRouter } from "./admin-routes.js";
import { createAiRouter } from "./ai-routes.js";
import { createCaseRouter } from "./case-routes.js";
import { createDocumentRouter } from "./document-routes.js";
import { createExpertRouter } from "./expert-routes.js";
import { createHttpSecurityMiddleware } from "./http-security.js";
import { createPartnerRouter } from "./partner-routes.js";
import { createProductHomeHandler } from "./product-home.js";
import { createPublicOperationRouter } from "./public-operation-routes.js";
import { createRateLimiter } from "./rate-limit.js";
import { createSecureSummaryRouter } from "./secure-summary-routes.js";
import { createSessionSecurity } from "./session-security.js";

export function createApplication({ rootDir, env = process.env, warn = console.warn } = {}) {
  if (typeof rootDir !== "string" || !rootDir) throw new Error("application_root_dir_required");

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(createHttpSecurityMiddleware());

  const sessionSecurity = createSessionSecurity({ env });
  if (sessionSecurity.generatedAdminToken) {
    warn("⚠️  운영 모드 + ADMIN_TOKEN 미설정 → 관리자 로그인 비활성(무작위 토큰). 환경변수를 설정하세요.");
  }
  const rateLimiter = createRateLimiter();
  const { rateLimit } = rateLimiter;
  const {
    adminToken,
    sessionSecret,
    sessionTtl,
    parseCookies,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
  } = sessionSecurity;
  const clean = (value) => (typeof value === "string" ? value.slice(0, 2000).trim() : "");

  app.use("/api/cases", rateLimit({ windowMs: 60000, max: 30 }), createCaseRouter());
  if (!AI_ENABLED) warn("⚠️  AI 키 미설정(ANTHROPIC_API_KEY/GEMINI_API_KEY) → 데모 모드로 동작합니다(프론트가 목업 응답 사용).");
  app.use("/api", createAiRouter({ rateLimit }));
  app.use("/api", createExpertRouter({ rootDir }));
  app.use("/api", createDocumentRouter());
  app.use("/api", createPublicOperationRouter({ rateLimit, clean }));
  app.use("/api", createAdminRouter({
    rateLimit,
    clean,
    adminToken,
    sessionTtl,
    parseCookies,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
  }));
  app.use("/api", createPartnerRouter({
    rateLimit,
    clean,
    sessionTtl,
    parseCookies,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
  }));
  app.use(createSecureSummaryRouter({ sessionSecret }));

  app.get("/api/health", (_req, res) => res.json({ ai: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null }));
  const productHomeHandler = createProductHomeHandler(rootDir);
  app.get(["/", "/index.html"], productHomeHandler);
  app.use(express.static(rootDir, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate");
    },
  }));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
    return res.status(404).set("Content-Type", "text/html; charset=utf-8").send(
      renderBrandedPage(
        "페이지를 찾을 수 없습니다",
        renderStateMarkup("🧭", "페이지를 찾을 수 없어요", `요청하신 주소가 없습니다. <a href="/">인사야 홈으로</a> 돌아가 상담·계산·문서를 이용해 보세요.`),
      ),
    );
  });

  return {
    app,
    runtime: {
      aiEnabled: AI_ENABLED,
      aiInfo: AI_INFO,
      sessionSecurity,
      rateLimiter,
    },
  };
}