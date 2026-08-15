import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createPublicOperationRouter } from "../lib/public-operation-routes.js";

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
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("public operation router requires shared server dependencies", () => {
  assert.throws(() => createPublicOperationRouter({ clean }), /public_operation_rate_limit_required/);
  assert.throws(() => createPublicOperationRouter({ rateLimit: noLimit }), /public_operation_clean_required/);
});

test("lead and booking validation contracts remain unchanged", async () => {
  await withServer(async (base) => {
    const lead = await fetch(`${base}/api/lead`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(lead.status, 400);
    assert.deepEqual(await lead.json(), { error: "contact_required" });

    const bookingNoContact = await fetch(`${base}/api/booking`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true }) });
    assert.equal(bookingNoContact.status, 400);
    assert.deepEqual(await bookingNoContact.json(), { error: "contact_required" });

    const bookingNoConsent = await fetch(`${base}/api/booking`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact: "test@example.com" }) });
    assert.equal(bookingNoConsent.status, 400);
    assert.deepEqual(await bookingNoConsent.json(), { error: "consent_required" });
  });
});

test("event and privacy validation contracts remain unchanged", async () => {
  await withServer(async (base) => {
    const event = await fetch(`${base}/api/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "__invalid__" }) });
    assert.equal(event.status, 400);
    assert.deepEqual(await event.json(), { error: "bad_type" });

    const privacy = await fetch(`${base}/api/privacy/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(privacy.status, 400);
    assert.deepEqual(await privacy.json(), { error: "token_or_contact_required" });
  });
});

test("server delegates public operation endpoints to the extracted router", () => {
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(server, /import \{ createPublicOperationRouter \} from "\.\/lib\/public-operation-routes\.js"/);
  assert.match(server, /app\.use\("\/api", createPublicOperationRouter\(\{ rateLimit, clean \}\)\)/);
  for (const route of ["lead", "booking", "event", "feedback", "privacy/delete"]) {
    assert.doesNotMatch(server, new RegExp(`app\\.post\\(\"/api/${route.replace("/", "\\/")}`));
  }
});
