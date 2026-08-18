import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { issueMagicChallenge } from "./saas-auth-repo.js";
import { createSaasEmailDelivery } from "./saas-email-delivery.js";

function ipHash(req, secret) { return crypto.createHmac("sha256", secret).update(String(req.ip || "")).digest("hex").slice(0, 32); }
function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}
function errorStatus(error) {
  const code = errorCode(error);
  if (code === "invalid_email") return 400;
  if (["saas_email_delivery_not_configured", "saas_email_delivery_failed"].includes(code)) return 503;
  return 500;
}

export function createSaasEmailRouter({ env = process.env, rateLimit, delivery = null } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_email_rate_limit_required");
  const router = express.Router();
  const email = delivery || createSaasEmailDelivery({ env });
  const emailRateLimit = rateLimit({ max: 10 });

  function requireConfiguredEmailRoute(req, _res, next) {
    if (!email.config.enabled) return next("route");
    try { req.saasEmailConfig = getSaasRuntimeConfig(env); }
    catch { return next("route"); }
    if (!req.saasEmailConfig.enabled) return next("route");
    next();
  }

  router.post("/auth/magic-link", requireConfiguredEmailRoute, emailRateLimit, async (req, res) => {
    try {
      const config = req.saasEmailConfig;
      const challenge = await issueMagicChallenge({
        email: req.body?.email,
        ttlMinutes: config.challengeTtlMinutes,
        ipHash: ipHash(req, config.sessionSecret),
        requestId: req.requestId || null,
      });
      await email.sendMagicLink({
        to: challenge.emailNormalized,
        rawToken: challenge.rawToken,
        expiresAt: challenge.expiresAt,
        challengeId: challenge.id,
      });
      return res.status(202).json({ ok: true, expiresAt: challenge.expiresAt, deliveryMode: "EMAIL" });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: errorCode(error) });
    }
  });

  return router;
}
