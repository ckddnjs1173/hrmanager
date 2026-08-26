# 인사야 SaaS Planning Backlog — 기획 공백 감사

> 기준일: 2026-08-16
> 목적: `SAAS_BUSINESS_ROADMAP.md`가 정의한 방향을 실제 개발/판매/운영 가능한 PRD 세트로 분해한다.
> 원칙: 모든 것을 한 번에 설계하지 않는다. Phase 진입 전에 필요한 결정만 선행한다.

---

## 1. 현재 기획 상태 판정

현재 SaaS Roadmap에는 다음이 이미 정의되어 있다.

- Worker / Business / Pro 3면 제품 구조
- 공통 Case / Legal / Document 엔진 방향
- Employer Compliance Layer 포지셔닝
- Multi-tenant SaaS foundation 방향
- Business MVP 주요 기능
- Business / Pro 가격 가설
- Legal Change Monitor / Monthly Close
- Pro Workspace / Business↔Pro 협업
- Integration / Automation 장기 단계
- 수익모델과 피해야 할 referral fee 구조
- 초기 GTM / ICP / funnel / KPI 가설
- 보안/개인정보 baseline

따라서 **제품 방향을 더 넓힐 필요는 없다.**

남은 기획은 방향 추가가 아니라 아래 항목을 구현 가능한 정책/화면/데이터 계약으로 구체화하는 일이다.

---

# A. SaaS Foundation 개발 전에 반드시 확정

## A1. Identity / Organization / Tenant 모델 PRD

결정할 것:

- 개인 User 하나가 여러 Organization에 속할 수 있는지
- Organization Owner 이전 절차
- 초대 만료/재전송/취소
- 탈퇴와 회사 데이터 소유권
- 한 이메일로 Worker와 Business 계정을 같이 쓸 수 있는지
- Worker security domain과 Business tenant의 논리/물리 분리 수준
- 지점(Workspace/Site)을 Organization 하위 객체로 둘지
- Organization 삭제 grace period

산출물:

- ERD
- lifecycle diagram
- tenant boundary invariant
- deletion/offboarding policy

## A2. RBAC / Permission Matrix

현재 Role 이름만으로는 개발이 불가능하다.

권장 Role:

- Owner
- HR Admin
- Manager
- Employee
- External Advisor
- Billing Admin

각 리소스별 권한을 CRUD + sensitive action으로 표로 고정한다.

예:

| Resource/Action | Owner | HR Admin | Manager | Employee | Advisor | Billing |
|---|---|---|---|---|---|---|
| Employee read | all | all | scoped | self | shared only | no |
| Employee salary | yes | yes | configurable | self | no | no |
| Case create | yes | yes | scoped | request | shared only | no |
| Case delete | yes | yes | no | own? | no | no |
| Document approve | yes | yes | optional | no | review only | no |
| Billing | yes | no | no | no | no | yes |
| Export | yes | configurable | no | self | shared only | invoice only |

추가 결정:

- field-level permission
- 지점 scoped manager
- Advisor 공유 만료
- break-glass admin access
- impersonation 허용 여부

## A3. Audit Policy

무엇을 로그로 남기는지 이벤트 스키마를 먼저 만든다.

필수 이벤트:

- login / logout / MFA / session revoke
- member invite / role change / removal
- employee view/update/export
- case create/update/delete/share
- document generate/review/approve/download
- expert share/revoke
- billing change
- retention/delete
- legal rule version applied

결정:

- audit retention 기간
- 고객이 직접 보는 범위
- 관리자도 수정/삭제할 수 없는 append-only 수준
- IP/User-Agent 저장 범위
- Enterprise export 형식

## A4. Billing / Entitlement 상세 정책

현재 가격표보다 중요한 것은 lifecycle이다.

기획 필요:

- 월/연 결제
- Trial 시작/종료
- upgrade 즉시/다음 결제일
- downgrade 시 데이터/기능 처리
- seat/employee/branch 기준 중 무엇을 meter할지
- 사용량 초과 처리
- failed payment / retry / grace period
- suspension
- cancel at period end
- 환불 정책
- coupon/promotion
- 세금계산서/현금영수증/카드영수증 정책
- Enterprise 수기 계약과 SaaS entitlement 연결

