import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

process.env.DB_PATH = ":memory:";

const { createPublicOperationRouter } = await import("../lib/public-operation-routes.js");
const { feedback, leads } = await import("../lib/repo.js");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clean = (value) => typeof value === "string" ? value.slice(0, 2000).trim() : "";
const noLimit = () => (_req, _res, next) => next();

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use("/api", createPublicOperationRouter({ rateLimit: noLimit, clean }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("knowing a contact string cannot immediately delete that person's records", async () => {
  const contact = `privacy-${Date.now()}@example.com`;
  const lead = leads.insert({ kind: "test", name: "privacy test", contact, message: "keep until verified" });

  await withServer(async (base) => {
    const response = await fetch(`${base}/api/privacy/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.deepEqual(body, { ok: true, status: "verification_required" });
  });

  assert.equal(leads.all().some((item) => item.id === lead.id), true);
  const request = feedback.recent(20).find((item) => item.kind === "privacy_delete_request" && item.ref === contact);
  assert.ok(request);
  assert.match(request.message, /본인 확인/);
});

test("contact deletion route no longer calls destructive deleteByContact", () => {
  const source = fs.readFileSync(path.join(ROOT, "lib/public-operation-routes.js"), "utf8");
  assert.doesNotMatch(source, /privacy\.deleteByContact\(contact\)/);
  assert.match(source, /verification_required/);
});

test("runtime privacy UI explains verification instead of claiming immediate deletion", () => {
  const client = fs.readFileSync(path.join(ROOT, "privacy-delete-client.js"), "utf8");
  const productHome = fs.readFileSync(path.join(ROOT, "lib/product-home.js"), "utf8");

  assert.match(client, /본인 확인/);
  assert.match(client, /verification_required/);
  assert.match(client, /window\.requestDataDelete/);
  assert.match(client, /window\.openLegal/);
  assert.match(client, /window\.showModal/);
  assert.match(productHome, /PRODUCT_PRIVACY_SCRIPT/);
  assert.match(productHome, /\/privacy-delete-client\.js/);
});
