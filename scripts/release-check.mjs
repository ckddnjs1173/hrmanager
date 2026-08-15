import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  "server.js",
  "wage-intake.html",
  "wage-intake-client.js",
  "wage-workspace.js",
  "wage-report-ui.js",
  "dismissal-intake.html",
  "dismissal-intake-client.js",
  "dismissal-intake.css",
  "retirement-intake.html",
  "retirement-intake-client.js",
  "retirement-intake.css",
  "worktime-intake.html",
  "worktime-intake-client.js",
  "worktime-intake.css",
  "scripts/browser-e2e.mjs",
  "scripts/write-build-info.mjs",
  "scripts/production-smoke.mjs",
  "lib/case-routes.js",
  "lib/wage-intake-service.js",
  "lib/wage-money.js",
  "lib/legal-rules.js",
  "lib/wage-resources.js",
  "lib/wage-report.js",
  "lib/dismissal-intake.js",
  "lib/dismissal-rules.js",
  "lib/dismissal-actions.js",
  "lib/dismissal-resources.js",
  "lib/dismissal-report.js",
  "lib/dismissal-service.js",
  "lib/retirement-intake.js",
  "lib/retirement-rules.js",
  "lib/retirement-actions.js",
  "lib/retirement-resources.js",
  "lib/retirement-report.js",
  "lib/retirement-service.js",
  "lib/worktime-intake.js",
  "lib/worktime-rules.js",
  "lib/worktime-actions.js",
  "lib/worktime-resources.js",
  "lib/worktime-report.js",
  "lib/worktime-service.js",
];

const failures = [];
const warnings = [];

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  failures.push(`Node 22.13+ required; current ${process.versions.node}`);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing required file: ${file}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!String(packageJson.scripts?.build || "").includes("write-build-info.mjs")) {
  failures.push("build script must emit Render build-info metadata");
}

const wageLegalText = fs.readFileSync(path.join(root, "lib/legal-rules.js"), "utf8");
if (!wageLegalText.includes("minimumwage.go.kr")) failures.push("minimum wage official source is missing");
if (!wageLegalText.includes("law.go.kr")) failures.push("National Law Information Center wage source is missing");

const dismissalLegalText = fs.readFileSync(path.join(root, "lib/dismissal-rules.js"), "utf8");
for (const article of ["제23조", "제26조", "제27조", "제28조"]) {
  if (!dismissalLegalText.includes(article)) failures.push(`dismissal legal source missing: ${article}`);
}
if (!dismissalLegalText.includes("nlrc.go.kr")) failures.push("dismissal labor-board source is missing");

const retirementLegalText = fs.readFileSync(path.join(root, "lib/retirement-rules.js"), "utf8");
for (const article of ["제4조", "제8조", "제9조", "제15조", "제20조"]) {
  if (!retirementLegalText.includes(article)) failures.push(`retirement legal source missing: ${article}`);
}
if (!retirementLegalText.includes("moel.go.kr")) failures.push("retirement MOEL calculator source is missing");
if (!retirementLegalText.includes("law.go.kr")) failures.push("retirement National Law Information Center source is missing");

const worktimeLegalText = fs.readFileSync(path.join(root, "lib/worktime-rules.js"), "utf8");
for (const article of ["제50조", "제53조", "제54조", "제55조", "제56조"]) {
  if (!worktimeLegalText.includes(article)) failures.push(`working-time legal source missing: ${article}`);
}
if (!worktimeLegalText.includes("별표 1")) failures.push("working-time small-workplace scope source is missing");
if (!worktimeLegalText.includes("law.go.kr")) failures.push("working-time National Law Information Center source is missing");

const wageWorkspaceText = fs.readFileSync(path.join(root, "wage-workspace.js"), "utf8");
if (!wageWorkspaceText.includes("sessionStorage")) failures.push("wage workspace must use sessionStorage for case access");
if (wageWorkspaceText.includes("localStorage")) failures.push("wage workspace must not persist the case token in localStorage");
if (!wageWorkspaceText.includes("textContent = result.document")) failures.push("wage document preview must use plain text rendering");

