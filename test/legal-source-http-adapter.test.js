import test from "node:test";
import assert from "node:assert/strict";
import { fetchOfficialLegalSource, normalizeLegalSourceContent } from "../lib/legal-source-http-adapter.js";
import { validateOfficialLegalUrl } from "../lib/legal-change-contract.js";

function html(body, init = {}) {
  const { headers = {}, ...rest } = init;
  return new Response(body, { status: 200, ...rest, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

test("official legal URL requires https allowlisted host and forbids credentials", () => {
  assert.equal(validateOfficialLegalUrl("https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872").ok, true);
  assert.equal(validateOfficialLegalUrl("http://www.law.go.kr/LSW/lsInfoP.do").ok, false);
  assert.equal(validateOfficialLegalUrl("https://example.com/law").ok, false);
  const credential = validateOfficialLegalUrl("https://user:pass@www.law.go.kr/LSW/lsInfoP.do");
  assert.equal(credential.ok, false);
  assert.equal(credential.error, "legal_source_official_url_credentials_forbidden");
});

test("html normalization ignores scripts, styles, comments, tags and whitespace", () => {
  const one = normalizeLegalSourceContent("<html><style>.x{}</style><script>now=1</script><body><h1>최저임금</h1><!--x--><p>10,320 원</p></body></html>", "text/html");
  const two = normalizeLegalSourceContent("<main>  <h2>최저임금</h2>\n<div>10,320   원</div></main>", "text/html");
  assert.equal(one, "최저임금 10,320 원");
  assert.equal(two, "최저임금 10,320 원");
});

test("json normalization is deterministic across object key order", () => {
  const a = normalizeLegalSourceContent('{"b":2,"a":{"z":3,"x":1}}', "application/json");
  const b = normalizeLegalSourceContent('{"a":{"x":1,"z":3},"b":2}', "application/json");
  assert.equal(a, b);
});

test("redirects are followed only when every target remains official https", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return new Response(null, { status: 302, headers: { location: "https://www.minimumwage.go.kr/minWage/policy/decisionMain.do" } });
    return html("<p>공식 내용</p>");
  };
  const result = await fetchOfficialLegalSource({ url: "https://minimumwage.go.kr/minWage/policy/decisionMain.do", fetchImpl });
  assert.equal(result.redirects, 1);
  assert.equal(result.finalUrl, "https://www.minimumwage.go.kr/minWage/policy/decisionMain.do");
  assert.equal(result.evidenceText, "공식 내용");

  await assert.rejects(
    () => fetchOfficialLegalSource({
      url: "https://law.go.kr/LSW/lsInfoP.do",
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/phish" } }),
    }),
    /legal_source_official_url_invalid/,
  );
});

test("non-text content and oversized responses are rejected", async () => {
  await assert.rejects(
    () => fetchOfficialLegalSource({
      url: "https://law.go.kr/LSW/lsInfoP.do",
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }),
    }),
    /legal_source_http_content_type_invalid/,
  );
  await assert.rejects(
    () => fetchOfficialLegalSource({
      url: "https://law.go.kr/LSW/lsInfoP.do",
      maxBytes: 10,
      fetchImpl: async () => html("tiny", { headers: { "content-length": "999" } }),
    }),
    /legal_source_http_response_too_large/,
  );
});

test("successful fetch returns normalized evidence and stable sha256 hash", async () => {
  const fetchImpl = async () => html("<body><h1>근로기준법</h1><p>제36조</p></body>", { headers: { etag: '"abc"', "last-modified": "Mon, 17 Aug 2026 00:00:00 GMT" } });
  const first = await fetchOfficialLegalSource({ url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872", fetchImpl, now: new Date("2026-08-17T00:00:00Z") });
  const second = await fetchOfficialLegalSource({ url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872", fetchImpl, now: new Date("2026-08-17T01:00:00Z") });
  assert.equal(first.evidenceText, "근로기준법 제36조");
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.etag, '"abc"');
});
