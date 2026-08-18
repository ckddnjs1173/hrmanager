import express from "express";
import { AI_ENABLED, AI_INFO } from "./ai.js";
import { renderBrandedPage, renderStateMarkup } from "./branded-page.js";
import { createAdminLegalMonitorRouter } from "./admin-legal-monitor-routes.js";
import { createAdminLegalRouter } from "./admin-legal-routes.js";
import { createAdminRouter } from "./admin-routes.js";
import { createAiRouter } from "./ai-routes.js";
import { createCaseRouter } from "./case-routes.js";
import { createDocumentRouter } from "./document-routes.js";
import { createExpertRouter } from "./expert-routes.js";
import { createApplicationErrorHandler, createRequestContextMiddleware } from "./http-error-boundary.js";
import { createHttpSecurityMiddleware } from "./http-security.js";
import { createPartnerRouter } from "./partner-routes.js";
import { createProductHomeHandler } from "./product-home.js";
import { createPublicOperationRouter } from "./public-operation-routes.js";
import { createRateLimiter } from "./rate-limit.js";
import { getRuntimeReadiness } from "./runtime-readiness.js";
import { createSaasAdvisorCollaborationRouter } from "./saas-advisor-collaboration-routes.js";
import { createSaasComplianceCloseRouter } from "./saas-compliance-close-routes.js";
import { createSaasEmailRouter } from "./saas-email-routes.js";
import { createSaasRiskRouter } from "./saas-risk-routes.js";
import { createSaasRouter } from "./saas-routes.js";
import { createSecureSummaryRouter } from "./secure-summary-routes.js";
import { createSessionSecurity } from "./session-security.js";
import { createUserFacingPageHandler } from "./user-facing-page.js";

const WORKER_CASE_PAGES = Object.freeze([
  { slug: "wage-intake", file: "wage-intake.html" },
  { slug: "dismissal-intake", file: "dismissal-intake.html" },
  { slug: "retirement-intake", file: "retirement-intake.html" },
  { slug: "worktime-intake", file: "worktime-intake.html" },
  { slug: "annual-leave-intake", file: "annual-leave-intake.html" },
]);

export function createApplication({ rootDir, env = process.env, warn = console.warn } = {}) {
  if (typeof rootDir !== "string" || !rootDir) throw new Error("application_root_dir_required");

  const app = express();
  app.set("trust proxy", 1);
  app.use(createRequestContextMiddleware());
  app.use(createHttpSecurityMiddleware());
  app.use(express.json({ limit: "1mb" }));

  const sessionSecurity = createSessionSecurity({ env });
  if (sessionSecurity.generatedAdminToken) warn("⚠️  운영 모드 + ADMIN_TOKEN 미설정 → 관리자 로그인 비활성(무작위 토큰). 환경변수를 설정하세요.");
  const rateLimiter = createRateLimiter();
  const { rateLimit } = rateLimiter;
  const { adminToken, sessionSecret, sessionTtl, parseCookies, verifySession, setSessionCookie, clearSessionCookie } = sessionSecurity;
  const clean = (value) => (typeof value === "string" ? value.slice(0, 2000).trim() : "");

  app.get("/api/health", (_req, res) => res.json({ ai: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null }));
  app.get("/api/readiness", async (_req, res) => {
    const readiness = await getRuntimeReadiness({ env });
    res.status(readiness.ready ? 200 : 503).json(readiness);
  });

  app.use("/api/cases", rateLimit({ windowMs: 60000, max: 30 }), createCaseRouter());
  // Fully configured production email delivery gets first chance at login and invitation routes.
  // When email delivery or SaaS is disabled it calls next("route"), preserving the existing
  // development debug-token path and production fail-closed behavior.
  app.use("/api/saas", createSaasEmailRouter({ env, rateLimit }));
  app.use("/api/saas", createSaasRouter({ env, rateLimit }));
  app.use("/api/saas", createSaasRiskRouter({ env, rateLimit }));
  app.use("/api/saas", createSaasComplianceCloseRouter({ env }));
  app.use("/api/saas", createSaasAdvisorCollaborationRouter({ env, rateLimit }));
  if (!AI_ENABLED) warn("⚠️  AI 키 미설정(ANTHROPIC_API_KEY/GEMINI_API_KEY) → 데모 모드로 동작합니다(프론트가 목업 응답 사용).");
  app.use("/api", createAiRouter({ rateLimit }));
  app.use("/api", createExpertRouter({ rootDir }));
  app.use("/api", createDocumentRouter());
  app.use("/api", createPublicOperationRouter({ rateLimit, clean }));
  app.use("/api", createAdminRouter({ rateLimit, clean, adminToken, sessionTtl, parseCookies, verifySession, setSessionCookie, clearSessionCookie }));
  app.use("/api", createAdminLegalRouter({ adminToken, parseCookies, verifySession }));
  app.use("/api", createAdminLegalMonitorRouter({ adminToken, parseCookies, verifySession }));
  app.use("/api", createPartnerRouter({ rateLimit, clean, sessionTtl, parseCookies, verifySession, setSessionCookie, clearSessionCookie }));
  app.use(createSecureSummaryRouter({ sessionSecret }));

  const productHomeHandler = createProductHomeHandler(rootDir);
  const saasStyles = ["/assets/brand/saas-ui.css"];
  const caseStyles = ["/assets/brand/case-ui.css"];
  app.get(["/", "/index.html"], productHomeHandler);
  app.get("/business.html", createUserFacingPageHandler(rootDir, "business.html", {
    styles: saasStyles,
    scripts: ["/business-production-invite.js"],
  }));
  app.get("/advisor.html", createUserFacingPageHandler(rootDir, "advisor.html", {
    styles: saasStyles,
    scripts: ["/advisor-production-auth.js"],
  }));
  app.get("/business-login.html", createUserFacingPageHandler(rootDir, "business-login.html", { styles: saasStyles }));
  for (const page of WORKER_CASE_PAGES) {
    app.get([`/${page.slug}`, `/${page.file}`], createUserFacingPageHandler(rootDir, page.file, { styles: caseStyles }));
  }
  app.use(express.static(rootDir, {
    extensions: ["html"],
    setHeaders: (res, filePath) => { if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, must-revalidate"); },
  }));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "not_found" });
    return res.status(404).set("Content-Type", "text/html; charset=utf-8").send(
      renderBrandedPage("페이지를 찾을 수 없습니다", renderStateMarkup("🧭", "페이지를 찾을 수 없어요", `요청하신 주소가 없습니다. <a href="/">인사야 홈으로</a> 돌아가 상담·계산·문서를 이용해 보세요.`)),
    );
  });

  app.use(createApplicationErrorHandler({
    warn,
    renderHtml: ({ requestId }) => renderBrandedPage("요청을 처리하지 못했습니다", renderStateMarkup("⚠️", "요청을 처리하지 못했어요", `잠시 후 다시 시도해 주세요.<br><small>요청 ID ${requestId}</small>`)),
  }));

  return { app, runtime: { aiEnabled: AI_ENABLED, aiInfo: AI_INFO, sessionSecurity, rateLimiter } };
}
