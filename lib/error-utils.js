// SaaS 라우터 5곳(saas-routes.js, saas-risk-routes.js, saas-email-routes.js,
// saas-compliance-close-routes.js, saas-advisor-collaboration-routes.js)에 동일하게
// 존재하던 errorCode()를 공용화하고, errorStatus()의 if-체인 "구조"만 공용 헬퍼로
// 추출한다. 각 파일의 실제 코드→status 매핑표는 여전히 파일별로 소유하며,
// createErrorStatusResolver(rules)에 그대로 넘겨 동작을 100% 보존한다.
//
// 서로 다른 라우터가 같은 에러 코드를 다른 status로 매핑하는 경우(예:
// external_advisor_business_case_not_shareable, external_advisor_invitation_not_found)가
// 실제로 존재하므로, 이 모듈은 규칙표를 통합하지 않는다 — 통합하면 동작이 바뀐다.
//
// ── 에러 처리 관용구: "throw/catch형" vs "반환값 검사형" ──────────────────
//
// 이 코드베이스에는 두 관용구가 공존한다(2026-09-03 기준 lib/ 전수 조사: throw new
// Error(...) 418곳 / return {ok, errors} 16곳). 우연한 혼재가 아니라 상황이 다르다 —
// 둘 다 유지하되 언제 어느 쪽을 쓰는지를 아래처럼 표준으로 삼는다.
//
// **기본값: throw/catch형.** 단일 작업(mutation, repo 함수, 라우터 핸들러 안의 입력
// 검증)이 첫 번째 위반 조건에서 즉시 중단돼야 하는 경우 이 방식을 쓴다.
//   if (!isValidEmail(email)) throw new Error("invalid_email");
//   ...
//   catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
// 예: saas-auth-repo.js, saas-tenant-repo.js, 모든 saas-*-routes.js 핸들러.
//
// **예외: 반환값 검사형(return {ok, errors}).** "정의/설정 하나를 검사해서 위반 사항을
// 전부 모아 한 번에 보고해야 하는" 배치 검증 함수에만 쓴다 — 첫 위반에서 멈추면 나머지
// 위반이 안 보여서 사용자가 반복 재시도를 해야 하므로 여기서는 throw가 부적합하다.
//   const errors = [];
//   if (...) errors.push("code_a");
//   if (...) errors.push("code_b");
//   return { ok: errors.length === 0, errors };
// 예: access-control-contract.js(validateRoleTemplates), risk-contract.js
// (validateRiskRuleDefinition), production-deployment-contract.js
// (evaluateProductionDeploymentConfig) — 전부 "여러 필드/여러 규칙을 한 번에 검사"하는
// 함수이고, 호출부도 결과를 즉시 throw하지 않고 errors 배열 자체를 다룬다(예: CLI
// 스크립트가 실패 사유를 전부 나열).
//
// 새 코드를 추가할 때: 단일 실패 지점이 있는 작업이면 throw/catch, 여러 위반을 모아
// 보고해야 하는 배치 검증이면 {ok, errors} 반환 — 둘 중 하나로 통일하는 마이그레이션은
// 계획하지 않는다(동작을 바꾸지 않는다는 이 트랙의 원칙에 따라 기존 코드는 그대로 둔다).

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
