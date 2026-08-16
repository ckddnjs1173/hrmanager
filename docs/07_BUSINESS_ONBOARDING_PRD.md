# 인사야 Business — Onboarding / Activation PRD

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 목표 시간: 5~10분 안에 첫 Risk Scan
> 관련 코드: `lib/business-onboarding-contract.js`

---

## 1. 목표

Business 온보딩의 목표는 회사정보를 완벽히 입력받는 것이 아니다.

**최소 사실만으로 첫 노동법 Risk Scan과 첫 조치를 경험하게 하는 것**이 목표다.

잘못된 흐름:

```text
가입
→ 회사정보 30개 입력
→ 직원정보 전부 입력
→ 각종 규정 업로드
→ 설정 완료
→ 드디어 대시보드
```

목표 흐름:

```text
무료 Risk Check 또는 가입
→ 회사 기본정보
→ 사업장
→ 직원 1명 또는 CSV
→ 핵심 정책 질문
→ Risk Scan
→ Top Risk
→ 첫 Action / 문서
```

---

# 2. 유입 경로

## A. 공개 사업주 자율점검

현재 인사야의 무료 사업주 도구를 가장 중요한 acquisition funnel로 사용한다.

```text
익명 자율점검
→ 결과 제공
→ "이 결과를 저장하고 계속 관리하기"
→ User
→ Organization
→ Onboarding
```

가입 전에 가치를 보여준다.

## B. Business 직접 가입

```text
Business 시작
→ User
→ Organization
→ Onboarding
```

## C. Advisor 초대

향후 노무사가 고객사를 초대할 수 있다.

단, Pro가 고객사 Owner가 되거나 고객 데이터를 자동 소유하지 않는다.

---

# 3. 단계

```text
1. COMPANY_PROFILE
2. WORKPLACES
3. COMPLIANCE_SCOPE
4. EMPLOYEES
5. POLICY_FACTS
6. RISK_SCAN
7. FIRST_ACTION
8. COMPLETE
```

화면을 꼭 8페이지로 만들 필요는 없다. 단계는 데이터/이벤트 상태를 의미한다.

---

# 4. Company Profile

초기 질문:

- 업종
- 급여 지급일
- 기본 근무형태/주 근로시간
- 시급/월급/연봉 중심인지
- 포괄임금 운영 여부
- 취업규칙 존재 여부
- 외부 자문 노무사 존재 여부

모든 질문에 답을 강제하지 않는다.

모르는 항목:

```text
confidence = UNKNOWN
```

으로 저장할 수 있다.

Risk Engine은 UNKNOWN을 사실처럼 사용하지 않는다.

---

# 5. Workplace

최소 1개 사업장을 생성한다.

필수:

- 이름

권장:

- 지역/주소
- 운영 상태

본사 1곳만 있는 고객은 기본 사업장을 빠르게 생성할 수 있어야 한다.

여러 지점은 이후 추가 가능하다.

---

# 6. Compliance Scope

사용자에게 법률 용어인 `사업 또는 사업장`을 처음부터 복잡하게 묻지 않는다.

UX 예:

> 여러 지점을 하나의 조직에서 통합 운영하나요?

> 인사·급여·채용·지휘체계가 지점별로 독립되어 있나요?

응답을 바탕으로 initial grouping을 제안할 수 있지만 확신이 없으면:

```text
ComplianceScope.status = UNCERTAIN
```

으로 둔다.

UNCERTAIN 때문에 전체 온보딩을 중단하지 않는다.

Risk 결과에서 적용범위 사실확인 항목을 보여준다.

---

# 7. Employee 입력

첫 가치를 위해 최소 Employee 1명만 있으면 Risk Scan을 시작할 수 있게 한다.

두 경로:

## 빠른 입력

- 이름/식별명
- 입사일
- 계약형태
- 주 계약시간
- 임금형태
- 사업장

## CSV

초기 CSV 필드:

```text
employee_number
display_name
hire_date
termination_date(optional)
employment_type
workplace
weekly_contract_hours
wage_type
probation_end(optional)
fixed_term_end(optional)
```

