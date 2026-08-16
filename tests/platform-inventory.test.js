import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateCalculationRegistry } from "../lib/calculation-registry.js";
import { validateDocumentRegistry } from "../lib/document-registry.js";
import { extractLegacyContent } from "../lib/legacy-content-reader.js";
import { getPlatformInventory, validatePlatformInventory } from "../lib/platform-inventory.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function legacy() {
  return extractLegacyContent(INDEX_HTML, ["CALC_META"]);
}

test("Bundle 1 freezes the five Core Cases and existing product capability families", () => {
  const validation = validatePlatformInventory();
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const inventory = getPlatformInventory();
  assert.equal(inventory.coreCases.length, 5);
  assert.equal(inventory.calculators.length, 27);
  assert.equal(inventory.documents.length, 24);
  assert.equal(inventory.documentPacks.length, 7);

  const capabilities = new Set(inventory.capabilities.map((item) => item.id));
  for (const id of [
    "ai.chat",
    "ai.summary",
    "guide.worker",
    "guide.employer",
    "expert.directory",
    "expert.booking",
    "expert.secure_summary",
    "admin.operations",
    "partner.workspace",
  ]) {
    assert.equal(capabilities.has(id), true, `missing platform capability: ${id}`);
  }
});

test("all 27 legacy calculators are represented by the stable calculation registry", () => {
  const { CALC_META } = legacy();
  const validation = validateCalculationRegistry(CALC_META);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(Object.keys(CALC_META).length, 27);
});

test("existing Document Center templates and packs form a valid shared registry", () => {
  const validation = validateDocumentRegistry();
  assert.equal(validation.ok, true, validation.errors.join("\n"));
});
