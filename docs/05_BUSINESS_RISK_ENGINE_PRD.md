# 인사야 Business — Risk Engine PRD

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 관련 코드: `lib/risk-contract.js`
> 관련 DB: `db/postgres/030_business_risk.sql`

---

## 1. 제품 목표

Business 첫 화면의 핵심은 HR 통계가 아니라 **노무 리스크와 해야 할 조치**다.

사용자가 원하는 답은:

```text
직원 24명
이번달 입사 3명
```

보다:

```text
긴급 1
주의 4
사실확인 필요 2
이번 달 미완료 조치 5
```

에 가깝다.

Risk Engine은 회사/직원/근로관계/사업장 사실을 Versioned Legal Registry와 결정론 Rule에 적용해 위험신호를 생성한다.

---

# 2. 핵심 원칙

## 2.1 LLM이 법 적용을 결정하지 않는다

```text
Company / Workplace / Employee / Employment Facts
→ deterministic RiskRule
→ applicability / severity / due date / action
→ AI explanation
```

AI는 설명, 질문 정리, 사용자 친화적 문구에 사용한다.

다음은 Rule Engine이 결정한다.

- 적용 여부
- 법률 기준일
- 금액
- 기한
- severity
- required facts
- recommended action type

---

## 2.2 모르면 `UNCERTAIN`

사실이 부족한데 억지로 안전/위험 판정을 내리지 않는다.

예:

```text
Risk applicability = UNCERTAIN
missingFacts = [...]
```

사용자에게:

> 이 항목은 현재 정보만으로 적용 여부를 확정하기 어렵습니다.

를 보여주고 추가 사실을 요청한다.

ComplianceScope가 불명확할 때도 동일하다.

---

## 2.3 초기 숫자형 Risk Score를 만들지 않는다

초기 Dashboard는 다음을 사용한다.

- Critical
- High
- Medium
- Info
- Uncertain
- Open Actions

`82점` 같은 단일 숫자는 법률리스크의 서로 다른 성격을 과도하게 단순화할 수 있다.

충분한 실제 데이터가 쌓인 뒤 별도 scoring 모델을 검토한다.

---

# 3. Risk Domain

초기 taxonomy:

- workplace_scope
- employment_contract
- wage
- worktime
- annual_leave
- termination
- rules_of_employment
- other

기존 Worker Core 5의 Legal/Calculation Engine을 최대한 재사용한다.

Business 전용으로 새 법률 엔진을 복제하지 않는다.

---

# 4. Rule Definition

RiskRule 최소 계약:

```text
id
version
domain
title
severity
requiredFacts
legalSourceIds
evaluatorKey
recommendedActionKey
```

추후:

```text
effectiveFrom
effectiveTo
applicabilityScope
subjectType
dueDateRule
suppressRule
```

을 확장한다.

Rule ID는 의미가 바뀌지 않는 동안 안정적으로 유지한다.

법률/판정 로직이 바뀌면 version을 올린다.

---

# 5. Rule Versioning

예:

```text
contract.written_terms.missing@2026.1
```

Risk Finding에는 반드시:

- rule_id
- rule_version
- legal_source_ids
- detected_at
- last_evaluated_at

를 기록한다.

나중에 법이 바뀌어도 당시 왜 해당 Finding이 생성됐는지 재현할 수 있어야 한다.

---

# 6. Input Model

Risk Engine 입력은 raw 화면 form이 아니라 domain fact다.

예:

```text
Organization
BusinessProfile
Workplace[]
ComplianceScope[]
Employee[]
Employment[]
Contract[] (후속)
Attendance summary (후속 integration)
Leave summary
BusinessCase facts
```

모든 Rule이 전체 DB를 직접 읽지 않는다.

Evaluation Context를 먼저 구성하고 Rule은 해당 context만 받는다.

---

# 7. Evaluation Context

개념:

```text
RiskEvaluationContext
- organization
- complianceScope
- subject
- referenceDate
- facts
- legalRegistryVersion
```

referenceDate는 매우 중요하다.

현재 법이 아니라 해당 사건/근로관계/기간에 적용되는 rule version을 선택해야 한다.

---

# 8. Applicability

세 상태:

## APPLIES

Rule 조건에 해당한다.

Finding을 OPEN하고 필요 시 Action을 생성한다.

## NOT_APPLIES

해당하지 않는다.

기존 Finding이 OPEN이었다가 재평가 결과 NOT_APPLIES가 되면 자동 삭제하지 않고 RESOLVED event를 남긴다.