주민등록번호, 계좌번호, 건강정보는 받지 않는다.

---

# 8. CSV Import

업로드 즉시 Employee를 생성하지 않는다.

```text
upload
→ VALIDATING
→ preview
→ accepted/rejected row 표시
→ confirm
→ IMPORTING
→ COMPLETED
```

부분 오류가 있으면 어떤 행이 왜 거절됐는지 보여준다.

Import summary는:

```text
total = accepted + rejected
```

를 만족해야 한다.

파일 원본은 필요 이상 장기보관하지 않는다.

---

# 9. Policy Facts

Risk Engine 정확도를 높이는 최소 질문이다.

예:

- 근로계약서를 서면/전자 형태로 교부하는가
- 근로시간 기록이 있는가
- 연차 관리 방식이 있는가
- 취업규칙이 있는가
- 외부 노무사 검토 체계가 있는가

질문 문구 자체로 법 위반을 단정하지 않는다.

사용자가 `모름`을 선택할 수 있게 한다.

---

# 10. Fact Confidence

초기 값:

```text
KNOWN
UNKNOWN
ESTIMATED
VERIFIED
```

예:

```text
상시근로자 수: 8명
confidence = ESTIMATED
```

```text
계약서 교부 여부: 모름
confidence = UNKNOWN
```

Risk Rule이 높은 확실성을 필요로 하면 UNKNOWN/ESTIMATED를 UNCERTAIN Finding으로 처리할 수 있다.

---

# 11. Risk Scan 진입 조건

최소 조건:

- Company Profile 저장
- Workplace 1개 이상

Employee가 아직 없더라도 Organization-level Risk는 일부 실행 가능하다.

다만 **Business Activation**에는 Employee 1명 이상을 요구한다.

ComplianceScope가 UNCERTAIN인 것은 scan 차단 사유가 아니다.

---

# 12. Initial Risk Scan

첫 Scan trigger:

```text
trigger_type = onboarding
```

결과는 우선순위 높은 항목부터 보여준다.

예:

```text
확인이 필요한 항목 2
High 1
Medium 3
```

숫자형 회사 점수는 초기 버전에 표시하지 않는다.

---

# 13. Top Risk UX

첫 화면에서 모든 Finding을 한꺼번에 교육하지 않는다.

Top 3 중심:

```text
1. 왜 확인해야 하는지
2. 현재 어떤 사실을 기준으로 잡았는지
3. 무엇을 추가로 확인해야 하는지
4. 다음 Action
5. 근거
```

`UNCERTAIN`은 빨간 경고가 아니라 **사실확인 필요**로 구분한다.

---

# 14. First Action

Risk Scan 후 즉시 다음 행동을 하나 제안한다.

예:

- 계약서 정보 확인
- Employee 근로시간 사실 추가
- 문서 초안 생성
- 해고 전 점검 Case 시작

단순히 Action row가 자동 생성됐다는 이유만으로 Activation으로 보지 않는다.

사용자가 다음 중 하나를 해야 한다.

- 첫 Action 시작
- 첫 Action 완료
- 첫 Document 생성

---

# 15. Activation 정의

필수 milestone:

```text
organizationActive
companyProfileSaved
workplaceCreated
employeeCountAtLeastOne
riskScanCompleted
```

그리고 다음 중 1개:

```text
firstActionStarted
OR firstActionCompleted
OR firstDocumentGenerated
```

모두 만족했을 때:

```text
Business Activated = true
```

가입/로그인만으로 Activation으로 보지 않는다.

---

# 16. Onboarding Completion과 Activation 차이

Onboarding Completion:

> 기본 설정과 초기 Risk Scan까지 가능한 상태가 됐는가?

Activation:

> 사용자가 실제로 첫 Compliance 조치에 참여했는가?

따라서 Onboarding 완료 고객 중 Activation하지 않은 고객을 별도로 추적한다.

이 그룹이 제품 개선의 중요한 대상이다.

---

# 17. Setup Checklist

