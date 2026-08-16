import test from "node:test";
import assert from "node:assert/strict";
import { getSaasRuntimeConfig } from "../lib/saas-runtime-config.js";

test("SaaS is disabled by default and does not require PostgreSQL", () => {
  const config = getSaasRuntimeConfig({ STORAGE_DRIVER: "sqlite", NODE_ENV: "test" });
  assert.equal(config.enabled, false);
  assert.equal(config.storage.primary, "sqlite");
});

test("enabled SaaS requires PostgreSQL primary storage", () => {
  assert.throws(
    () => getSaasRuntimeConfig({ SAAS_ENABLED: "1", STORAGE_DRIVER: "sqlite", SAAS_SESSION_SECRET: "secret", NODE_ENV: "test" }),
    /saas_requires_postgres_runtime/
  );
});

test("enabled SaaS requires a session secret", () => {
  assert.throws(
    () => getSaasRuntimeConfig({ SAAS_ENABLED: "1", STORAGE_DRIVER: "postgres", DATABASE_URL: "postgres://example/test", NODE_ENV: "test" }),
    /saas_session_secret_required/
  );
});

test("debug authentication token echo is forbidden in production", () => {
  assert.throws(
    () => getSaasRuntimeConfig({
      SAAS_ENABLED: "1",
      STORAGE_DRIVER: "postgres",
      DATABASE_URL: "postgres://example/test",
      SAAS_SESSION_SECRET: "secret",
      SAAS_AUTH_TOKEN_ECHO: "1",
      NODE_ENV: "production",
    }),
    /saas_auth_token_echo_forbidden_in_production/
  );
});

test("test mode can explicitly enable debug token echo", () => {
  const config = getSaasRuntimeConfig({
    SAAS_ENABLED: "1",
    STORAGE_DRIVER: "postgres",
    DATABASE_URL: "postgres://example/test",
    SAAS_SESSION_SECRET: "secret",
    SAAS_AUTH_TOKEN_ECHO: "1",
    NODE_ENV: "test",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.debugTokenEcho, true);
  assert.equal(config.storage.primary, "postgres");
});
