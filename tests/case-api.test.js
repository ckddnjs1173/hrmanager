import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
const { createCaseRouter } = await import("../lib/case-routes.js");

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/cases", createCaseRouter());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test("case API requires an opaque access token", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      case_type: "wage_arrears",
      title: "7월 급여 미지급",
      facts: { monthlyBasePay: 3000000 },
    }),
  });
  assert.equal(createdRes.status, 201);
  const createdBody = await createdRes.json();
  assert.ok(createdBody.case?.id);
  assert.ok(createdBody.accessToken);

  const id = createdBody.case.id;
  const token = createdBody.accessToken;

  const denied = await fetch(`${base}/api/cases/${id}`);
  assert.equal(denied.status, 401);

  const foundRes = await fetch(`${base}/api/cases/${id}`, {
    headers: { "x-case-token": token },
  });
  assert.equal(foundRes.status, 200);
  const foundBody = await foundRes.json();
  assert.equal(foundBody.case.facts.monthlyBasePay, 3000000);

  const updatedRes = await fetch(`${base}/api/cases/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-case-token": token },
    body: JSON.stringify({ status: "active", missing_facts: ["payDay"] }),
  });
  assert.equal(updatedRes.status, 200);
  const updatedBody = await updatedRes.json();
  assert.equal(updatedBody.case.status, "active");
  assert.deepEqual(updatedBody.case.missing_facts, ["payDay"]);

  const deletedRes = await fetch(`${base}/api/cases/${id}`, {
    method: "DELETE",
    headers: { "x-case-token": token },
  });
  assert.equal(deletedRes.status, 204);

  const afterDelete = await fetch(`${base}/api/cases/${id}`, {
    headers: { "x-case-token": token },
  });
  assert.equal(afterDelete.status, 401);
});
