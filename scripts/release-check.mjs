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

const wageWorkspaceText = fs.readFileSync(path.join(root, "wage-workspace.js"), "utf8");
if (!wageWorkspaceText.includes("sessionStorage")) failures.push("wage workspace must use sessionStorage for case access");
if (wageWorkspaceText.includes("localStorage")) failures.push("wage workspace must not persist the case token in localStorage");
if (!wageWorkspaceText.includes("textContent = result.document")) failures.push("wage document preview must use plain text rendering");

const dismissalClientText = fs.readFileSync(path.join(root, "dismissal-intake-client.js"), "utf8");
if (!dismissalClientText.includes("sessionStorage")) failures.push("dismissal workspace must use sessionStorage for case access");
if (dismissalClientText.includes("localStorage")) failures.push("dismissal workspace must not persist the case token in localStorage");
if (!dismissalClientText.includes('querySelector("pre").textContent')) failures.push("dismissal document preview must use plain text rendering");

const browserE2E = fs.readFileSync(path.join(root, "scripts/browser-e2e.mjs"), "utf8");
if (!browserE2E.includes("chromium.launch")) failures.push("browser E2E must launch Chromium");
if (!browserE2E.includes("viewport: { width: 390, height: 844 }")) failures.push("browser E2E must include a mobile viewport");
if (!browserE2E.includes("/dismissal-intake")) failures.push("browser E2E must exercise the dismissal Case flow");
if (!browserE2E.includes("사건 요약 복사")) failures.push("browser E2E must exercise Case Report export");

const productionSmoke = fs.readFileSync(path.join(root, "scripts/production-smoke.mjs"), "utf8");
if (!productionSmoke.includes("EXPECTED_COMMIT")) failures.push("production smoke must verify the deployed commit");
if (!productionSmoke.includes("/api/cases/wage-intake")) failures.push("production smoke must exercise the wage Case API");
if (!productionSmoke.includes("/api/cases/dismissal-intake")) failures.push("production smoke must exercise the dismissal Case API");
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
