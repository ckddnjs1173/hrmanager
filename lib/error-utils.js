// SaaS 라우터 5곳(saas-routes.js, saas-risk-routes.js, saas-email-routes.js,
// saas-compliance-close-routes.js, saas-advisor-collaboration-routes.js)에 동일하게
// 존재하던 errorCode()를 공용화하고, errorStatus()의 if-체인 "구조"만 공용 헬퍼로
// 추출한다. 각 파일의 실제 코드→status 매핑표는 여전히 파일별로 소유하며,
// createErrorStatusResolver(rules)에 그대로 넘겨 동작을 100% 보존한다.
//
// 서로 다른 라우터가 같은 에러 코드를 다른 status로 매핑하는 경우(예:
// external_advisor_business_case_not_shareable, external_advisor_invitation_not_found)가
// 실제로 존재하므로, 이 모듈은 규칙표를 통합하지 않는다 — 통합하면 동작이 바뀐다.

export function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}

function ruleMatches(rule, code) {
  if (rule.codes) {
    const set = rule.codes instanceof Set ? rule.codes : new Set(rule.codes);
    if (set.has(code)) return true;
  }
  if (rule.prefixes && rule.prefixes.some((prefix) => code.startsWith(prefix))) return true;
  return false;
}

// rules: 순서가 있는 배열. 각 항목은 { codes?: string[]|Set<string>, prefixes?: string[], status: number }.
// 앞쪽 규칙이 우선 매치되며(첫 매치 우선), 어느 것도 매치하지 않으면 defaultStatus(기본 500)를 반환한다.
// 원본 5개 파일의 if-체인 순서를 그대로 배열 순서로 옮기면 동작이 완전히 동일하다.
export function createErrorStatusResolver(rules, { defaultStatus = 500 } = {}) {
  if (!Array.isArray(rules)) throw new Error("error_status_rules_array_required");
  return function errorStatus(error) {
    const code = errorCode(error);
    for (const rule of rules) {
      if (ruleMatches(rule, code)) return rule.status;
    }
    return defaultStatus;
  };
}
