import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../business-close.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../business-close.js",import.meta.url),"utf8");

test("Monthly Close workspace is private and explicitly not a legal certification",()=>{
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/법적 준수 인증이 아닙니다/);
  assert.match(html,/법 위반이 없다는 확인서나 법률상 준수 인증서가 아닙니다/);
});

test("Monthly Close exposes unresolved acknowledgment, note and immutable closed snapshot wording",()=>{
  for(const id of ["close-org-picker","close-month","close-risk-count","close-action-count","close-overdue-count","close-completed-count","close-ack","close-note","close-refresh","close-form","close-history"])assert.match(html,new RegExp(`id=[\"']${id}[\"']`));
  assert.match(js,/acknowledgeUnresolved/);
  assert.match(js,/compliance_close_acknowledgement_required/);
  assert.match(js,/compliance_close_note_required/);
  assert.match(js,/닫힌 Snapshot은 이후 원본 데이터가 바뀌어도 수정되지 않습니다/);
});

test("Monthly Close only uses authenticated tenant-scoped SaaS APIs",()=>{
  assert.match(js,/const API="\/api\/saas"/);
  assert.match(js,/\/auth\/me/);
  assert.match(js,/\/organizations/);
  assert.match(js,/\/compliance-close\/current/);
  assert.match(js,/\/compliance-close\/history/);
  assert.match(js,/\/refresh/);
  assert.match(js,/\/close/);
  assert.match(js,/x-csrf-token/);
  assert.match(js,/credentials:"same-origin"/);
});
