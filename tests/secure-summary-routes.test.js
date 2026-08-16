import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createSecureSummaryRouter, telephoneHref } from "../lib/secure-summary-routes.js";
import { escapeHtml, renderBrandedPage, renderStateMarkup } from "../lib/branded-page.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function withServer(router, run) {
  const app = express();
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("secure summary router requires the server session secret", () => {
  assert.throws(() => createSecureSummaryRouter({}), /secure_summary_session_secret_required/);
});

test("invalid secure-summary token preserves branded 404 contract", async () => {
  await withServer(createSecureSummaryRouter({ sessionSecret: "test-secret" }), async (base) => {
    const response = await fetch(`${base}/r/__missing_summary_token__`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    const html = await response.text();
    assert.match(html, /유효하지 않은 링크예요/);
    assert.match(html, /인사야/);
    assert.match(html, /noindex/);
  });
});

test("shared branded page renderer escapes user-controlled text helpers", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(telephoneHref("010-1234-5678"), "01012345678");
  assert.equal(telephoneHref("12"), "");
  assert.match(renderBrandedPage("테스트", renderStateMarkup("!", "상태", "설명")), /상태/);
});

test("application composition delegates secure summary links and branded 404 rendering", () => {
  const application = readFileSync(path.join(ROOT, "lib/application.js"), "utf8");
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(application, /import \{ createSecureSummaryRouter \} from "\.\/secure-summary-routes\.js"/);
  assert.match(application, /import \{ renderBrandedPage, renderStateMarkup \} from "\.\/branded-page\.js"/);
  assert.match(application, /app\.use\(createSecureSummaryRouter\(\{ sessionSecret \}\)\)/);
  assert.doesNotMatch(application, /app\.get\("\/r\/:token"/);
  assert.doesNotMatch(application, /function rPage|function rState|const telHref|const esc =/);
  assert.match(server, /createApplication/);
});