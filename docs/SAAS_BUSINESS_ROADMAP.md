# 인사야 SaaS & Monetization Roadmap — FINAL DIRECTION

> 기준일: 2026-08-16
> 상태: 1.0 이후 제품/사업 확장의 최상위 기획안
> 선행 조건: 1.0 GA의 durable storage / backup / restore 완료

---

## 1. 최종 사업 정의

인사야의 최종 형태는 단순 AI 노무상담 서비스가 아니다.

**근로자에게는 노동문제 해결 플랫폼, 사업주에게는 노동법 리스크 운영 SaaS, 공인노무사에게는 사건·고객 운영 SaaS를 제공하는 노동 Compliance OS**를 목표로 한다.

제품의 공통 핵심 객체는 계속 `Case`를 유지한다.

```text
문제/리스크
→ 사실 구조화
→ Legal Registry
→ 결정론 계산·판단
→ 증거/문서
→ 조치/기한
→ 담당자/전문가 협업
→ 완료/감사기록
```

B2C, B2B, 전문가 제품을 서로 다른 서비스로 다시 만드는 것이 아니라 같은 Case/Legal/Document 엔진 위에 권한과 Workspace를 다르게 제공한다.

---

## 2. 사업 구조

### A. Insaya Worker — 무료 B2C

목표는 직접 매출보다 검색 유입, 신뢰, 제품 데이터, 브랜드 인지도다.

핵심 기능:

- Core 노동 Case
- 계산기
- 노동 가이드
- 증거 체크
- 공식기관 절차
- 문서 초안
- Case Report
- 전문가에게 전달하기 위한 안전한 요약

초기에는 소비자에게 법률판단 자체를 유료화하지 않는다.

### B. Insaya Business — 사업주 SaaS

핵심 매출원.

대상:

- 전담 인사/노무 담당자가 없는 5~50인 사업장
- 50~100인 규모로 커지며 노무관리 체계화가 필요한 회사
- 여러 지점/매장을 운영하는 서비스업·리테일·현장형 사업장
- 외부 노무사와 자문은 하지만 일상적인 노무 운영은 내부에서 처리해야 하는 회사

한 줄 가치:

**“사고가 난 뒤 상담하는 것이 아니라, 계약·근태·임금·연차·해고를 사고 전에 점검하고 기록하는 SaaS.”**

### C. Insaya Pro — 공인노무사 SaaS

두 번째 구독 매출원.

대상:

- 1인 노무사 사무소
- 소규모 노무법인
- 기업자문 고객을 여러 곳 관리하는 노무사
- 상담/사건 intake 정리가 반복되는 사무소

한 줄 가치:

**“상담이 들어오기 전 자료 정리부터 사건 진행·문서·고객 공유까지 한곳에서 운영하는 노무사 Workspace.”**

### D. Insaya Network — 양면 연결

Worker / Business / Pro를 연결하지만, 사건 소개 수수료를 중심으로 사업화하지 않는다.

원칙:

- 사용자가 직접 전문가를 선택
- 전문가 검색/프로필은 객관적 정보 중심
- 명시적 동의 후 자료 전달
- 사건별 소개 수수료/성공보수 배분을 기본모델로 두지 않음
- 노무사 매출은 SaaS 이용료로 발생

---

## 3. 시장 포지셔닝

인사야는 초기부터 Flex, Shiftee 등 종합 HRIS/근태 SaaS와 모든 기능으로 경쟁하지 않는다.

### 경쟁하지 않을 영역 — 초기

- 출퇴근 GPS/비콘
- 복잡한 교대근무 스케줄 엔진
- 전체 급여대장/원천세/연말정산
- 평가/성과관리
- 채용 ATS
- 비용관리

### 인사야가 먼저 장악할 영역

- 노동법 적용범위 판단
- 사건/분쟁 예방
- 노동법 변경 관리
- 근로계약 리스크
- 임금·수당 검증
- 연차/근로시간 위험 신호
- 해고 전 체크
- 법적 기한/조치 리마인더
- 증거/문서/감사 trail
- 외부 노무사 협업

즉 **HRIS를 대체하지 않고 HRIS 위의 Labor Compliance Layer**로 진입한다.

장기적으로는 API/CSV를 통해 기존 HRIS·근태·급여시스템 데이터를 받아 Legal Engine이 점검한다.

---

## 4. 핵심 해자(Moat)

### 4.1 Versioned Legal Registry

- 법률/시행령/고시/판례/기관 가이드
- 시행일 경계
- 사업장 규모별 적용범위
- 사건 기준일 적용
- source verification

