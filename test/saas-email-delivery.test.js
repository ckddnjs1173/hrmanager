import test from "node:test";
import assert from "node:assert/strict";
import { createSaasEmailDelivery, getSaasEmailDeliveryConfig } from "../lib/saas-email-delivery.js";

function configuredDelivery(calls) {
  return createSaasEmailDelivery({
    env:{ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_test_secret", SAAS_EMAIL_FROM:"인사야 <noreply@example.com>", SITE_URL:"https://insaya.example.com" },
    fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:`email_${calls.length}`})};},
  });
}
function payload(call) { return JSON.parse(call.options.body); }

test("SaaS email delivery stays disabled until every production input is present", () => {
  assert.equal(getSaasEmailDeliveryConfig({}).enabled, false);
  assert.equal(getSaasEmailDeliveryConfig({ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_x", SAAS_EMAIL_FROM:"noreply@example.com" }).enabled, false);
  assert.equal(getSaasEmailDeliveryConfig({ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_x", SAAS_EMAIL_FROM:"noreply@example.com", SITE_URL:"https://insaya.example.com" }).enabled, true);
});

test("Resend adapter sends Business magic token only inside a URL fragment", async () => {
  const calls=[];
  const rawToken="super-secret-magic-token";
  const delivery=configuredDelivery(calls);
  const result=await delivery.sendMagicLink({to:"User@Example.com",rawToken,expiresAt:"2026-08-19T01:00:00Z",challengeId:"ach_123"});
  assert.deepEqual(result,{provider:"resend",messageId:"email_1"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://api.resend.com/emails");
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[0].options.headers.authorization,"Bearer re_test_secret");
  assert.equal(calls[0].options.headers["user-agent"],"insaya-saas-email/1.0");
  assert.match(calls[0].options.headers["idempotency-key"],/^[0-9a-f]{64}$/);
  assert.deepEqual(payload(calls[0]).to,["user@example.com"]);
  assert.ok(payload(calls[0]).html.includes(`/business-login.html#magic=${rawToken}`));
  assert.equal(payload(calls[0]).html.includes(`?magic=${rawToken}`),false);
  assert.equal(calls[0].options.headers["idempotency-key"].includes(rawToken),false);
  assert.equal(calls[0].options.body.includes("re_test_secret"),false);
});

test("Advisor login continuation and invite context stay inside the fragment", async () => {
  const calls=[];const delivery=configuredDelivery(calls);
  await delivery.sendMagicLink({
    to:"advisor@example.com",rawToken:"magic-advisor",expiresAt:"2026-08-19T01:00:00Z",challengeId:"ach_advisor",
    returnTo:"/advisor.html",advisorInviteToken:"advisor-invite-secret",
  });
  const html=payload(calls[0]).html;
  assert.ok(html.includes("/business-login.html#"));
  assert.ok(html.includes("magic=magic-advisor"));
  assert.ok(html.includes("return=%2Fadvisor.html"));
  assert.ok(html.includes("invite=advisor-invite-secret"));
  assert.equal(html.includes("?invite="),false);
});

test("organization invitation token is email-only and fragment-bound", async () => {
  const calls=[];const delivery=configuredDelivery(calls);
  await delivery.sendOrganizationInvitation({
    to:"hr@example.com",rawToken:"org-invite-secret",invitationId:"inv_1",roleKey:"HR_ADMIN",organizationName:"테스트회사",expiresAt:"2026-08-25T00:00:00Z",
  });
  const body=payload(calls[0]);
  assert.deepEqual(body.to,["hr@example.com"]);
  assert.ok(body.html.includes("/business-login.html#orgInvite=org-invite-secret"));
  assert.equal(body.html.includes("?orgInvite="),false);
  assert.equal(calls[0].options.headers["idempotency-key"].includes("org-invite-secret"),false);
});

test("Advisor invitation token is email-only and fragment-bound", async () => {
  const calls=[];const delivery=configuredDelivery(calls);
  await delivery.sendAdvisorInvitation({
    to:"advisor@example.com",rawToken:"advisor-invite-secret",invitationId:"easi_1",businessCaseTitle:"취업규칙 검토",invitationExpiresAt:"2026-08-25T00:00:00Z",
  });
  const body=payload(calls[0]);
  assert.ok(body.html.includes("/advisor.html#invite=advisor-invite-secret"));
  assert.equal(body.html.includes("?invite="),false);
  assert.ok(body.subject.includes("취업규칙 검토"));
});

test("provider errors are normalized without leaking response details", async () => {
  const delivery=createSaasEmailDelivery({
    env:{ SAAS_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"re_test_secret", SAAS_EMAIL_FROM:"noreply@example.com", SITE_URL:"https://insaya.example.com" },
    fetchImpl:async()=>({ok:false,status:422,json:async()=>({message:"provider-sensitive-detail"})}),
  });
  await assert.rejects(()=>delivery.sendMagicLink({to:"user@example.com",rawToken:"token",expiresAt:"x",challengeId:"ach"}),/saas_email_delivery_failed/);
});
