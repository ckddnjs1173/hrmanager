import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("main production smoke waits for exact SHA then runs HTTP security and SEO checks", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const readiness = workflow.indexOf("node scripts/readiness-production-smoke.mjs");
  const security = workflow.indexOf("node scripts/production-http-security-smoke.mjs");
  const product = workflow.indexOf("node scripts/production-smoke.mjs");

  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /EXPECTED_COMMIT: \$\{\{ github\.sha \}\}/);
  assert.ok(readiness >= 0, "exact-SHA readiness smoke must be present");
  assert.ok(security > readiness, "HTTP security smoke must run after exact-SHA readiness succeeds");
  assert.ok(product > security, "product smoke must remain after HTTP security validation");
});
