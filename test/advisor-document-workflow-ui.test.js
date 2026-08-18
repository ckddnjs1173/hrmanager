import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const business = fs.readFileSync(new URL("../business-advisor.js", import.meta.url), "utf8");
const advisor = fs.readFileSync(new URL("../advisor.js", import.meta.url), "utf8");
const businessCss = fs.readFileSync(new URL("../business-advisor.css", import.meta.url), "utf8");
const advisorCss = fs.readFileSync(new URL("../advisor.css", import.meta.url), "utf8");

test("Business collaboration UI exposes the complete document review journey", () => {
  for (const permission of ["case.read", "comment.create", "document.read", "document.review"]) {
    assert.ok(business.includes(permission), `missing invitation permission ${permission}`);
  }
  for (const endpoint of [
    "/business-cases/", "/documents", "/business-case-documents/", "/content?fileName=",
    "/submit-review", "/business-case-document-versions/", "/download", "/advisor-grants/", "/revoke",
  ]) assert.ok(business.includes(endpoint), `missing Business document workflow endpoint ${endpoint}`);
  for (const label of ["문서 추가", "전문가 검토 요청", "수정본 검토 다시 요청", "접근 종료"]) {
    assert.ok(business.includes(label), `missing Business workflow label ${label}`);
  }
  assert.match(business, /10\*1024\*1024/);
  assert.match(business, /PDF, DOCX, HWP, HWPX/);
  assert.doesNotMatch(business, /localStorage|sessionStorage/);
  assert.doesNotMatch(business, /storageObjectKey|storage_object_key|signedUrl|uploadUrl|downloadUrl/);
  assert.match(businessCss, /\.doc-panel/);
  assert.match(businessCss, /\.doc-version/);
});

test("Advisor portal stays on advisor-safe APIs while supporting document review", () => {
  for (const endpoint of [
    "/advisor/share-grants/", "/documents", "/document-versions/", "/download", "/review",
  ]) assert.ok(advisor.includes(endpoint), `missing Advisor document workflow endpoint ${endpoint}`);
  assert.doesNotMatch(advisor, /\/organizations\//, "Advisor client must not borrow organization-internal APIs");
  assert.doesNotMatch(advisor, /localStorage|sessionStorage/);
  assert.match(advisor, /history\.replaceState/);
  assert.match(advisor, /CHANGES_REQUESTED/);
  assert.match(advisor, /APPROVED/);
  assert.match(advisor, /수정 요청 사유를 입력해 주세요/);
  assert.match(advisorCss, /\.advisor-documents/);
  assert.match(advisorCss, /\.advisor-doc-review-form/);
});