## UNCERTAIN

requiredFacts가 없거나 ComplianceScope가 불확실하다.

사용자에게 추가 정보를 요청한다.

UNCERTAIN은 Critical/High count에 포함하지 않고 별도 count한다.

---

# 9. Severity

## CRITICAL

이미 위반 가능성이 매우 높거나 즉시/매우 가까운 조치기한이 있고 손실/분쟁 영향이 큰 상태.

## HIGH

조치하지 않으면 법적 리스크로 이어질 가능성이 높은 상태.

## MEDIUM

절차/문서/운영 보완이 필요한 상태.

## INFO

예방 안내, 앞으로 확인할 항목.

Severity는 AI가 문맥을 읽고 임의 조절하지 않는다.

Rule definition/evaluator가 결정한다.

---

# 10. Finding

Risk Finding은 Rule 평가 결과의 durable record다.

```text
RiskFinding
- organization
- complianceScope
- subject
- fingerprint
- rule id/version
- severity
- applicability
- status
- explanation
- missingFacts
- legalSourceIds
- recommendedActionKey
- dueAt
- detectedAt
- lastEvaluatedAt
```

---

# 11. Fingerprint / 중복 방지

동일 회사/대상/Rule/version이 매 스캔마다 새 Finding을 만들면 안 된다.

Fingerprint 기본 구성:

```text
organization
+ complianceScope
+ subject type/id
+ rule id
+ rule version
```

SHA-256으로 안정적인 fingerprint를 만든다.

DB unique:

```text
organization_id + fingerprint
```

재평가 시 기존 Finding을 업데이트하고 event를 남긴다.

---

# 12. Finding Lifecycle

```text
OPEN
→ ACKNOWLEDGED
→ RESOLVED

OPEN / ACKNOWLEDGED
→ SUPPRESSED
→ OPEN (suppression 만료/해제)
```

Rule 재평가가 NOT_APPLIES가 되면 RESOLVED.

법 변경으로 새 version이 적용되면 기존 version Finding을 history로 남기고 새 fingerprint를 만들 수 있다.

---

# 13. Suppression

사용자가 Risk를 숨길 수는 있지만 삭제하지 않는다.

필수:

- reason
- actor
- until(optional)
- audit

예:

```text
"외부 노무사 검토 중"
"이미 별도 정책으로 처리"
"사실관계 오류 - 데이터 수정 예정"
```

SUPPRESSED는 Dashboard active count에서 제외하되 history는 유지한다.

---

# 14. Action 생성

초기 기본:

Critical / High / Medium + APPLIES → Action 생성 후보.

Info는 기본적으로 자동 Action을 만들지 않는다.

Action 예:

```text
근로계약 필수항목 확인
계약 갱신
근로시간 사실 확인
연차 정산
해고 절차 체크
취업규칙 검토
```

Action full state machine은 후속 문서에서 더 구체화한다.

초기 status:

- OPEN
- IN_PROGRESS
- BLOCKED
- DONE
- DISMISSED

---

# 15. Risk → Business Case

모든 Finding을 Case로 만들지 않는다.

단순 보완:

```text
Finding
→ Action
→ Done
```

복잡한 사실확인/문서/법률 절차가 필요한 경우:

```text
Finding
→ Business Case
→ fact intake
→ legal analysis
→ document
→ expert review(optional)
→ action complete
```

Risk Engine은 Case acquisition engine 역할도 한다.

---

# 16. Evaluation Run

한 번의 scan을 `risk_evaluation_runs`로 기록한다.

필수:

- organization
- compliance scope(optional)
- trigger
- legal registry version
- input snapshot hash
- started/finished
- result counts
- failure code

Trigger 예:

- onboarding
- manual
- employee_change
- employment_change
- monthly_close
- legal_change
- integration_sync

초기에는 onboarding/manual부터 구현한다.

---

# 17. 재평가 Trigger

Business MVP:

- 회사 정보 변경
- Employee/Employment 변경
- 수동 전체 점검

다음 단계:

- nightly/monthly schedule
- 계약 만료/수습 종료
- 법령 version update
- HRIS/근태/급여 sync

Rule별 dependency를 두어 모든 변경에 전체 scan을 돌리지 않는 최적화는 이후 한다.

초기에는 correctness를 우선한다.

---

# 18. Dashboard

기본 card:

```text
Critical
High
Medium
사실확인 필요
미완료 Action
```

정렬:

1. severity
2. due date
3. detected date

