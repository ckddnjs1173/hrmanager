import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("canonical home content sources remain part of the runtime release contract", () => {
  for (const file of ["content/home-navigation.js", "content/guide-catalog.js", "lib/product-home.js"]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `missing canonical content source: ${file}`);
  }

  const productHome = read("lib/product-home.js");
  assert.match(productHome, /\/content\/home-navigation\.js/);
  assert.match(productHome, /\/content\/guide-catalog\.js/);
  assert.match(productHome, /replaceLegacyHomeNavigationSource/);
  assert.match(productHome, /replaceLegacyGuideCatalogSource/);
  assert.match(productHome, /INSAYA_HOME_NAV/);
  assert.match(productHome, /INSAYA_GUIDE_CATALOG/);
});
