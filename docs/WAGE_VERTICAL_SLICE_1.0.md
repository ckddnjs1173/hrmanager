# 인사야 1.0 — 임금체불 Vertical Slice

> 상태: 첫 구현 기준
> 기준일: 2026-08-14
> 목적: 인사야 1.0의 새로운 Case 구조를 임금체불 사건 하나로 처음부터 끝까지 검증한다.

## 1. 왜 임금체불부터 하는가

임금체불은 현재 인사야에 이미 다음 자산이 존재한다.

- AI 상담
- 임금 관련 가이드
- 여러 계산기
- 체불 지연이자 등 관련 계산
- 내용증명/진정 관련 문서
- 상황별 해결 흐름
- 노무사 연결

따라서 새 제품 구조를 검증하기에 가장 좋은 Vertical Slice다.

목표는 신규 기능을 많이 만드는 것이 아니라 기존 자산을 하나의 Case로 묶는 것이다.

---

## 2. 사용자 시나리오

대표 입력:

```text
퇴사했는데 7월 월급을 아직 못 받았어요.
```

인사야는 바로 장문의 답변을 하지 않는다.

```text
임금 미지급 문제로 정리할게요.
정확히 확인하려면 먼저 세 가지만 알려주세요.

1. 퇴사일
2. 원래 급여 지급일
3. 받지 못한 급여가 기본급만인지, 수당도 포함인지
```

필요한 사실이 모이면 Case Workspace를 만든다.

---

## 3. 완료 경험

```text
임금체불 · 진행 중

현재 확인된 체불액
3,000,000원 + 추가 수당 확인 필요

확인된 사실
✓ 퇴사일 2026-08-01
✓ 급여 지급일 매월 10일
✓ 7월 기본급 미지급

추가 확인
? 연장근로수당 포함 여부
? 미사용 연차수당 여부

증거
3 / 5 확인

다음으로 할 일
연장근로가 있었다면 추가 체불액을 확인하세요.
[근로시간 확인하기]
```

이 화면까지 도달하는 것이 1차 제품 성공 기준이다.

---

## 4. Case Type

```text
caseType = wage_arrears
```

관련 Issue는 별도 타입으로 붙인다.

예:

```text
wage.base_pay
wage.overtime
wage.night
wage.holiday
wage.annual_leave_pay
wage.delay_interest
severance.payment
```

Case 자체를 여러 개로 쪼개지 않는다.

---

## 5. Intake 최소 사실

### Core

- employmentStatus
- employmentStartDate
- employmentEndDate (퇴직 시)
- payDay
- unpaidPeriodStart
- unpaidPeriodEnd
- monthlyBasePay 또는 wageStructure
- unpaidItems

### Evidence status

- employmentContract
- payslip
- bankHistory
- attendanceRecord
- messagesWithEmployer

### Conditional

연장/야간/휴일 근로 언급 시:

- actualWorkHours
- breakTime
- workDays

연차수당 언급 시:

- annualLeaveGenerated
- annualLeaveUsed

퇴직금 언급 시:

- severancePaid
- pensionType

모든 항목을 첫 Intake에서 묻지 않는다.
Case issue가 활성화될 때 필요한 질문을 추가한다.

---

## 6. Intake 질문 순서

### Step 1 — 사건 구분

- 현재 재직 중인가요, 퇴사했나요?
- 어떤 돈을 받지 못했나요?

### Step 2 — 날짜

- 원래 지급일은 언제였나요?
- 어느 기간의 임금이 미지급됐나요?
- 퇴사했다면 퇴사일은 언제인가요?

### Step 3 — 금액

- 월 기본급 또는 시급
- 이미 지급된 일부 금액 여부

### Step 4 — 추가 수당 가능성

- 연장/야간/휴일근로 여부
- 미사용 연차 여부

### Step 5 — 증거

- 급여명세서
- 계좌내역
- 근로계약서
- 출퇴근기록

질문은 한 번에 최대 3개를 기본으로 한다.

---

## 7. Case Report 구성

### Summary

사용자가 이해하는 한 문장.

### Facts

확인된 사실과 미확인을 분리.

### Issues

현재 활성화된 임금 쟁점.

### Money

```text
확인된 미지급액
+ 계산 가능한 추가 수당
+ 아직 확인이 필요한 금액
```

### Evidence

보유/미보유/확보 예정.

### Dates

지급 예정일, 퇴직일, 사건 관련 주요 기준일.

### Actions

현재 단계의 Next Best Action.

### Documents

상황에 따라 추천.

### Sources

적용 기준일과 공식 근거.

---

## 8. Money Engine 연결

1차에서는 기존 계산기를 최대한 재사용한다.

연결 후보:

- 기본 미지급 임금
- 연장/야간/휴일
- 연차수당
- 체불 지연 관련 계산
- 퇴직금(관련 쟁점일 때)

### 원칙

Calculator UI를 Case 안에 그대로 iframe처럼 넣지 않는다.

Case가 입력값을 가지고 Calculator Function을 호출하고 결과만 Case Money에 저장하는 구조가 목표다.

1차 리팩터링에서는 기존 함수 재사용을 허용하고, 이후 계산 로직을 UI에서 분리한다.

---

## 9. Evidence 기본 체크리스트

```text
급여명세서
계좌 입금내역
근로계약서
출퇴근기록
회사와 주고받은 지급 관련 메시지
```

사건에 따라 중요도를 나눈다.

```text
core
supporting
conditional
```

파일 업로드 자동분석은 첫 Slice 범위가 아니다.

---

## 10. Action Planner

Action은 고정 목록이 아니라 Case 상태에 따라 활성화한다.

예:

```text
금액 불완전
→ 금액 확인

증거 부족
→ 증거 체크

금액/증거 정리 완료
→ 지급 요청 문서 준비

필요 시
→ 공식 절차 확인
→ 전문가 상담
```

### Next Best Action 우선순위

1. 권리/기한에 영향을 주는 긴급 행동
2. 판단을 바꾸는 핵심 사실
3. 금액 확정
4. 핵심 증거
5. 문서
6. 공식 절차
7. 전문가 연결

---

## 11. Document 연결

기존 문서센터를 재사용한다.

우선 연결 대상:

- 지급 요청/내용증명 계열
- 노동청 진정 관련 서식

Case Facts를 가능한 범위에서 자동 프리필한다.

사용자가 문서를 열면:

```text
이 사건에서 가져온 정보
- 미지급 기간
- 확인된 금액
- 퇴사일
- 사건 요약
```

을 명확히 보여준다.

---

## 12. API 목표

기존 API를 즉시 삭제하지 않는다.

신규 Case API는 별도 추가한다.

1차 목표 인터페이스:

```text
POST /api/cases
GET  /api/cases/:id
PATCH /api/cases/:id
POST /api/cases/:id/messages
POST /api/cases/:id/analyze
POST /api/cases/:id/calculate
```

실제 인증/저장 정책은 Case persistence 설계와 함께 확정한다.

### 기존 API 유지

```text
POST /api/chat
POST /api/summary
GET/POST docs APIs
GET /api/nomu
POST /api/booking
```

새 Case 흐름 안정화 후 레거시 호출을 단계적으로 줄인다.

---

## 13. DB 목표

기존 `bookings`, `leads` 등에 Case를 억지로 넣지 않는다.

신규 도메인 테이블을 추가한다.

초기 후보:

```text
cases
case_facts
case_issues
case_calculations
case_evidence
case_actions
case_documents
case_messages
case_events
```

1차 구현은 과도한 정규화를 피하기 위해 일부 JSON 컬럼/필드를 사용할 수 있다.

중요한 것은 Booking과 Case를 분리하는 것이다.

Booking은 전문가 상담 요청이고 Case는 사용자의 노동문제다.

---

## 14. AI 역할

AI:

- 자유 문장에서 사건 후보 분류
- 사실 추출
- 누락 사실 질문 생성
- 구조화된 결과 설명

AI가 하지 않는 것:

- 핵심 계산 산식 자체 결정
- 법령 시행 버전 임의 선택
- 확인되지 않은 사실 생성
- Case 상태를 근거 없이 완료 처리

---

## 15. 기존 SUMMARY_SCHEMA 재사용

현재 상담 요약의 개념 중 다음은 Case로 승격할 수 있다.

```text
caseType
facts
issues
checklist
documents
riskLevel
estimatedAmount
```

다만 Case에서는 각 값이 단순 문자열 배열이 아니라 상태와 출처를 가진 구조화 객체가 된다.

기존 `/api/summary`는 향후 `Case Export` 기능으로 역할을 변경한다.

---

## 16. 테스트 선행 조건

현재 테스트 스크립트가 없으므로 첫 코드 변경 전에 최소 안전망을 만든다.

### package scripts 목표

```text
npm test
npm run check
npm run build
```

### 1차 테스트

- 서버 import/boot
- `/api/health`
- 문서 목록
- 기본 DB repository 동작
- Case 생성/조회
- 임금체불 Case facts 저장
- Case action 상태 변경

### 계산 회귀

기존 임금 관련 계산 중 Slice가 사용하는 항목부터 fixture 테스트를 붙인다.

---

## 17. 구현 단계

### W0 — Safety Net

- Node test runner 도입
- package scripts
- CI workflow
- 기본 smoke tests

### W1 — Case Domain

- Case schema
- Case repository
- Case service
- 기본 CRUD API

### W2 — Wage Intake

- wage_arrears template
- required facts
- Intake UI shell
- structured fact 저장

### W3 — Wage Workspace

- Overview
- Facts
- Money
- Evidence
- Actions

### W4 — Existing Tools Integration

- 계산 연결
- 문서 프리필
- 공식 절차 연결
- 전문가 연결

### W5 — Hardening

- error states
- mobile
- accessibility
- legal source display
- regression tests

---

## 18. 기존 index.html 분리 순서

임금체불 Slice를 이유로 전체 SPA를 먼저 분해하지 않는다.

순서:

1. Case UI에 필요한 최소 CSS/JS 모듈 추가
2. 기존 화면과 병행
3. Case 컴포넌트가 안정되면 공통 토큰/컴포넌트 추출
4. 계산/콘텐츠 원본 분리
5. 레거시 화면 제거

Big Bang rewrite 금지.

---

## 19. 첫 Release Acceptance Criteria

임금체불 Slice는 다음을 모두 만족해야 완료다.

- 사용자가 Home에서 한 문장으로 시작 가능
- wage_arrears Case 생성
- 핵심 사실이 구조화되어 저장
- 미확인 사실이 별도로 표시
- Case Workspace 진입 가능
- 최소 1개 Money 결과 연결
- Evidence 상태 관리 가능
- Next Best Action 1개 표시
- 관련 문서 1개 이상 Case 데이터 프리필
- 적용 기준일 표시
- 모바일 사용 가능
- AI 실패 시 Case 데이터 유지
- 테스트/빌드 통과

---

## 20. 이 Slice에서 하지 않는 것

- 모든 노동사건 지원
- 회원가입/결제 완성
- 파일 OCR/증거 자동판독
- 노무사 Portal 완성
- 전체 프론트 framework migration
- 계산기 27종 전부 리팩터링
- 문서 24종 전부 리팩터링

첫 목표는 하나다.

**임금체불 사건 하나가 제품 안에서 처음부터 끝까지 끊기지 않게 만든다.**
