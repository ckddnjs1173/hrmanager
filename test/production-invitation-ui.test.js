import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const businessLogin=fs.readFileSync(new URL("../business-login.js",import.meta.url),"utf8");
const advisorAuth=fs.readFileSync(new URL("../advisor-production-auth.js",import.meta.url),"utf8");
const businessInvite=fs.readFileSync(new URL("../business-production-invite.js",import.meta.url),"utf8");
const pageTransform=fs.readFileSync(new URL("../lib/user-facing-page.js",import.meta.url),"utf8");
const application=fs.readFileSync(new URL("../lib/application.js",import.meta.url),"utf8");

for(const [name,source] of [["business login",businessLogin],["advisor auth",advisorAuth],["business invite",businessInvite]]){
  test(`${name} never persists invitation or magic secrets in browser storage`,()=>{
    assert.equal(/localStorage|sessionStorage/.test(source),false);
  });
}

test("Business login scrubs fragments before verification and handles invite-bound login",()=>{
  assert.match(businessLogin,/history\.replaceState/);
  assert.match(businessLogin,/\/api\/saas\/invitations\/magic-link/);
  assert.match(businessLogin,/\/api\/saas\/invitations\/accept/);
  assert.match(businessLogin,/\/advisor\.html#invite=/);
});

test("Advisor production login preserves invite context through bound email flow",()=>{
  assert.match(advisorAuth,/\/advisor\/invitations\/magic-link/);
  assert.match(advisorAuth,/returnTo:\s*"\/advisor\.html"/);
  assert.match(advisorAuth,/advisorInviteToken/);
});

test("Business Advisor invitation distinguishes email delivery from manual debug links",()=>{
  assert.match(businessInvite,/deliveryMode\s*===\s*"EMAIL"/);
  assert.match(businessInvite,/box\.hidden\s*=\s*true/);
  assert.match(businessInvite,/invitationFragmentPath/);
});

test("Business and Advisor pages are intercepted before express.static",()=>{
  assert.match(pageTransform,/createUserFacingPageHandler/);
  const businessIndex=application.indexOf('app.get("/business.html"');
  const advisorIndex=application.indexOf('app.get("/advisor.html"');
  const staticIndex=application.indexOf("app.use(express.static");
  assert.ok(businessIndex>=0&&businessIndex<staticIndex);
  assert.ok(advisorIndex>=0&&advisorIndex<staticIndex);
  assert.match(application,/business-production-invite\.js/);
  assert.match(application,/advisor-production-auth\.js/);
});
