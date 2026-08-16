import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

process.env.DB_PATH = ":memory:";

const { createAdminRouter } = await import("../lib/admin-routes.js");
const { createPublicOperationRouter } = await import("../lib/public-operation-routes.js");
const { bookings, feedback, leads } = await import("../lib/repo.js");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clean = (value) => typeof value === "string" ? value.slice(0, 2000).trim() : "";
const noLimit = () => (_req, _res, next) => next();

function publicRouter() {
  return createPublicOperationRouter({ rateLimit: noLimit, clean });
}

function adminRouter() {
  return createAdminRouter({
    rateLimit: noLimit,
    clean,
    adminToken: "privacy-admin-token",
    sessionTtl: 60_000,
    parseCookies: () => ({}),
    verifySession: () => null,
    setSessionCookie: () => {},
    clearSessionCookie: () => {},
  });
}

async function withServer(routers, run) {
  const app = express();
  app.use(express.json());
  for (const router of routers) app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function postDelete(base, payload) {
  const response = await fetch(`${base}/api/privacy/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

test("knowing a contact string cannot immediately delete that person's records", async () => {
  const contact = `privacy-queue-${Date.now()}@example.com`;
  const lead = leads.insert({ kind: "test", name: "privacy test", contact, message: "keep until verified" });

  await withServer([publicRouter()], async (base) => {
    const { response, body } = await postDelete(base, { contact });
    assert.equal(response.status, 202);
    assert.deepEqual(body, { ok: true, status: "verification_required" });
  });

  assert.equal(leads.all().some((item) => item.id === lead.id), true);
  const request = feedback.recent(20).find((item) => item.kind === "privacy_delete_request" && item.ref === contact);
  assert.ok(request);
  assert.match(request.message, /본인 확인/);
});

test("only authenticated admin with explicit identity verification can fulfill contact deletion", async () => {
  const contact = `privacy-fulfill-${Date.now()}@example.com`;
  const lead = leads.insert({ kind: "test", name: "verified user", contact, message: "delete after verification" });

  await withServer([publicRouter(), adminRouter()], async (base) => {
    const queued = await postDelete(base, { contact });
    assert.equal(queued.response.status, 202);

    const unauthorized = await fetch(`${base}/api/admin/privacy/delete-contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact, verified: true }),
    });
    assert.equal(unauthorized.status, 401);

    const unverified = await fetch(`${base}/api/admin/privacy/delete-contact`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "privacy-admin-token" },
      body: JSON.stringify({ contact }),
    });
    assert.equal(unverified.status, 400);
    assert.deepEqual(await unverified.json(), { error: "identity_verification_required" });

    const fulfilled = await fetch(`${base}/api/admin/privacy/delete-contact`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "privacy-admin-token" },
      body: JSON.stringify({ contact, verified: true }),
    });
    assert.equal(fulfilled.status, 200);
    const result = await fulfilled.json();
    assert.equal(result.ok, true);
    assert.ok(result.deleted >= 1);
    assert.ok(result.requestsResolved >= 1);
  });

  assert.equal(leads.all().some((item) => item.id === lead.id), false);
  const request = feedback.recent(50).find((item) => item.kind === "privacy_delete_request" && item.ref === contact);
  assert.equal(request?.status, "done");
});

test("expert-facing summary token cannot be reused as a destructive privacy capability", async () => {
  const summaryToken = `summary-${Date.now()}`;
  const booking = bookings.insert({
    contact: "summary-viewer@example.com",
    consent: true,
    token: summaryToken,
    expires: new Date(Date.now() + 60_000).toISOString(),
  });

  await withServer([publicRouter()], async (base) => {
    const result = await postDelete(base, { token: summaryToken });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.body, { error: "contact_required" });
  });

  assert.equal(bookings.get(booking.id)?.deleted_at, null);
  assert.equal(bookings.byToken(summaryToken)?.id, booking.id);
});

test("public deletion route separates summary-view and deletion capabilities", () => {
  const route = fs.readFileSync(path.join(ROOT, "lib/public-operation-routes.js"), "utf8");
  const operations = fs.readFileSync(path.join(ROOT, "lib/privacy-operations.js"), "utf8");
  assert.doesNotMatch(route, /privacy\.deleteByContact\(contact\)/);
  assert.match(route, /queuePrivacyDeletion\(contact\)/);
  assert.doesNotMatch(route, /deleteByActivePrivacyToken/);
  assert.doesNotMatch(operations, /deleteByActivePrivacyToken/);
  assert.match(route, /Booking tokens authorize the expert-facing summary link only/);
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