온보딩 이후 대시보드에도 checklist를 남긴다.

예:

```text
✓ 회사 기본정보
✓ 사업장 1개
✓ 직원 1명
✓ 첫 Risk Scan
○ 첫 조치 시작
○ 팀원 초대
○ 직원 CSV 추가
○ 외부 노무사 연결
```

핵심 Activation 이후의 항목은 선택사항이다.

---

# 18. Demo / Sample Data

초기 영업/체험을 위해 Demo Organization을 지원할 가치가 있다.

원칙:

- 실제 고객 데이터와 명확히 분리
- DEMO 표시
- 결제/전문가 공유 등 민감 action 제한
- sample employee/risk를 실제 법률판정 데이터처럼 오해시키지 않음

MVP 필수는 아니지만 Sales 도구로 우선순위가 높다.

---

# 19. Abandon / Resume

온보딩은 중간저장한다.

```text
NOT_STARTED
→ IN_PROGRESS
→ COMPLETED
```

장기 미진행:

```text
ABANDONED
```

으로 분석상 표시할 수 있지만, 사용자가 돌아오면 이어서 진행 가능하게 한다.

ABANDONED 때문에 Organization 데이터를 삭제하지 않는다.

---

# 20. BLOCKED

기술 오류나 권한 문제 등 사용자가 현재 진행할 수 없는 경우에만 `BLOCKED`를 사용한다.

사용자가 어떤 법률 사실을 모른다는 이유로 전체 온보딩을 BLOCKED시키지 않는다.

그 경우 fact confidence를 UNKNOWN으로 두고 Risk Finding을 UNCERTAIN으로 만든다.

---

# 21. 권한

초기 Organization 생성자는 Owner.

Onboarding 수정:

- Owner
- HR Admin

Manager/Employee/Advisor/Billing Admin은 초기에는 회사 기본 온보딩을 수정하지 않는다.

CSV import는 Employee write 권한 + entitlement를 요구한다.

---

# 22. Entitlement

Free/Trial에서도 첫 Risk Scan까지 경험 가능해야 한다.

유료 전환을 위해 핵심 가치를 숨기지 않는다.

과금 차등 후보:

- Employee limit
- 전체 Risk history
- 자동 recurring scan
- Document Workflow
- Advisor collaboration
- Audit retention
- bulk import

---

# 23. 이벤트

최소 analytics/business events:

- onboarding.started
- company_profile.saved
- workplace.created
- compliance_scope.created/uncertain
- employee.manual.created
- employee_import.started/completed/failed
- policy_facts.saved
- risk_scan.started/completed/failed
- top_risk.viewed
- first_action.started/completed
- first_document.generated
- business.activated
- onboarding.completed

보안/민감 변경은 별도 Audit에도 남긴다.

---

# 24. KPI

Funnel:

```text
Risk Check visitor
→ signup
→ Organization created
→ Employee >= 1
→ Risk Scan completed
→ Activation
→ Trial conversion
```

핵심:

- time to first risk
- onboarding completion rate
- activation rate
- step drop-off
- CSV error rate
- UNKNOWN fact rate
- UNCERTAIN Finding → fact completed rate
- activation → paid conversion

---

# 25. 완료 조건

- 온보딩 중간 저장/재개
- 모름(UNKNOWN) 지원
- Workplace 최소 1개
- ComplianceScope uncertainty가 전체 진행을 막지 않음
- Employee 수동 1명 입력 가능
- CSV preview/validation 계약
- 첫 Risk Scan
- Top Finding 노출
- Action 시작 또는 Document 생성
- Activation event 정확히 1회 기록
- cross-tenant onboarding access 차단
- 권한/entitlement 적용
- 모바일에서도 완료 가능한 입력량

---

# 26. 구현 순서

```text
Onboarding session repository
→ company profile form
→ workplace
→ compliance scope questions
→ employee manual
→ CSV validation/import
→ policy facts
→ Risk Scan service
→ Top Risk
→ First Action
→ activation evaluator
→ checklist/dashboard handoff
```
