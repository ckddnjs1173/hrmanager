import { describeStorageRuntime } from "./storage-runtime-contract.js";

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSaasRuntimeConfig(env = process.env) {
  const enabled = env.SAAS_ENABLED === "1";
  const storage = describeStorageRuntime(env);
  const sessionSecret = String(env.SAAS_SESSION_SECRET || env.SESSION_SECRET || "").trim();
  const production = env.NODE_ENV === "production";
  const debugTokenEcho = !production && env.SAAS_AUTH_TOKEN_ECHO === "1";

  if (enabled && storage.primary !== "postgres") {
    throw new Error("saas_requires_postgres_runtime");
  }
  if (enabled && !sessionSecret) {
    throw new Error("saas_session_secret_required");
  }
  if (production && env.SAAS_AUTH_TOKEN_ECHO === "1") {
    throw new Error("saas_auth_token_echo_forbidden_in_production");
  }

  return Object.freeze({
    enabled,
    production,
    storage,
    sessionSecret,
    debugTokenEcho,
    challengeTtlMinutes: positiveInt(env.SAAS_AUTH_CHALLENGE_TTL_MINUTES, 15),
    sessionTtlDays: positiveInt(env.SAAS_SESSION_TTL_DAYS, 30),
    invitationTtlDays: positiveInt(env.SAAS_INVITATION_TTL_DAYS, 7),
    cookieName: String(env.SAAS_SESSION_COOKIE || "insaya_saas_session").trim() || "insaya_saas_session",
  });
}

export function assertSaasEnabled(env = process.env) {
  const config = getSaasRuntimeConfig(env);
  if (!config.enabled) throw new Error("saas_not_enabled");
  return config;
}
