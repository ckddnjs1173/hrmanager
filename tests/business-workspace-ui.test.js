import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../business.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../business.js", import.meta.url), "utf8");
const advisorJs = fs.readFileSync(new URL("../business-advisor.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../business.css", import.meta.url), "utf8");

test("Business workspace has the required product surfaces", () => {
  for (const id of [
    "disabled-view", "login-view", "workspace-view", "org-picker", "risk-scan-button",
    "view-dashboard", "view-risks", "view-actions", "view-calendar", "view-notifications", "view-people", "view-setup",
    "metric-overdue", "calendar-overdue", "calendar-today", "calendar-next7", "calendar-scheduled", "calendar-list",
    "notification-nav-count", "notification-unread-label", "notification-refresh", "notification-list",
    "profile-form", "workplace-form", "scope-form", "employee-form",
  ]) assert.match(html, new RegExp(`id=[\"']${id}[\"']`), `missing Business UI element: ${id}`);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /인사야 Business/);
});

test("Business workspace only talks to feature-gated SaaS APIs", () => {
  assert.match(js, /const API = [\"']\/api\/saas[\"']/);
  for (const endpoint of [
    "/auth/me", "/auth/magic-link", "/organizations", "/onboarding", "/business-profile",
    "/workplaces", "/compliance-scopes", "/employees", "/risk-scan", "/risks", "/actions",
    "/due-date", "/compliance-calendar", "/notifications", "/read",
  ]) assert.ok(js.includes(endpoint), `missing SaaS API usage: ${endpoint}`);
  assert.match(js, /credentials:\s*[\"']same-origin[\"']/);
  assert.match(js, /x-csrf-token/);
});

test("Business workspace preserves the Risk -> Action -> re-evaluation product contract", () => {
  assert.match(js, /requiresRiskReevaluation/);
  assert.match(js, /다음 Risk Scan에서 실제 해소 여부를 다시 확인/);
  assert.match(js, /UNCERTAIN/);
  assert.match(html, /정보가 부족한 경우 위반으로 단정하지 않습니다/);
});

test("Business Calendar clearly distinguishes internal management dates from legal deadlines", () => {
  assert.match(html, /내부 관리 기한/);
  assert.match(html, /법정기한/);
  assert.match(js, /MANUAL_INTERNAL/);
  assert.match(js, /내부 관리 기한 · 법정기한으로 표시되지 않습니다/);
  assert.match(js, /timingStatus/);
});

test("Business notification inbox exposes unread and read flows without external delivery claims", () => {
  assert.match(html, /7일·3일·1일 전/);
  assert.match(html, /중복 생성하지 않습니다/);
  assert.match(js, /unreadCount/);
  assert.match(js, /data-notification-read/);
  assert.match(js, /알림을 읽음 처리했습니다/);
  assert.doesNotMatch(html + js, /SMS 전송 완료|이메일 전송 완료/);
});

test("Business async forms retain stable form references across await boundaries", () => {
  assert.doesNotMatch(js, /e\.currentTarget\.(?:reset|hidden)/);
  assert.match(js, /const form=e\.currentTarget/);
});

test("Advisor collaboration ignores stale list responses and reports success only after refresh", () => {
  assert.match(advisorJs, /loadSeq:\s*0/);
  assert.match(advisorJs, /const loadSeq=\+\+collab\.loadSeq/);
  assert.match(advisorJs, /loadSeq!==collab\.loadSeq/);
  assert.match(advisorJs, /const refreshed=await loadCollaboration\(\{quiet:true\}\)/);
  assert.match(advisorJs, /Case는 생성됐지만 목록 새로고침에 실패했습니다/);
  assert.match(advisorJs, /초대는 생성됐지만 목록 새로고침에 실패했습니다/);
  const invitationRefresh = advisorJs.indexOf("const refreshed=await loadCollaboration({quiet:true});", advisorJs.indexOf("async function issueInvitation"));
  const invitationVisible = advisorJs.indexOf("box.hidden=false", advisorJs.indexOf("async function issueInvitation"));
  assert.ok(invitationRefresh >= 0 && invitationVisible > invitationRefresh, "one-time invite link must appear only after the post-mutation refresh attempt");
});

test("Business organization picker uses the public API response shape", () => {
  assert.match(js, /organization\.displayName/);
  assert.match(js, /organization\.legalName/);
  assert.doesNotMatch(js, /organization\.display_name/);
});

test("Business styles are standalone and responsive", () => {
  assert.match(css, /\.workspace/);
  assert.match(css, /\.metric-grid/);
  assert.match(css, /\.calendar-item/);
  assert.match(css, /\.due-date-form/);
  assert.match(css, /@media\(max-width:760px\)/);
});