필터:

- domain
- workplace/scope
- employee/subject
- status
- due date

---

# 19. 첫 Business Onboarding 연결

```text
익명 노동법 자율점검
→ 요약 결과 제공
→ 결과 저장
→ User/Organization 생성
→ 노무 DNA 입력
→ Workplace/ComplianceScope
→ Employee 1명 또는 CSV
→ onboarding Risk Evaluation Run
→ Top Risks
→ 첫 Action
```

Activation 정의:

```text
Organization created
+ Employee >= 1
+ Risk Scan completed
+ Action >= 1 created/completed
```

---

# 20. 초기 Rule Pack 범위

첫 MVP는 너무 넓히지 않는다.

## Pack A — Employment Contract

- 계약/필수정보 점검
- 기간/갱신 관련 점검
- 수습 관련 확인

## Pack B — Worktime / Wage

- 근로시간 관련 위험 신호
- 수당/임금 검증에 필요한 사실 누락
- 지급일/임금 구조 점검

## Pack C — Annual Leave

- 연차 발생/정산/절차 확인 항목

## Pack D — Termination

- 해고 전 사실확인
- 서면/예고/절차 관련 체크

## Pack E — Organization Scope

- 상시근로자수/적용범위 판단에 필요한 정보
- 취업규칙 등 조직규모 기반 의무 확인

구체 법률 조건은 기존 Legal Registry와 검증된 신규 rule module에서 구현한다.

PRD 문구만으로 판정식을 만들지 않는다.

---

# 21. Legal Registry 연결

Risk Rule은 source id를 직접 문자열로 지어내지 않는다.

기존 Canonical Legal Registry source ID를 참조한다.

검증:

```text
RiskRule.legalSourceIds
⊆ Canonical Legal Sources
```

법률 source가 없거나 verifiedAt가 유효하지 않으면 production Rule을 활성화하지 않는다.

---

# 22. AI Explanation

AI 입력:

- deterministic result
- relevant facts
- missing facts
- legal source metadata
- action

AI 출력:

- 쉬운 설명
- 사용자에게 물어볼 추가 질문
- 왜 조치가 필요한지

AI가 변경할 수 없는 값:

- applicability
- severity
- 법률 source
- amount
- deadline
- rule version

---

# 23. Audit

필수 Audit/Event:

- risk scan started/completed/failed
- Finding detected
- severity/version change
- acknowledged
- suppressed/unsuppressed
- resolved/reopened
- Action created/completed/dismissed
- Business Case escalation
- legal rule version applied

---

# 24. 실패 처리

한 Rule evaluator 오류 때문에 전체 Organization scan 결과를 조용히 정상으로 표시하면 안 된다.

Evaluation Run:

```text
status = FAILED
error_code
```

또는 부분 성공 정책을 도입한다면 failed rule count를 명시한다.

초기 MVP는 scan 결과 완전성을 우선해 critical evaluator failure 시 run FAILED가 안전하다.

---

# 25. 성능

초기 ICP 5~100인 기준.

최적화 우선순위는 낮다.

먼저:

- deterministic correctness
- tenant isolation
- version reproducibility
- duplicate prevention

을 보장한다.

대량 고객 이후 dependency graph/incremental evaluation을 추가한다.

---

# 26. KPI

Risk Engine 자체 KPI:

- Scan completion rate
- Finding → Action conversion
- Action completion rate
- Uncertain → facts completed rate
- Reopened finding rate
- Time to resolve Critical/High

제품 North Star와 연결:

**Monthly Resolved Compliance Actions per Active Company**

---

# 27. 개발 순서

```text
1. Risk contract/taxonomy
2. Risk persistence
3. Rule registry adapter
4. evaluation context builder
5. first Contract rules
6. first Worktime/Wage rules
7. Finding repository
8. Action creation
9. Risk Dashboard API
10. onboarding scan
11. UI
12. legal-change/monthly triggers
```

---

# 28. 완료 조건

Business Risk Engine MVP는 다음을 만족해야 한다.

- 같은 Rule/subject 재평가 시 duplicate Finding 없음
- missing facts는 UNCERTAIN
- AI 없이 동일 결과 재현 가능
- Rule version/source 기록
- ComplianceScope 불확실성 처리
- Critical/High/Medium Finding에서 Action 생성
- suppression reason/audit
- resolved/reopened history
- cross-tenant IDOR 차단
- Dashboard severity count 정확
- onboarding scan → first Action 흐름 동작
