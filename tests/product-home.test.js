import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";

import {
  PRODUCT_HOME_SCRIPT,
  createProductHomeHandler,
  injectProductHomeScript,
} from "../lib/product-home.js";

test("product home script injection is idempotent", () => {
  const source = "<!doctype html><html><body><main>home</main></body></html>";
  const onceInjected = injectProductHomeScript(source);
  const twiceInjected = injectProductHomeScript(onceInjected);

  assert.equal(onceInjected.includes(PRODUCT_HOME_SCRIPT), true);
  assert.equal(onceInjected.indexOf(PRODUCT_HOME_SCRIPT) < onceInjected.indexOf("</body>"), true);
  assert.equal(twiceInjected, onceInjected);
});

test("product home handler serves index with wage intake launcher", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-home-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body><h1>인사야</h1></body></html>");
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
  assert.equal(html.includes(PRODUCT_HOME_SCRIPT), true);
});
