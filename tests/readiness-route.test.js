import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
process.env.REQUIRE_PERSISTENT_DB = "0";
process.env.PERSISTENT_STORAGE = "0";
process.env.NODE_ENV = "test";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { createApplication } = await import("../lib/application.js");

test("canonical /api/readiness is public, non-secret and consistent with the Case alias", async (t) => {
  const env = {
    ...process.env,
    ADMIN_TOKEN: "readiness-test-admin-token",
    SESSION_SECRET: "readiness-test-session-secret",
    RENDER_GIT_COMMIT: "readiness-test-commit",
    RENDER_GIT_BRANCH: "test",
  };
  const { app } = createApplication({ rootDir: ROOT, env, warn: () => {} });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const canonicalResponse = await fetch(`${base}/api/readiness`);
  assert.equal(canonicalResponse.status, 200);
  const canonical = await canonicalResponse.json();
  assert.equal(canonical.ready, true);
  assert.equal(canonical.readyForSensitiveCaseStorage, false);
  assert.equal(canonical.build.commit, "readiness-test-commit");
  assert.equal(canonical.cases.count, 5);
  assert.equal(canonical.legal.ok, true);
  assert.equal(canonical.database.ok, true);
  assert.equal(canonical.persistence.durableStorageDeclared, false);

  const aliasResponse = await fetch(`${base}/api/cases/readiness`);
  assert.equal(aliasResponse.status, 200);
  const alias = await aliasResponse.json();
  assert.equal(alias.ready, canonical.ready);
  assert.equal(alias.readyForSensitiveCaseStorage, canonical.readyForSensitiveCaseStorage);
  assert.equal(alias.cases.count, canonical.cases.count);

  const serialized = JSON.stringify(canonical);
  assert.doesNotMatch(serialized, /readiness-test-session-secret|readiness-test-admin-token/);
  assert.doesNotMatch(serialized, /DB_PATH/i);
});