### 4.2 Deterministic Rules

금액·기한·법정 기준은 LLM이 추정하지 않는다.

```text
Company Facts / Employee Facts / Case Facts
→ deterministic rules
→ amount / deadline / applicability / warning
→ AI explanation
```

### 4.3 Company Compliance Graph

회사의 다음 데이터를 연결한다.

```text
회사
├ 직원
├ 계약
├ 근로시간
├ 임금 구조
├ 연차
├ 회사규정
├ 문서
├ 사건
├ 기한
└ 조치/감사기록
```

시간이 지날수록 회사별로 맞춤화되는 Compliance Graph가 전환비용을 만든다.

### 4.4 Case → Expert Handoff

전문가에게 전화하기 전에 이미 다음이 정리된 상태를 만든다.

- 사실관계
- 날짜
- 금액
- 법률 쟁점
- missing facts
- 증거
- 문서
- 질문 목록

이는 사용자·기업·노무사 모두의 상담시간을 줄인다.

---

# 5. SaaS 개발 단계

## Phase 0 — Insaya 1.0 GA

현재 1.0 Core Product를 실제 사용자 데이터를 보관할 수 있는 상태로 마무리한다.

필수:

- durable DB/storage
- restart/redeploy survival test
- off-host backup
- restore rehearsal
- readiness production green
- Core 5 production smoke

이 단계에서는 새 SaaS 기능 때문에 GA를 미루지 않는다.

---

## Phase 1 — SaaS Foundation

### 목표

단일 익명 Case 앱을 **계정·회사·구독이 존재하는 multi-tenant SaaS**로 확장한다.

### 핵심 모델

```text
User
Organization
Membership
Role
Employee
Subscription
Entitlement
Usage
AuditLog
```

### 계정

- 이메일 로그인
- 비밀번호 또는 passwordless
- 이메일 인증
- 비밀번호 재설정
- MFA 옵션
- session revoke

### Tenant

모든 B2B 데이터는 `organization_id`로 격리한다.

Worker B2C Case는 Employer tenant와 절대로 자동 연결하지 않는다.

### 권한

권장 Role:

- Owner
- HR Admin
- Manager
- Employee
- External Advisor
- Billing Admin

External Advisor는 명시적으로 공유된 Case/문서만 접근한다.

### Billing Foundation

필수 객체:

```text
Plan
Subscription
Entitlement
UsageMeter
InvoiceReference
PaymentStatus
Trial
Coupon
```

결제사에 business logic을 종속시키지 않는다.

---

## Phase 2 — Insaya Business MVP

### 2.1 사업장 온보딩

가입 즉시 회사의 `노무 DNA`를 수집한다.

- 상시근로자 수
- 업종
- 사업장/지점
- 근무형태
- 주 근로시간
- 급여 지급일
- 시급/월급/연봉제
- 포괄임금 여부
- 취업규칙 존재 여부
- 외부 노무사 존재 여부

결과:

`우리 회사 노무 리스크 초기 점수`

### 2.2 Employee Lite

처음부터 풀 HRIS를 만들지 않는다.

필수 데이터만 저장한다.

- 이름/식별용 employee number
- 입사일
- 퇴사일
- 계약형태
- 근로시간
- 임금형태
- 사업장
- 직무/직급

### 2.3 Contract Center

- 근로계약 생성
- 계약 version
- 갱신기한
- 필수항목 검사
- 수습기간 검사
- 기간제 2년 경계
- 단시간 근로자 조건
- 변경 history

### 2.4 Compliance Dashboard

회사 첫 화면은 HR Dashboard가 아니라 **Risk Dashboard**로 한다.

예:

```text
긴급 2
주의 5
이번 달 조치 7
법령 변경 영향 1
```

Risk 예시:

- 계약서 미교부 가능성
- 주 12시간 연장 한도 초과
- 연차 정산 필요
- 취업규칙 작성 대상 진입
- 해고예고 체크 필요
- 기간제 2년 임박

### 2.5 Compliance Calendar

자동 생성 이벤트:

- 계약 갱신
- 수습 종료
- 기간제 2년 경계
- 연차 발생/촉진
- 급여일
- 취업규칙 점검
- 법령 시행일
- 사건 대응 기한

### 2.6 Business Cases

근로자 Case를 그대로 보여주지 않는다.

사업주 관점의 Preventive Case를 만든다.

```text
해고하려고 한다
→ 해고 유형 확인
→ 적용법
→ 필요한 사유/증거
→ 서면통지
→ 예고/예고수당
→ 위험도
→ 문서
→ 전문가 검토 필요 여부
```