const dismissalClientText = fs.readFileSync(path.join(root, "dismissal-intake-client.js"), "utf8");
if (!dismissalClientText.includes("sessionStorage")) failures.push("dismissal workspace must use sessionStorage for case access");
if (dismissalClientText.includes("localStorage")) failures.push("dismissal workspace must not persist the case token in localStorage");
if (!dismissalClientText.includes('querySelector("pre").textContent')) failures.push("dismissal document preview must use plain text rendering");

const retirementClientText = fs.readFileSync(path.join(root, "retirement-intake-client.js"), "utf8");
if (!retirementClientText.includes("sessionStorage")) failures.push("retirement workspace must use sessionStorage for case access");
if (retirementClientText.includes("localStorage")) failures.push("retirement workspace must not persist the case token in localStorage");
if (!retirementClientText.includes('querySelector("pre").textContent')) failures.push("retirement document preview must use plain text rendering");

const worktimeClientText = fs.readFileSync(path.join(root, "worktime-intake-client.js"), "utf8");
if (!worktimeClientText.includes("sessionStorage")) failures.push("working-time workspace must use sessionStorage for case access");
if (worktimeClientText.includes("localStorage")) failures.push("working-time workspace must not persist the case token in localStorage");
if (!worktimeClientText.includes('querySelector("pre").textContent')) failures.push("working-time document preview must use plain text rendering");

const browserE2E = fs.readFileSync(path.join(root, "scripts/browser-e2e.mjs"), "utf8");
if (!browserE2E.includes("chromium.launch")) failures.push("browser E2E must launch Chromium");
if (!/viewport\s*:\s*\{\s*width\s*:\s*390\s*,\s*height\s*:\s*844\s*\}/.test(browserE2E)) failures.push("browser E2E must include a mobile viewport");
if (!browserE2E.includes("/dismissal-intake")) failures.push("browser E2E must exercise the dismissal Case flow");
if (!browserE2E.includes("/retirement-intake")) failures.push("browser E2E must exercise the retirement Case flow");
if (!browserE2E.includes("/worktime-intake")) failures.push("browser E2E must exercise the working-time Case flow");
if (!browserE2E.includes("사건 요약 복사")) failures.push("browser E2E must exercise Case Report export");

const productionSmoke = fs.readFileSync(path.join(root, "scripts/production-smoke.mjs"), "utf8");
if (!productionSmoke.includes("EXPECTED_COMMIT")) failures.push("production smoke must verify the deployed commit");
if (!productionSmoke.includes("/api/cases/wage-intake")) failures.push("production smoke must exercise the wage Case API");
if (!productionSmoke.includes("/api/cases/dismissal-intake")) failures.push("production smoke must exercise the dismissal Case API");
if (!productionSmoke.includes("/api/cases/retirement-intake")) failures.push("production smoke must exercise the retirement Case API");
if (!productionSmoke.includes("/api/cases/worktime-intake")) failures.push("production smoke must exercise the working-time Case API");
if (!productionSmoke.includes('method: "DELETE"')) failures.push("production smoke must clean up its synthetic Cases");

const renderPath = path.join(root, "render.yaml");
if (fs.existsSync(renderPath)) {
  const renderText = fs.readFileSync(renderPath, "utf8");
  if (/plan:\s*free/.test(renderText) && !/\n\s*disk:\s*\n/.test(renderText)) {
    warnings.push("Render free plan has no active persistent disk; Case data can be lost on redeploy/restart.");
  }
}

if (process.env.NODE_ENV === "production" && process.env.REQUIRE_PERSISTENT_DB === "1" && !process.env.DB_PATH) {
  failures.push("REQUIRE_PERSISTENT_DB=1 but DB_PATH is not configured");
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}

console.log(`✅ release gate passed (${requiredFiles.length} required files)`);
