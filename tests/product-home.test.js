import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";

import {
  PRODUCT_HOME_CONTENT_SCRIPT,
  PRODUCT_HOME_SCRIPT,
  createProductHomeHandler,
  injectProductHomeContentScript,
  injectProductHomeScript,
  prepareProductHomeHtml,
  replaceLegacyHomeNavigationSource,
} from "../lib/product-home.js";

test("product home script injection is idempotent", () => {
  const source = "<!doctype html><html><head></head><body><main>home</main></body></html>";
  const onceInjected = injectProductHomeScript(injectProductHomeContentScript(source));
  const twiceInjected = injectProductHomeScript(injectProductHomeContentScript(onceInjected));

  assert.equal(onceInjected.includes(PRODUCT_HOME_CONTENT_SCRIPT), true);
  assert.equal(onceInjected.indexOf(PRODUCT_HOME_CONTENT_SCRIPT) < onceInjected.indexOf("</head>"), true);
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

test("product home handler serves transformed index with content source and Case launcher", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-home-"));
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head></head><body><h1>인사야</h1><script>\nconst SITES={\n worker:{wm:'근로자'}\n};\nconst CATS={\n worker:[], employer:[]\n};\nlet currentSite=null;\n</script></body></html>`);
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
  assert.equal(html.includes(PRODUCT_HOME_SCRIPT), true);
  assert.match(html, /window\.INSAYA_HOME_NAV/);
});

test("prepareProductHomeHtml applies content migration and both injections once", () => {
  const source = `<!doctype html><html><head></head><body><script>\nconst SITES={};\nconst CATS={\n worker:[], employer:[]\n};\nlet currentSite=null;\n</script></body></html>`;
  const first = prepareProductHomeHtml(source);
  const second = prepareProductHomeHtml(first);
  assert.equal(second, first);
  assert.equal((first.match(/home-navigation\.js/g) || []).length, 1);
  assert.equal((first.match(/wage-intake-launcher\.js/g) || []).length, 1);
});