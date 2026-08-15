import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDocumentRouter } from "../lib/document-routes.js";

async function withServer(run) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createDocumentRouter());
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("document router preserves document catalog and unknown-document contract", async () => {
  await withServer(async (base) => {
    const catalog = await fetch(`${base}/api/docs`);
    assert.equal(catalog.status, 200);
    const docs = await catalog.json();
    assert.ok(Array.isArray(docs));
    assert.ok(docs.length > 0);

    const missing = await fetch(`${base}/api/doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "__missing_document__", values: {} }),
    });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "unknown_doc" });
  });
});

test("document router preserves pack catalog and unknown-pack contract", async () => {
  await withServer(async (base) => {
    const catalog = await fetch(`${base}/api/docpacks`);
    assert.equal(catalog.status, 200);
    const packs = await catalog.json();
    assert.ok(Array.isArray(packs));

    const missing = await fetch(`${base}/api/docpack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "__missing_pack__", values: {} }),
    });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "unknown_pack" });
  });
});