반드시 `Plan`과 제품 기능을 코드에 하드코딩하지 않고 Entitlement로 관리한다.

## A5. Data Migration / Storage Architecture

1.0 SQLite GA와 SaaS PostgreSQL 전환 사이의 migration 계획이 필요하다.

결정:

- PostgreSQL 전환 시점
- Case / booking / expert 기존 데이터 migration 여부
- Worker / Business schema 분리
- Object Storage의 evidence/document 정책
- DB encryption / object encryption
- backup RPO/RTO
- tenant export / deletion
- soft delete vs hard delete
- retention schedule

---

# B. Business MVP 개발 전에 반드시 확정

## B1. ICP / Persona / JTBD 상세

현재 ICP 크기만 있고 실제 사용자는 더 세분화해야 한다.

최소 Persona:

1. 5~15인 대표/총무
2. 15~50인 경영지원/인사담당자
3. 30~100인 HR Manager
4. 다지점 서비스업 본사 HR
5. 외부 자문 노무사를 쓰는 회사

각 Persona마다:

- 반복 업무
- 가장 두려운 사고
- 현재 도구
- 월 발생 빈도
- 누가 돈을 승인하는지
- 도입 반대 이유
- 첫 가치 경험
- 구매 trigger

를 문서화한다.

## B2. Company Onboarding PRD

단순 입력 필드 목록이 아니라 5~10분 안에 첫 가치가 나와야 한다.

기획:

```text
계정 생성
→ 회사 기본정보
→ 사업장/인원
→ 직원 CSV 또는 1명 입력
→ 핵심 정책 질문
→ 초기 Risk Scan
→ Top 3 Risk
→ 첫 Action
```

결정:

- 어떤 질문을 필수/선택으로 할지
- 모르면 skip 가능한지
- sample data/demo mode
- CSV template
- onboarding completion 정의
- activation event
- setup checklist

## B3. Employee Lite Data Contract

필드 단위로 목적과 민감도를 고정한다.

예:

- employee_id
- display_name
- employment_type
- hire_date
- termination_date
- workplace_id
- weekly_contract_hours
- wage_type
- base_wage / hourly_wage
- probation_end
- fixed_term_end

결정:

- 주민번호를 저장하지 않는 원칙
- 계좌/건강정보 등 초기 scope 제외
- 급여 금액을 어떤 Role이 볼 수 있는지
- Employee 본인 계정 연결 여부

## B4. Risk Taxonomy / Risk Score Specification

현재 가장 큰 기능 기획 공백이다.

`긴급 2 / 주의 5`를 보여주려면 산식이 필요하다.

Risk 객체 예:

```text
RiskRule
- id
- domain
- legal_source_version
- severity
- applicability
- required_facts
- condition
- explanation
- recommended_action
- due_date_rule
- suppress_rule
```

Severity 예:

- Critical: 이미 위반/기한 임박/금전손실 큼
- High: 조치하지 않으면 위반 가능성 높음
- Medium: 문서/절차 보완 필요
- Info: 예방 권고

Risk Score를 단순 AI 점수로 만들지 않는다.

## B5. Action / Task State Machine

North Star가 `Resolved Compliance Actions`이므로 Action 객체가 제품 중심이 되어야 한다.

상태 예:

```text
Detected
→ Acknowledged
→ In Progress
→ Waiting
→ Resolved
→ Dismissed
→ Reopened
```

각 상태의 의미와 누가 변경 가능한지 정의한다.

Dismissed에는 이유를 남긴다.

- not applicable
- accepted risk
- false positive
- fixed outside Insaya

## B6. Compliance Calendar 상세

이벤트 종류마다:

- 기준일
- 알림 시작일
- 반복 주기
- escalation
- 완료 조건
- 자동 해제 조건

을 정의한다.

예:

```text
기간제 2년 경계
D-90 HR 알림
D-60 반복
D-30 High Risk
D-14 Owner escalation
계약 종료/전환 기록 시 resolve
```

## B7. Document Governance

문서 생성보다 중요한 것은 책임과 version이다.

기획:

- Template version
- Legal version
- generated_at
- generated_by
- reviewed_by
- approved_by
- delivered_at
- source facts snapshot
- superseded document
- revoke/share expiry

또한 `AI draft`와 `approved document`를 UI에서 명확히 구분한다.

