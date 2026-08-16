import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../business.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../business.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../business.css", import.meta.url), "utf8");

test("Business workspace has the required product surfaces", () => {
  for (const id of [
    "disabled-view",
    "login-view",
    "workspace-view",
    "org-picker",
    "risk-scan-button",
    "view-dashboard",
    "view-risks",
    "view-actions",
    "view-people",
    "view-setup",
    "profile-form",
    "workplace-form",
    "scope-form",
    "employee-form",
  ]) assert.match(html, new RegExp(`id=[\"']${id}[\"']`), `missing Business UI element: ${id}`);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /인사야 Business/);
});

test("Business workspace only talks to feature-gated SaaS APIs", () => {
  assert.match(js, /const API = [\"']\/api\/saas[\"']/);
  for (const endpoint of [
    "/auth/me",
    "/auth/magic-link",
    "/organizations",
    "/onboarding",
    "/business-profile",
    "/workplaces",
    "/compliance-scopes",
    "/employees",
    "/risk-scan",
    "/risks",
    "/actions",
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

test("Business async forms retain stable form references across await boundaries", () => {
  assert.doesNotMatch(js, /e\.currentTarget\.(?:reset|hidden)/);
  assert.match(js, /const form=e\.currentTarget/);
});

test("Business organization picker uses the public API response shape", () => {
  assert.match(js, /organization\.displayName/);
  assert.match(js, /organization\.legalName/);
  assert.doesNotMatch(js, /organization\.display_name/);
});

test("Business styles are standalone and responsive", () => {
  assert.match(css, /\.workspace/);
  assert.match(css, /\.metric-grid/);
  assert.match(css, /@media\(max-width:760px\)/);
});
