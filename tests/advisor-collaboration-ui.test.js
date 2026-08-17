import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=(name)=>fs.readFileSync(path.join(ROOT,name),"utf8");

test("advisor portal keeps invitation tokens out of persistent browser storage and organization APIs",()=>{
  const html=read("advisor.html");
  const js=read("advisor.js");
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/외부 자문 협업/);
  assert.match(js,/location\.hash/);
  assert.match(js,/history\.replaceState/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
  assert.doesNotMatch(js,/\/organizations\//,"advisor client must not call organization-internal APIs");
  assert.match(js,/\/advisor\/invitations\/preview/);
  assert.match(js,/\/advisor\/invitations\/accept/);
  assert.match(js,/\/advisor\/share-grants/);
  assert.match(js,/\/review-notes/);
  assert.match(js,/comment\.create/);
});

test("Business collaboration UI uses email invitations with case.read and comment.create only",()=>{
  const html=read("business.html");
  const js=read("business-advisor.js");
  assert.match(html,/data-view="collaboration"/);
  assert.match(html,/전문가 이메일/);
  assert.match(html,/회사 Membership이 생성되지 않습니다/);
  assert.match(js,/advisorEmail/);
  assert.doesNotMatch(js,/advisorUserId/,"Business UI must not expose opaque advisor user IDs");
  assert.match(js,/permissions:\["case\.read","comment\.create"\]/);
  assert.match(js,/invitationFragmentPath/);
  assert.match(js,/\/advisor-invitations\//);
  assert.match(js,/\/review-notes/);
  assert.match(js,/case\.read<\/b>와 <b>comment\.create/);
});