## B8. Notification Policy

채널보다 먼저 알림 철학을 정한다.

- in-app
- email
- SMS/Kakao 후보
- Slack/Teams 후기

결정:

- Critical 즉시
- High daily digest 여부
- monthly close digest
- 법령변경 알림
- 사용자별 quiet hours
- 중복 억제
- escalation
- unsubscribe 가능한 알림과 필수 보안 알림 구분

---

# C. 첫 유료 출시 전에 반드시 확정

## C1. Plan Entitlement Matrix

가격표 각 행의 기능을 실제 entitlement key로 만든다.

예:

```text
risk.dashboard
risk.history
employee.limit
branch.limit
case.business
case.advanced
document.generate
document.approval
audit.retention_days
advisor.seats
api.access
sso.saml
ai.monthly_credits
```

Free/Starter/Standard/Pro별 정확한 값을 확정한다.

## C2. Trial / Paywall UX

결정:

- 어떤 기능에서 paywall 노출
- Trial 중 모든 기능인지 Pro 일부인지
- Trial 종료 후 read-only 여부
- 생성한 문서 접근 유지 여부
- downgrade 시 직원 초과 데이터 처리
- card required 여부
- 재Trial 정책

## C3. Pricing Validation Plan

가격을 코드로 고정하기 전에 인터뷰/실험한다.

필수 실험:

- 49k / 69k Starter
- employee count vs flat tier
- annual discount
- Pro feature willingness-to-pay
- Advisor 포함 여부

가격 인터뷰 질문과 결과 기록 포맷을 미리 만든다.

## C4. Sales Process / CRM

Inbound만 기다리지 않는다.

Funnel state:

```text
Lead
→ Qualified
→ Demo
→ Trial
→ Activated
→ Proposal
→ Paid
→ Expansion
→ Churned
```

필수:

- ICP qualification
- demo script
- objection handling
- proposal template
- pilot terms
- sales owner
- reason lost taxonomy

## C5. Customer Success / Support

첫 100개 고객은 제품 기능만으로 유지되지 않는다.

기획:

- onboarding call 여부
- support 채널
- 응답 SLA
- help center
- 월간 health score
- inactive customer intervention
- churn survey
- cancellation save offer
- data export/offboarding

## C6. Billing Operations

운영자 관점 화면 필요:

- subscriptions
- failed payments
- trial ending
- invoices/receipts
- coupons
- manual entitlement
- refund
- enterprise contract

관리자가 DB를 직접 수정하는 운영은 금지한다.

---

# D. Legal / Compliance Operations 기획

## D1. Legal Change Governance

Legal Registry 업데이트가 제품 전체에 영향을 주므로 운영 SOP가 필요하다.

```text
변경 발견
→ 공식 source 확보
→ 영향 rule 식별
→ effective date
→ test fixture
→ peer review
→ publish
→ affected tenant 계산
→ notification/action
```

정의할 것:

- 누가 승인하는지
- critical law update SLA
- source freshness
- rollback
- 과거 Case 재계산 여부
- 기존 문서에 변경 사실 표시 여부

## D2. Content Governance

가이드/계산기/Case의 숫자와 설명이 충돌하지 않게 한다.

- canonical source
- content owner
- reviewed_at
- next_review_at
- official source
- stale flag
- archive policy

## D3. AI Governance

- prompt/version registry
- model/provider version
- output policy
- AI-generated 표시
- PII redaction
- prompt injection boundary
- human review requirement
- evaluation dataset
- hallucination incident process

---

# E. Insaya Pro 개발 전에 반드시 확정

## E1. Pro Persona / Office Model

- Solo
- 2~5인 사무소
- 노무법인
- 사무직원/실장
- 소속 노무사

Role/permission을 Business와 별도로 설계한다.

## E2. Client / Matter / Case 관계

법률사무 CRM의 핵심 모델을 먼저 고정한다.

```text
Client
└ Matter
  ├ Intake
  ├ Case Facts
  ├ Deadline
  ├ Evidence
  ├ Task
  ├ Document
  ├ Note
  └ Communication
```

한 Client가 여러 Matter를 가질 수 있어야 한다.

## E3. Conflict / Confidentiality

전문가 Workspace에서는 추가 기획이 필요하다.