우선순위:

1. 해고 전 점검
2. 근로계약 검토
3. 임금/수당 누락 점검
4. 근로시간 초과 점검
5. 연차 정산

### 2.7 Document Workflow

- 계약서
- 경고장
- 개선요구서
- 인사발령
- 권고사직 확인서
- 해고통지서
- 연차사용촉진
- 임금 관련 확인서

상태:

```text
Draft → Review → Approved → Delivered → Archived
```

---

## Phase 3 — 첫 수익화

### Business 요금제 초안

가격은 초기 실험값이며 고객 인터뷰/전환율로 조정한다.

| Plan | 대상 | 월 가격 가설 | 핵심 기능 |
|---|---:|---:|---|
| Free | 체험/유입 | 0원 | 노무 리스크 진단, 일부 가이드/계산 |
| Starter | 1~10인 | 49,000원 | 회사진단, 직원 Lite, 계약/문서, Calendar, 기본 Case |
| Standard | 11~30인 | 99,000원 | 전체 Case, Risk Dashboard, 문서 workflow, 알림, 3 Admin |
| Pro | 31~100인 | 199,000원 | 다지점, 승인 workflow, 대량 import, Advisor, Audit, 고급 AI |
| Enterprise | 100인+ | 협의 | SSO, API, DPA, custom retention, migration, SLA |

연간결제는 10개월 가격 수준을 기본 실험안으로 한다.

### Trial

14일 또는 30일 무료체험.

카드 선등록을 강제하지 않고 activation을 먼저 본다.

### Activation Event

가입이 아니라 다음을 Activation으로 본다.

```text
회사정보 등록
+ 직원 1명 이상
+ 첫 Risk Check 완료
+ 첫 조치 또는 문서 생성
```

### North Star

**Monthly Resolved Compliance Actions per Active Company**

단순 로그인 횟수보다 실제 리스크 해결 횟수를 본다.

---

## Phase 4 — Recurring Compliance

SaaS retention을 만드는 단계다.

### Legal Change Monitor

Legal Registry가 업데이트되면 회사 profile과 비교한다.

```text
법 변경
→ 영향 사업장 탐색
→ 영향 직원/정책 탐색
→ 관리자 알림
→ 변경점 설명
→ 해야 할 조치 생성
```

### Monthly Compliance Close

매달 자동 실행:

- 근로시간 이상치
- 미사용 연차
- 계약 만료
- 수습 종료
- 임금/수당 위험
- 미완료 Action

`이번 달 노무 마감`을 제공한다.

이 기능이 월간 재방문 이유가 된다.

---

## Phase 5 — Insaya Pro (노무사 SaaS)

### 핵심 기능

#### Client CRM

- 개인/기업 고객
- 담당자
- 연락처
- 상담 history
- consent

#### Matter / Case

- intake
- 쟁점
- 기한
- 증거
- 문서
- task
- 진행상태
- 내부 memo

#### Secure Intake

노무사가 링크를 보내면 고객이 직접 입력한다.

```text
링크
→ 질문지
→ 자료 업로드
→ Case 구조화
→ 노무사 Workspace
```

#### Document Workspace

- 반복 양식
- merge variables
- version
- review
- client share

#### Client Portal

고객은 자기 사건만 본다.

- 요청 자료
- 진행 상태
- 문서
- 질문

### Pro 가격 가설

| Plan | 월 가격 가설 | 대상 |
|---|---:|---|
| Solo | 59,000원 | 1인 사무소 |
| Team | 149,000원 | 최대 5명 |
| Office | 299,000원 | 소규모 노무법인 |
| Enterprise Pro | 협의 | 대형 법인/다지점 |

**과금 기준은 사건 소개 건수가 아니라 소프트웨어 사용권이다.**

---

## Phase 6 — Business ↔ Pro Collaboration

사업주가 기존 자문 노무사를 Workspace에 초대할 수 있게 한다.

```text
Company
→ External Advisor 초대
→ 특정 Case/문서 공유
→ 검토 의견
→ 승인/수정
→ Audit trail
```

장점:

- 회사는 일상업무를 SaaS로 처리
- 어려운 사건만 노무사가 검토
- 노무사는 고객사 데이터를 매번 다시 받지 않음

이 구조가 인사야의 가장 강한 B2B2P 네트워크 효과가 된다.

---

## Phase 7 — Integration Platform

직접 모든 HR 기능을 만들지 않고 연결한다.

### Import 1단계

- CSV 직원 import
- CSV 근태 import
- CSV 급여 import

