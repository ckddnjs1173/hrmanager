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
  "lib/case-routes.js",
  "lib/wage-intake-service.js",
  "lib/wage-money.js",
  "lib/legal-rules.js",
  "lib/wage-resources.js",
  "lib/wage-report.js",
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

const legalText = fs.readFileSync(path.join(root, "lib/legal-rules.js"), "utf8");
if (!legalText.includes("minimumwage.go.kr")) failures.push("minimum wage official source is missing");
if (!legalText.includes("law.go.kr")) failures.push("National Law Information Center source is missing");

const workspaceText = fs.readFileSync(path.join(root, "wage-workspace.js"), "utf8");
if (!workspaceText.includes("sessionStorage")) failures.push("wage workspace must use sessionStorage for case access");
if (workspaceText.includes("localStorage")) failures.push("wage workspace must not persist the case token in localStorage");
if (!workspaceText.includes("textContent = result.document")) failures.push("document preview must use plain text rendering");

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
