import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";

import {
  PRODUCT_GUIDE_CATALOG_SCRIPT,
  PRODUCT_HOME_CONTENT_SCRIPT,
  PRODUCT_HOME_SCRIPT,
  createProductHomeHandler,
  injectProductGuideCatalogScript,
  injectProductHomeContentScript,
  injectProductHomeScript,
  prepareProductHomeHtml,
  replaceLegacyGuideCatalogSource,
  replaceLegacyHomeNavigationSource,
} from "../lib/product-home.js";

test("product home script injection is idempotent", () => {
  const source = "<!doctype html><html><head></head><body><main>home</main></body></html>";
  const onceInjected = injectProductHomeScript(
    injectProductGuideCatalogScript(injectProductHomeContentScript(source)),
  );
  const twiceInjected = injectProductHomeScript(
    injectProductGuideCatalogScript(injectProductHomeContentScript(onceInjected)),
  );

  assert.equal(onceInjected.includes(PRODUCT_HOME_CONTENT_SCRIPT), true);
  assert.equal(onceInjected.includes(PRODUCT_GUIDE_CATALOG_SCRIPT), true);
  assert.equal(onceInjected.indexOf(PRODUCT_HOME_CONTENT_SCRIPT) < onceInjected.indexOf("</head>"), true);
  assert.equal(onceInjected.indexOf(PRODUCT_GUIDE_CATALOG_SCRIPT) < onceInjected.indexOf("</head>"), true);
  assert.equal(onceInjected.includes(PRODUCT_HOME_SCRIPT), true);
  assert.equal(onceInjected.indexOf(PRODUCT_HOME_SCRIPT) < onceInjected.indexOf("</body>"), true);
  assert.equal(twiceInjected, onceInjected);
});

test("legacy home navigation definitions are replaced by canonical content bindings", () => {
  const source = `<script>\nconst SITES={\n  worker:{wm:'근로자'}\n};\nconst CATS={\n  worker:[], employer:[]\n};\nlet currentSite=null;\nfunction setSite(){}\n</script>`;
  const migrated = replaceLegacyHomeNavigationSource(source);

  assert.doesNotMatch(migrated, /const SITES=\{\s*worker:/);
  assert.match(migrated, /window\.INSAYA_HOME_NAV\?\.SITES/);
  assert.match(migrated, /window\.INSAYA_HOME_NAV\?\.CATS\?\.worker/);
  assert.match(migrated, /item\.action\?\{go:\(\)=>nav\(item\.action\)\}/);
  assert.match(migrated, /let currentSite=null/);
});

test("legacy guide topic definitions are replaced by the canonical catalog binding", () => {
  const source = `<script>\nconst TOPICS={\n  worker:[{k:'wage'}],\n  employer:[{k:'emp_risk'}]\n};\nfunction renderHub(which){}\n</script>`;
  const migrated = replaceLegacyGuideCatalogSource(source);

  assert.doesNotMatch(migrated, /const TOPICS=\{\s*worker:/);
  assert.match(migrated, /window\.INSAYA_GUIDE_CATALOG\?\.TOPICS/);
  assert.match(migrated, /worker:\[\],employer:\[\]/);
  assert.match(migrated, /function renderHub\(which\)/);
});

test("product home handler preserves the working inline runtime while loading canonical sources and Case launcher", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-home-"));
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head></head><body><h1>인사야</h1><script>\nconst SITES={\n worker:{wm:'근로자'}\n};\nconst CATS={\n worker:[], employer:[]\n};\nlet currentSite=null;\nconst TOPICS={\n worker:[{k:'wage'}], employer:[]\n};\nfunction renderHub(which){}\n</script></body></html>`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const app = express();
  app.get("/", createProductHomeHandler(dir));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(response.headers.get("cache-control") || "", /no-cache/);
  assert.equal(html.includes(PRODUCT_HOME_CONTENT_SCRIPT), true);
  assert.equal(html.includes(PRODUCT_GUIDE_CATALOG_SCRIPT), true);
  assert.equal(html.includes(PRODUCT_HOME_SCRIPT), true);
  assert.match(html, /const SITES=\{/);
  assert.match(html, /const CATS=\{/);
  assert.match(html, /const TOPICS=\{/);
  assert.doesNotMatch(html, /window\.INSAYA_HOME_NAV\?\.SITES/);
  assert.doesNotMatch(html, /window\.INSAYA_GUIDE_CATALOG\?\.TOPICS/);
});

test("prepareProductHomeHtml safely injects release assets once without regex-rewriting inline runtime", () => {
  const source = `<!doctype html><html><head></head><body><script>\nconst SITES={};\nconst CATS={\n worker:[], employer:[]\n};\nlet currentSite=null;\nconst TOPICS={\n worker:[], employer:[]\n};\nfunction renderHub(which){}\n</script></body></html>`;
  const first = prepareProductHomeHtml(source);
  const second = prepareProductHomeHtml(first);

  assert.equal(second, first);
  assert.equal((first.match(/home-navigation\.js/g) || []).length, 1);
  assert.equal((first.match(/guide-catalog\.js/g) || []).length, 1);
  assert.equal((first.match(/wage-intake-launcher\.js/g) || []).length, 1);
  assert.match(first, /const SITES=\{\}/);
  assert.match(first, /const TOPICS=\{/);
});