### API 2단계

- HRIS
- 근태
- 급여
- 전자서명
- Slack/Teams
- 이메일/SMS

### Event Model

```text
employee.created
contract.expiring
worktime.threshold_exceeded
leave.unused
legal_rule.changed
case.deadline_approaching
document.approved
```

Automation engine으로 확장한다.

---

## Phase 8 — Automation Builder

기업이 직접 규칙을 만든다.

```text
Trigger
→ Condition
→ Action
```

예:

```text
기간제 근로자가 22개월 도달
→ HR Admin에게 알림
→ 계약검토 Case 생성
→ 자문 노무사 검토 Task 생성
```

또는

```text
주 연장근로 10시간 초과
→ Manager + HR 경고
→ 다음 주 스케줄 조정 Task
```

---

# 6. AI 제품 원칙

## 결정권은 AI에 주지 않는다

AI는:

- 설명
- 요약
- 질문 생성
- 문서 초안 표현
- 검색 보조

에 사용한다.

법정 금액/기한/적용범위는 deterministic engine이 결정한다.

## AI 결과 표시

- AI 사용 사실 표시
- 근거 source 표시
- 계산 engine 결과와 AI 문장 분리
- confidence / missing facts 표시
- 관리자 검토 가능

## 고영향 영역

향후 채용, 직원 평가, 해고 추천처럼 개인의 권리에 중대한 영향을 주는 자동화는 별도 제품군으로 취급한다.

원칙:

- Human-in-the-loop
- 자동 최종결정 금지
- 설명 가능성
- audit log
- override
- 영향평가 문서화

---

# 7. 개인정보/보안 SaaS Baseline

SaaS 전환 전에 필수로 갖춘다.

### Tenant isolation

모든 query의 organization boundary를 구조적으로 강제한다.

### Sensitive Data Separation

Worker 개인 Case와 Employer 조직 데이터는 별도 security domain으로 관리한다.

Worker가 회사를 상대로 만든 사건이 해당 회사 계정에 나타나는 구조는 절대 만들지 않는다.

### Access

- RBAC
- MFA
- External Advisor scoped access
- session revoke
- least privilege

### Audit

기록:

- 로그인
- 자료 열람
- export
- 수정
- 삭제
- 관리자 설정
- 권한변경
- 전문가 공유

### Storage

- durable DB
- object storage
- encryption
- backup
- restore
- retention policy

---

# 8. 수익모델

## 8.1 Core Revenue

1. Insaya Business 월/연 구독
2. Insaya Pro 월/연 구독
3. Enterprise 계약

## 8.2 Add-ons

향후 실험:

- AI 추가 사용량
- SSO
- API
- 추가 지점
- 장기 Audit retention
- 대량 문서/e-sign
- 데이터 migration
- premium support

## 8.3 Professional Services

직접 노무 자문을 판매하는 구조가 아니라 SaaS 도입 서비스로 제한한다.

예:

- 직원 데이터 migration
- 템플릿 설정
- 회사 정책 입력 지원
- 관리자 교육
- 시스템 연동

### 피해야 할 매출

- 노무사 사건 성사당 수수료
- 수임료 percentage share
- 특정 사건을 특정 노무사에게 보내고 받는 referral fee
- AI의 개별 노무대리/법률자문을 표방한 직접 과금

---

# 9. GTM — 시장 진입

## ICP 1

5~30인 기업.

문제:

- HR 담당자 없음
- 대표/총무가 인사까지 처리
- 근로계약/연차/수당 실수 반복
- 노무사에게 매번 전화하기 부담

Hook:

**무료 3분 노무 리스크 진단**

## ICP 2

30~100인 기업.

문제:

- HR 담당자는 있으나 노무 전문성 부족
- 문서와 승인 흐름이 흩어짐
- 지점/관리자마다 처리방식 다름

Hook:

**월간 노무 Compliance Close**

## ICP 3

노무사.

문제:

- 카톡/이메일/엑셀로 자료 취합
- 같은 질문 반복
- 사건별 자료 누락
- 고객사 진행상태 공유가 어려움

Hook:

**상담 전에 Case가 정리되어 들어오는 Workspace**

---

# 10. Acquisition Funnel

```text
SEO 가이드 / 계산기
→ 무료 Risk Check / Case
→ 가치 경험
→ Business Trial
→ Company setup
→ 첫 Action 해결
→ Subscription
```

사업주 콘텐츠는 검색량 자체보다 conversion intent를 본다.

추천 콘텐츠:

