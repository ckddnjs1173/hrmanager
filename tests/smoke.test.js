import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listDocs, listPacks } from "../lib/docs.js";
import { classifyTopics } from "../lib/knowledge.js";
import { SUMMARY_SCHEMA } from "../lib/prompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (err) {
      lastError = err;
    }
    await sleep(120);
  }
  throw lastError || new Error(`health check timeout: ${url}`);
}

test("document catalog is available", () => {
  const docs = listDocs();
  const packs = listPacks();
  assert.ok(Array.isArray(docs));
  assert.ok(docs.length >= 20, `expected at least 20 documents, got ${docs.length}`);
  assert.ok(Array.isArray(packs));
  assert.ok(packs.length >= 1, "expected at least one document pack");
});

test("wage-related text is classified into at least one knowledge topic", () => {
  const topics = classifyTopics("퇴사했는데 월급을 아직 못 받았어요");
  assert.ok(Array.isArray(topics));
  assert.ok(topics.length >= 1, "expected wage-related knowledge classification");
});

test("summary schema retains core case fields", () => {
  for (const key of ["caseType", "facts", "issues", "checklist", "documents", "estimatedAmount"]) {
    assert.ok(SUMMARY_SCHEMA.properties[key], `missing SUMMARY_SCHEMA property: ${key}`);
  }
});

test("server boots and product entry points respond", { timeout: 12000 }, async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "insaya-smoke-"));
  const port = 33000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DB_PATH: path.join(dir, "app.db"),
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      GROQ_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  t.after(() => {
    if (!child.killed) child.kill();
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  const base = `http://127.0.0.1:${port}`;
  const res = await waitForHealth(`${base}/api/health`);
  assert.equal(res.status, 200, stderr);
  const body = await res.json();
  assert.equal(typeof body.ai, "boolean");

  const homeRes = await fetch(`${base}/`);
  assert.equal(homeRes.status, 200, stderr);
  const homeHtml = await homeRes.text();
  assert.match(homeHtml, /<script type="module" src="\/wage-intake-launcher\.js"><\/script>/);

  const wageRes = await fetch(`${base}/wage-intake`);
  assert.equal(wageRes.status, 200, stderr);
  const wageHtml = await wageRes.text();
  assert.match(wageHtml, /id="wageApp"/);
  assert.match(wageHtml, /wage-intake-client\.js/);

  const dismissalRes = await fetch(`${base}/dismissal-intake`);
  assert.equal(dismissalRes.status, 200, stderr);
  const dismissalHtml = await dismissalRes.text();
  assert.match(dismissalHtml, /id="dismissalApp"/);
  assert.match(dismissalHtml, /dismissal-intake-client\.js/);
});
