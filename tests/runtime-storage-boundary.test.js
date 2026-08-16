import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIVE_MODULES = [
  "lib/application.js",
  "lib/case-routes.js",
  "lib/wage-intake-service.js",
  "lib/dismissal-service.js",
  "lib/retirement-service.js",
  "lib/worktime-service.js",
  "lib/annual-leave-service.js",
  "lib/public-operation-routes.js",
  "lib/admin-routes.js",
  "lib/partner-routes.js",
  "lib/expert-routes.js",
  "lib/secure-summary-routes.js",
  "lib/privacy-operations.js",
  "lib/notify.js",
  "lib/retention-scheduler.js",
];

const LEGACY_DIRECT_IMPORTS = [
  /from ["']\.\/repo\.js["']/,
  /from ["']\.\/case-repo\.js["']/,
  /from ["']\.\/case-access\.js["']/,
  /from ["']\.\/db\.js["']/,
];

test("live HTTP and Case modules depend on async runtime storage facades", () => {
  for (const relative of LIVE_MODULES) {
    const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
    for (const pattern of LEGACY_DIRECT_IMPORTS) {
      assert.doesNotMatch(source, pattern, `${relative} must not bypass the async runtime storage boundary`);
    }
  }
});

test("SQLite legacy adapters remain reachable only from runtime adapter modules", () => {
  const runtimeRepo = fs.readFileSync(path.join(ROOT, "lib/runtime-repo.js"), "utf8");
  const runtimeCaseRepo = fs.readFileSync(path.join(ROOT, "lib/runtime-case-repo.js"), "utf8");
  const runtimeCaseAccess = fs.readFileSync(path.join(ROOT, "lib/runtime-case-access.js"), "utf8");
  assert.match(runtimeRepo, /import\("\.\/repo\.js"\)/);
  assert.match(runtimeCaseRepo, /import\("\.\/case-repo\.js"\)/);
  assert.match(runtimeCaseAccess, /import\("\.\/case-access\.js"\)/);
});