- 5인 이상 되면 달라지는 것
- 직원 해고 전 체크리스트
- 연차사용촉진 실무
- 포괄임금 점검
- 기간제 2년 전 체크
- 취업규칙 10인 기준
- 퇴직금/연장수당 사업주 계산

---

# 11. KPI

아래는 초기 목표 가설이며 실제 데이터로 조정한다.

### Acquisition

- 방문 → 무료 Risk Check: 8%+
- Risk Check → Trial: 10~15%+

### Activation

- Trial → Company setup 완료: 60%+
- Trial → first resolved action: 50%+

### Revenue

- Activated → Paid: 20~30%
- Business ARPA: 8~15만원 목표
- monthly logo churn: 3% 미만 목표
- CAC payback: 6개월 이내 목표

### Product

North Star:

`Resolved Compliance Actions / Active Company / Month`

---

# 12. 매출 시나리오 — 사업계획용 가설

실제 forecast가 아니라 제품 가격/시장 규모 감각을 확인하기 위한 bottom-up 가설이다.

### 초기

```text
Business 100곳 × 평균 90,000원 = MRR 9,000,000원
Pro 20곳 × 평균 100,000원 = MRR 2,000,000원

합계 MRR ≈ 11,000,000원
ARR ≈ 132,000,000원
```

### 성장

```text
Business 500곳 × 평균 110,000원 = 55,000,000원
Pro 100곳 × 평균 130,000원 = 13,000,000원
Enterprise 10곳 × 평균 500,000원 = 5,000,000원

합계 MRR ≈ 73,000,000원
ARR ≈ 876,000,000원
```

### Scale

```text
Business 2,000곳 × 평균 120,000원 = 240,000,000원
Pro 300곳 × 평균 150,000원 = 45,000,000원
Enterprise 50곳 × 평균 800,000원 = 40,000,000원

합계 MRR ≈ 325,000,000원
ARR ≈ 3,900,000,000원
```

매출 목표보다 먼저 activation/retention을 검증한다.

---

# 13. 개발 우선순위 — 절대 순서

```text
1. 1.0 GA durable storage
2. 계정/Auth
3. Organization multi-tenancy
4. RBAC + Audit
5. Billing/Entitlements
6. Business onboarding
7. Employee Lite
8. Risk Dashboard
9. Compliance Calendar
10. Business Cases
11. Document Workflow
12. Subscription launch
13. Legal Change Monitor
14. Monthly Compliance Close
15. External Advisor role
16. Insaya Pro
17. Business ↔ Pro collaboration
18. HRIS/근태/급여 integration
19. Automation Builder
20. Enterprise features
```

이 순서를 깨고 Full HRIS, 채용, 급여, 평가 기능부터 만들지 않는다.

---

# 14. 최종 제품 구조

```text
INSAYA
│
├── Worker
│   ├ Case
│   ├ Calculator
│   ├ Guide
│   ├ Evidence
│   ├ Document
│   └ Expert handoff
│
├── Business
│   ├ Organization
│   ├ Employee Lite
│   ├ Contract
│   ├ Risk Dashboard
│   ├ Compliance Calendar
│   ├ Business Case
│   ├ Document Workflow
│   ├ Legal Change Monitor
│   └ External Advisor
│
├── Pro
│   ├ Client CRM
│   ├ Matter/Case
│   ├ Secure Intake
│   ├ Deadline/Task
│   ├ Document
│   └ Client Portal
│
└── Shared Platform
    ├ Legal Registry
    ├ Rule Engine
    ├ Case Engine
    ├ Document Engine
    ├ AI Explanation
    ├ Audit
    ├ Identity/RBAC
    ├ Billing
    ├ Notification
    └ Integration/Automation
```

---

# 15. 최종 판단

인사야는 **B2C 노동상담 사이트에서 바로 종합 HR SaaS로 뛰어가는 것이 아니라** 다음 순서로 성장한다.

```text
Worker Case Platform
↓
Labor Compliance Engine
↓
Employer Compliance SaaS
↓
Professional Workspace SaaS
↓
Business ↔ Professional Collaboration Network
↓
Korean Labor Compliance OS
```

가장 중요한 사업 원칙은 다음 세 가지다.

1. **무료 B2C는 유입/신뢰 엔진으로 유지한다.**
2. **돈은 Business/Pro SaaS 구독에서 번다.**
3. **노무사 사건 소개 수수료가 아니라 Software Value를 판매한다.**

이 구조가 규제 리스크를 낮추면서 반복매출과 데이터 해자를 동시에 만드는 인사야의 최종 방향이다.
