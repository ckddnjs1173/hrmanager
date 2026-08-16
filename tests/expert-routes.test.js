import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createExpertRouter, seedNomusa } from "../lib/expert-routes.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function withServer(router, run) {
  const app = express();
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("public expert router preserves /api/nomu response shape", async () => {
  const emptyRoot = mkdtempSync(path.join(os.tmpdir(), "insaya-expert-router-"));
  try {
    await withServer(createExpertRouter({ rootDir: emptyRoot }), async (base) => {
      const response = await fetch(`${base}/api/nomu?region=%20서울%20`);
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(await response.json()));
    });
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("expert seed is fail-safe when source data is unavailable", () => {
  const emptyRoot = mkdtempSync(path.join(os.tmpdir(), "insaya-expert-seed-"));
  try {
    assert.deepEqual(seedNomusa({ rootDir: emptyRoot }), { seeded: 0, skipped: true });
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("application composition delegates public expert route and startup seed to expert router", () => {
  const application = readFileSync(path.join(ROOT, "lib/application.js"), "utf8");
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(application, /import \{ createExpertRouter \} from "\.\/expert-routes\.js"/);
  assert.match(application, /app\.use\("\/api", createExpertRouter\(\{ rootDir \}\)\)/);
  assert.doesNotMatch(application, /app\.get\("\/api\/nomu"/);
  assert.doesNotMatch(application, /function seedNomusa|\(function seedNomusa/);
  assert.doesNotMatch(server, /data", "nomusa\.json/);
  assert.match(server, /createApplication/);
});