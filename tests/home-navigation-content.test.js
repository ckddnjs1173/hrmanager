import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("home navigation content source exposes worker and employer IA", () => {
  const source = fs.readFileSync(path.join(ROOT, "content/home-navigation.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "content/home-navigation.js" });
  const data = sandbox.window.INSAYA_HOME_NAV;

  assert.equal(data.SITES.worker.wm, "근로자");
  assert.equal(data.SITES.employer.wm, "사업주");
  assert.ok(data.CATS.worker.length >= 7);
  assert.ok(data.CATS.employer.length >= 6);
  assert.equal(data.CATS.worker.find((category) => category.c === "report")?.action, "report");
  assert.equal(data.CATS.employer.find((category) => category.c === "advice")?.action, "nomu");
});

test("runtime home composition uses the external navigation source for both home URLs", () => {
  const productHome = fs.readFileSync(path.join(ROOT, "lib/product-home.js"), "utf8");
  const application = fs.readFileSync(path.join(ROOT, "lib/application.js"), "utf8");

  assert.match(productHome, /\/content\/home-navigation\.js/);
  assert.match(productHome, /replaceLegacyHomeNavigationSource/);
  assert.match(productHome, /INSAYA_HOME_NAV/);
  assert.match(application, /app\.get\(\["\/", "\/index\.html"\], productHomeHandler\)/);
});