- conflict check field
- client consent
- staff access
- matter ethical wall
- download/export log
- share expiry
- matter close/retention

## E4. Secure Intake Builder

노무사가 질문지를 만들 수 있게 할지, 인사야 표준 template만 제공할지 결정한다.

MVP는 표준 template + 일부 custom question 정도가 적절하다.

## E5. Time / Billing은 초기 제외 여부

Pro SaaS가 업무시간/청구서까지 갈 것인지 결정해야 한다.

초기에는 Matter/Task/Document/Portal에 집중하고 professional billing/accounting은 제외하는 방향을 우선 검토한다.

---

# F. Enterprise 전에 반드시 확정

## F1. Security / Procurement Pack

- DPA
- subprocessor list
- security overview
- data flow diagram
- incident response
- BCP/DR
- vulnerability management
- access review
- SSO/SAML
- SCIM 후보
- customer-controlled retention

## F2. SLA / SLO

정의:

- uptime target
- support response
- incident severity
- notification window
- RPO
- RTO

## F3. Data Residency / Export / Deletion

- 저장 국가/리전
- tenant export format
- 계약 종료 후 retention
- backup에서 완전 삭제 처리 방식
- legal hold 후보

## F4. Integration Contract

API를 만들기 전에:

- API versioning
- OAuth/service account
- webhook signing
- idempotency
- rate limit
- retry
- event schema version

을 고정한다.

---

# G. Unit Economics / 비용 기획

현재 매출 시나리오는 있으나 비용모델이 없다.

반드시 추적할 비용:

- AI inference
- DB/storage
- object storage
- email/SMS/Kakao
- payment fee
- monitoring/logging
- support labor
- sales CAC

핵심 지표:

```text
Gross Margin
ARPA
AI Cost / Active Org
Infra Cost / Active Org
Support Cost / Org
CAC
LTV
CAC Payback
Net Revenue Retention
```

기능 entitlement와 AI quota는 gross margin을 기준으로 설계한다.

---

# H. Analytics / Experimentation 기획

모든 주요 funnel event를 제품 출시 전에 정의한다.

예:

```text
risk_check_started
risk_check_completed
organization_created
employee_imported
risk_detected
action_started
action_resolved
document_generated
advisor_invited
trial_started
paywall_viewed
checkout_started
subscription_started
subscription_canceled
```

이벤트에는 불필요한 PII를 넣지 않는다.

Dashboard:

- Acquisition
- Activation
- Retention
- Revenue
- Risk Resolution
- AI cost

---

# I. 최종 우선순위

## 지금부터 1.0 GA 전/직후

1. 1.0 durable storage / restore
2. SaaS Identity/Tenant ERD
3. RBAC matrix
4. Billing/Entitlement lifecycle
5. Data architecture/migration

## Business MVP 착수 직전

6. Persona/JTBD
7. Onboarding PRD
8. Employee Lite contract
9. Risk taxonomy/scoring
10. Action state machine
11. Calendar/escalation
12. Document governance
13. Notification policy

## 첫 결제 기능 개발 직전

14. Plan entitlement matrix
15. Trial/paywall UX
16. pricing experiment
17. sales funnel
18. customer success/support
19. billing operations
20. unit economics
21. analytics event plan

## Pro 착수 직전

22. Pro office roles
23. Client/Matter data model
24. conflict/confidentiality
25. intake builder scope

## Enterprise 착수 직전

26. security/procurement pack
27. SLA/SLO
28. data residency/export/deletion
29. integration contract

---

# J. 현재 결론

`SAAS_BUSINESS_ROADMAP.md` 이후 더 필요한 것은 새 기능 아이디어가 아니다.

**이제는 위 29개 기획 항목을 Phase 진입 전에 하나씩 정책/ERD/state machine/화면흐름/entitlement 계약으로 구체화하는 작업이 필요하다.**

특히 가장 먼저 설계해야 할 다섯 항목은 다음이다.

1. Identity / Organization / Tenant ERD
2. RBAC Permission Matrix
3. Billing / Entitlement Lifecycle
4. Data Migration / Storage Architecture
5. Business Risk Taxonomy / Action State Machine

이 다섯 가지가 결정되면 SaaS Foundation과 Business MVP는 구현 순서가 거의 자동으로 나온다.
