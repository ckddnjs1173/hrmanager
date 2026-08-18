import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../business-login.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../business-login.js",import.meta.url),"utf8");
const routes=fs.readFileSync(new URL("../lib/saas-email-routes.js",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../lib/application.js",import.meta.url),"utf8");

test("Business email login consumes magic token from fragment and scrubs it immediately",()=>{
  assert.match(html,/noindex,nofollow/);
  assert.match(js,/location\.hash/);
  assert.match(js,/history\.replaceState/);
  assert.match(js,/\/auth\/magic-link\/verify/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.doesNotMatch(js,/location\.search.*magic|[?&]magic=/);
});

test("production email route never returns raw magic token",()=>{
  assert.match(routes,/deliveryMode: "EMAIL"/);
  assert.doesNotMatch(routes,/debugToken:/);
  assert.doesNotMatch(routes,/rawToken: challenge\.rawToken[^\n]*json/);
  assert.ok(app.indexOf("createSaasEmailRouter")<app.indexOf("createSaasRouter"),"email delivery router must run before debug/fail-closed fallback route");
});
