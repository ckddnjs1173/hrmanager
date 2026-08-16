import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FACTS_2026 } from "../lib/knowledge.js";
import { selectMinimumWageRule } from "../lib/legal-rules.js";
import { extractLegacyContent } from "../lib/legacy-content-reader.js";
import { STATUTORY_FACTS_2026, validateLegacyC26 } from "../lib/statutory-facts.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("AI knowledge stays aligned with the canonical 2026 statutory fact contract", () => {
  assert.deepEqual(FACTS_2026, STATUTORY_FACTS_2026);
});

test("legacy calculator constants stay aligned with the canonical 2026 statutory fact contract", () => {
  const { C26 } = extractLegacyContent(INDEX_HTML, ["C26"]);
  const validation = validateLegacyC26(C26);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
});

test("deterministic minimum-wage rule agrees with the shared 2026 statutory baseline", () => {
  const rule = selectMinimumWageRule("2026-08-16");
  assert.ok(rule);
  assert.equal(rule.hourly, STATUTORY_FACTS_2026.minWageHour);
  assert.equal(rule.daily8h, STATUTORY_FACTS_2026.minWageDay);
  assert.equal(rule.monthly209h, STATUTORY_FACTS_2026.minWageMonth);
});
