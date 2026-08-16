import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");

test("CI runs for stacked pull requests without weakening main-only production smoke", () => {
  const pullRequestSection = workflow.match(/\n  pull_request:\n([\s\S]*?)\n\npermissions:/)?.[1] || "";

  assert.match(pullRequestSection, /types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.doesNotMatch(pullRequestSection, /branches:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /production-smoke:\n    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
});
