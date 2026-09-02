// 여러 파일(saas-auth-repo.js, saas-tenant-repo.js, saas-email-delivery.js,
// external-advisor-invitation-contract.js, production-deployment-contract.js)에
// 동일하게 존재하던 "약한" 이메일 검증 로직(문자열에 '@'가 포함돼 있는지만 확인)을
// 단일 모듈로 통합한다. 검증 강도를 높이는 게 목적이 아니라 중복된 동일 로직을
// 한 곳으로 모으는 것이 목적이다 — 강도를 바꾸면 기존 동작(어떤 입력이 통과/거부되는지)이
// 달라지므로 여기서는 하지 않는다.

export function isValidEmail(value) {
  const email = String(value || "").trim();
  return email.length > 0 && email.includes("@");
}
