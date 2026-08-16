# Bundle 10 — Business Risk Runtime

## 목적

기존 `RiskRule → Finding → Action → 재평가` 계약을 실제 PostgreSQL SaaS runtime으로 연결한다.

## 현재 live rule pack

초기 runtime은 의도적으로 좁게 시작한다.

1. `business.scope.verification_required`
   - ComplianceScope가 `UNCERTAIN`이면 확정 판단을 하지 않고 `UNCERTAIN` Finding을 만든다.
2. `business.employment.core_terms_missing`
   - 주 소정근로시간, 임금형태, 기준임금 정보가 부족하면 근로조건 점검을 위한 `UNCERTAIN` Finding을 만든다.
   - 정보 부족을 법 위반으로 단정하지 않는다.
3. `business.wage.hourly_below_minimum_2026`
   - 시급제로 명시된 근로자의 등록 시급이 2026년 최저임금보다 낮은 경우에만 `HIGH / APPLIES` Finding을 만든다.
   - 월급제/연봉제는 이 규칙에서 직접 환산하지 않는다.

## API

SaaS feature gate와 PostgreSQL runtime이 활성화된 경우:

- `POST /api/saas/organizations/:organizationId/risk-scan`
- `GET /api/saas/organizations/:organizationId/risks`
- `GET /api/saas/organizations/:organizationId/actions`
- `PATCH /api/saas/organizations/:organizationId/actions/:actionId/status`

초기에는 Owner/HR Admin의 `compliance.manage` 권한을 요구한다. Manager의 assigned-workplace 범위 기반 Risk read는 별도 scope enforcement 이후 연다.

## Risk Scan

1. Organization tenant 권한 검증
2. ComplianceScope / Employee / Employment 입력 snapshot 수집
3. versioned deterministic rule 평가
4. APPLIES / UNCERTAIN Finding upsert
5. 더 이상 적용되지 않는 기존 Finding resolve
6. APPLIES + HIGH/MEDIUM 등에 remediation Action 생성
7. run count 저장
8. audit 기록
9. Business onboarding의 `RISK_SCAN` milestone 재계산

`NOT_APPLIES`는 새 active Finding으로 노출하지 않는다. 기존 동일 Finding이 있다면 `RESOLVED`로 전환한다.

## Action 원칙

- Risk에서 생성된 Action은 Finding과 별도 lifecycle을 가진다.
- Action을 `DONE` 처리해도 Risk Finding을 즉시 해결하지 않는다.
- `DONE` 응답은 `requiresRiskReevaluation: true`를 반환한다.
- 다음 Risk Scan에서 원인이 실제로 사라졌을 때 Finding이 `RESOLVED`가 된다.
- 상태 변경은 `compliance_action_events`와 tenant `audit_logs`에 기록한다.

## 안전 원칙

- LLM은 현재 rule applicability를 결정하지 않는다.
- 법정 숫자는 canonical statutory facts와 versioned rule asset에서 가져온다.
- 사실이 없으면 추정하지 않고 `UNCERTAIN`으로 둔다.
- 현재 최저임금 live rule은 시급제만 직접 비교한다. 월급/연봉의 통상적인 최저임금 환산은 별도 검증된 계산 규칙으로 추가한다.
- Worker anonymous Case와 Business tenant data는 계속 분리한다.

## CI

PostgreSQL 17 job에서 다음을 연속 검증한다.

- 기존 PostgreSQL runtime E2E
- SaaS Auth/Tenant E2E
- Business Onboarding E2E
- Business Risk/Action E2E

Risk E2E는 다음을 확인한다.

- `UNCERTAIN` scope
- 정보부족 Finding
- 2026 시급 최저임금 미달 Finding
- Action 생성/시작/완료
- Action DONE 후 Risk 자동 해결 금지
- 데이터 수정 후 재평가 시 Finding resolve
- cross-tenant access 차단
- audit/event persistence
