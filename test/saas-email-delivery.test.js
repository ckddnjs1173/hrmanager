import test from "node:test";
import assert from "node:assert/strict";
import { createSaasEmailDelivery, getSaasEmailDeliveryConfig } from "../lib/saas-email-delivery.js";

test("SaaS email delivery stays disabled until every production input is present", () => {
  assert.equal(getSaasEmailDeliveryConfig({}).enabled, false);
  assert.equal(getSaasEmailDeliveryConfig({ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_x", SAAS_EMAIL_FROM:"noreply@example.com" }).enabled, false);
  assert.equal(getSaasEmailDeliveryConfig({ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_x", SAAS_EMAIL_FROM:"noreply@example.com", SITE_URL:"https://insaya.example.com" }).enabled, true);
});

test("Resend adapter sends Business magic token only inside a URL fragment", async () => {
  const calls=[];
  const rawToken="super-secret-magic-token";
  const delivery=createSaasEmailDelivery({
    env:{ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_test_secret", SAAS_EMAIL_FROM:"인사야 <noreply@example.com>", SITE_URL:"https://insaya.example.com" },
    fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:"email_123"})};},
  });
  const result=await delivery.sendMagicLink({to:"User@Example.com",rawToken,expiresAt:"2026-08-19T01:00:00Z",challengeId:"ach_123"});
  assert.deepEqual(result,{provider:"resend",messageId:"email_123"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://api.resend.com/emails");
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[0].options.headers.authorization,"Bearer re_test_secret");
  assert.equal(calls[0].options.headers["user-agent"],"insaya-saas-email/1.0");
  assert.match(calls[0].options.headers["idempotency-key"],/^[0-9a-f]{64}$/);
  const payload=JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.to,["user@example.com"]);
  assert.ok(payload.html.includes(`/business-login.html#magic=${rawToken}`));
  assert.equal(payload.html.includes(`?magic=${rawToken}`),false);
  assert.equal(calls[0].options.headers["idempotency-key"].includes(rawToken),false);
  assert.equal(calls[0].options.body.includes("re_test_secret"),false);
});

test("provider errors are normalized without leaking response details", async () => {
  const delivery=createSaasEmailDelivery({
    env:{ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_test_secret", SAAS_EMAIL_FROM:"noreply@example.com", SITE_URL:"https://insaya.example.com" },
    fetchImpl:async()=>({ok:false,status:422,json:async()=>({message:"provider-sensitive-detail"})}),
  });
  await assert.rejects(()=>delivery.sendMagicLink({to:"user@example.com",rawToken:"token",expiresAt:"x",challengeId:"ach"}),/saas_email_delivery_failed/);
});
