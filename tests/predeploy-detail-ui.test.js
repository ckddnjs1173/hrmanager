import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("all Core 5 pages receive the shared detail hardening layer", () => {
  const application = read("lib/application.js");
  assert.match(application, /const caseStyles = \["\/assets\/brand\/case-ui\.css", "\/case-detail\.css"\]/);
  assert.match(application, /scripts: \["\/case-detail\.js"\]/);
  for (const slug of ["wage-intake", "dismissal-intake", "retirement-intake", "worktime-intake", "annual-leave-intake"]) {
    assert.match(application, new RegExp(slug));
  }

  const script = read("case-detail.js");
  assert.match(script, /CASE_API_PATTERN/);
  assert.match(script, /aria-live/);
  assert.match(script, /response\.status === 401/);
  assert.match(script, /window\.addEventListener\("offline"/);
  assert.match(script, /MutationObserver/);

  const css = read("case-detail.css");
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Advisor portal receives accessible detail and friendly error hardening", () => {
  const application = read("lib/application.js");
  assert.match(application, /const advisorStyles = \[\.\.\.saasStyles, "\/advisor-detail\.css"\]/);
  assert.match(application, /"\/advisor-detail\.js"/);

  const script = read("advisor-detail.js");
  for (const code of ["invitation_expired", "invitation_revoked", "share_grant_expired", "share_grant_revoked"]) {
    assert.match(script, new RegExp(code));
  }
  assert.match(script, /aria-live/);
  assert.match(script, /window\.fetch = async/);
  assert.match(script, /response\.status === 403/);

  const css = read("advisor-detail.css");
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:44px/);
});

test("Business login consumes fragment tokens and never intentionally renders raw backend codes", () => {
  const html = read("business-login.html");
  const script = read("business-login.js");
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /#5b4bff/i);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /ERROR_COPY/);
  assert.match(script, /friendly\(error\.message\)/);
  assert.doesNotMatch(script, /\(\$\{error\.message\}\)/);
  assert.match(script, /safeReturnTo/);
  assert.match(script, /window\.addEventListener\("offline"/);
});
