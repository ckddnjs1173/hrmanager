# 인사야 1.0 Case 모델

> 상태: 제품/개발 기준 문서
> 기준일: 2026-08-14
> 상위 문서: `PRODUCT_PLAN_1.0.md`, `UX_FLOW_1.0.md`

## 1. Case 정의

Case는 채팅방이 아니라 **사용자가 해결하려는 하나의 노동문제와 그 진행 상태**다.

```text
Case
├ 사건 식별/상태
├ 사용자 유형
├ 사건 유형
├ 사건 제목/요약
├ 확인된 사실
├ 미확인 사실
├ 핵심 쟁점
├ 현재 판단
├ 계산 결과
├ 증거 체크리스트
├ 중요 기한
├ 행동 계획
├ 생성 문서
├ 법률 근거
├ 상담 대화
└ 변경 이력
```

## 2. 핵심 원칙

1. AI 답변 문장과 제품 데이터를 분리한다.
2. 법정 금액·날짜·명확한 규칙은 결정론적 엔진이 계산한다.
3. 사용자의 원문과 구조화된 사실을 구분한다.
4. 모르는 값을 임의 기본값으로 채우지 않는다.
5. 사건 상태와 변경 이력을 추적할 수 있어야 한다.
6. 계산기·문서·전문가 연결은 Case ID를 중심으로 이어진다.

## 3. Case Lifecycle

```text
draft
→ collecting_facts
→ ready_for_analysis
→ active
→ waiting_user / action_ready
→ completed
→ archived
```

| 상태 | 의미 |
|---|---|
| draft | 사건 생성 직후 |
| collecting_facts | 필수 사실 확인 중 |
| ready_for_analysis | 최소 분석 요건 충족 |
| active | 분석 결과가 있고 해결 진행 중 |
| waiting_user | 사용자 자료/행동 대기 |
| action_ready | 문서·공식절차 등 다음 행동 준비 완료 |
| completed | 인사야 내 해결 준비 흐름 완료 |
| archived | 사용자가 보관 종료 |

`completed`는 법적 분쟁 자체가 종결됐다는 의미가 아니다.

## 4. 초기 Case Type

```text
wage_arrears
termination
severance
work_hours_pay
annual_leave
weekly_holiday_pay
employment_contract
workplace_harassment
industrial_accident
unemployment_benefit
other
```

내부 key는 고정 영문값으로 관리하고 사용자에게는 자연스러운 한국어명을 표시한다.

## 5. Case Core

```json
{
  "id": "case_xxx",
  "status": "active",
  "userType": "worker",
  "caseType": "wage_arrears",
  "title": "임금체불 사건",
  "summary": "퇴사 후 급여가 일부 미지급된 상황",
  "progress": 60,
  "revision": 4
}
```

`progress`는 AI가 임의로 말하는 숫자가 아니라 사건 Template의 필수 단계 완료율로 계산한다.

## 6. Fact

판단에 필요한 사실을 구조화한다.

```json
{
  "key": "employment_status",
  "label": "현재 재직 여부",
  "value": "terminated",
  "status": "confirmed",
  "source": "user",
  "rawText": "지난달에 퇴사했어요"
}
```

Fact 상태:

```text
unknown
inferred
confirmed
conflicted
not_applicable
```

Fact 출처:

```text
user
ai_extracted
calculator
document
operator
system
```

공통 Fact 예시:

```text
employment_status
employment_start_date
employment_end_date
business_headcount
employment_type
wage_type
monthly_wage
hourly_wage
regular_payday
contract_exists
paystub_exists
work_record_exists
```

## 7. Case Template / Required Facts

각 사건 유형은 필요한 사실을 미리 정의한다.

예: 임금체불

```text
필수
- 재직/퇴직 상태
- 미지급 임금 종류
- 미지급 기간
- 약정 임금

조건부
- 퇴사일
- 정기 지급일
- 마지막 정상 지급일
```

흐름:

```text
현재 Case facts
+
Case Template
=
다음에 물어볼 최소 질문
```

AI가 매번 필요한 질문 목록을 새로 발명하지 않게 한다.

## 8. Issue / Assessment

```json
{
  "key": "unpaid_regular_wage",
  "label": "임금 미지급",
  "status": "possible",
  "reason": "미지급 정황은 확인됐으나 지급일 추가 확인 필요"
}
```

상태:

```text
confirmed_rule
possible
needs_more_facts
not_applicable
```

`confirmed_rule`은 규칙 적용 조건이 명확하다는 뜻이며 사건 승패나 위법 확정을 의미하지 않는다.

## 9. Calculation

계산 결과에는 반드시 다음이 포함된다.

```text
calculatorKey
input
result
ruleVersion
calculatedAt
```

예:

```json
{
  "calculatorKey": "wage_arrears",
  "input": {},
  "result": {},
  "ruleVersion": "2026.1"
}
```

같은 사건을 나중에 다시 열었을 때 당시 어떤 기준으로 계산했는지 알 수 있어야 한다.

## 10. Evidence

```json
{
  "key": "bank_transactions",
  "label": "급여 입금 통장내역",
  "status": "available",
  "required": true
}
```

상태:

```text
unknown
available
missing
requested
not_applicable
```

1.0에서는 실제 파일 업로드보다 **증거 보유 여부와 준비상태 관리**를 먼저 제품화한다.

## 11. Deadline

```json
{
  "key": "deadline_xxx",
  "label": "중요 기한",
  "date": "YYYY-MM-DD",
  "status": "confirmed",
  "ruleVersion": "2026.1"
}
```

상태:

```text
confirmed
estimated
unknown
```

근거가 불충분하면 임의 날짜를 만들지 않는다.

## 12. Action Plan

```json
{
  "key": "confirm_unpaid_amount",
  "label": "미지급 금액 확정",
  "status": "todo",
  "priority": 1,
  "type": "calculation",
  "target": "wage_arrears"
}
```

Action type:

```text
question
calculation
evidence
document
official_process
expert
manual
```

Action status:

```text
todo
in_progress
blocked
done
skipped
```

Workspace의 `다음 행동`은 실행 가능한 Action 중 가장 높은 우선순위 하나를 보여준다.

## 13. Document

```json
{
  "docKey": "demand_letter",
  "status": "draft",
  "version": 1,
  "sourceCaseRevision": 4
}
```

Case의 주요 사실이 바뀌어 기존 문서 내용과 맞지 않게 되면 `outdated` 상태를 표시할 수 있어야 한다.

## 14. Legal Source

Case 판단과 계산은 법률 근거 데이터에 연결된다.

최소 관리 항목:

```text
ruleId
주제
법령/공식 근거
적용 시작일
적용 종료일
적용 조건
예외 조건
법정 수치
공식 출처
마지막 검증일
version
```

프롬프트 안의 수치를 최종 단일 소스로 사용하지 않는다.

## 15. Message

채팅은 Case의 일부다.

```json
{
  "caseId": "case_xxx",
  "role": "user",
  "content": "퇴사했는데 월급이 안 들어왔어요"
}
```

향후 특정 메시지에서 어떤 Fact가 추출됐는지 연결할 수 있어야 한다.

## 16. Case Event

중요 변경은 이벤트로 남긴다.

```text
case_created
fact_added
fact_changed
analysis_generated
calculation_completed
evidence_changed
action_completed
document_created
expert_handoff_started
case_completed
```

제품 분석용 이벤트에는 상담 원문 자체를 넣지 않는다.

## 17. 기존 코드와 연결

현재 `SUMMARY_SCHEMA`의 항목은 새 Case로 흡수 가능하다.

```text
userType        → Case userType
caseType        → Case caseType
facts           → Facts
issues          → Issues
checklist       → Missing Facts / Actions
documents       → Evidence / Documents
estimatedAmount → Calculation summary
riskLevel       → Expert handoff 판단 보조
```

기존 Summary 기능은 당장 삭제하지 않고 Case Report의 초기 adapter로 사용한다.

현재 `bookings`는 Case와 다른 객체로 유지한다.

```text
Case = 사용자의 노동문제
Booking = 전문가 상담 요청
```

향후 Booking이 어떤 Case에서 발생했는지만 연결한다.

## 18. 논리 저장 구조

초기 구현은 현재 SQLite + repository abstraction 패턴을 유지한다.

```text
cases
case_facts
case_messages
case_calculations
case_evidence
case_actions
case_documents
case_events
```

원칙:

- Case 핵심 상태는 명시적 필드
- 반복되는 도메인 데이터는 별도 컬렉션/테이블
- 가변 세부 payload만 JSON 형태 허용

하나의 거대한 `state_json`에 전부 저장하는 구조는 사용하지 않는다.

## 19. 첫 구현 범위

### Phase A

```text
Case Core
Facts
Messages
Actions
Events
Case create/get/update
Case Report JSON
임금체불 Template 1종
```

### Phase B

```text
Calculations
Evidence
Documents
Booking 연결
```

기존 기능을 한꺼번에 재작성하지 않고 위 순서로 Case에 연결한다.

## 20. Case 기반 MVP 완료 기준

다음 시나리오가 끊기지 않아야 한다.

```text
사용자: “퇴사했는데 월급을 못 받았다”
→ Case 생성
→ 필요한 사실 질문
→ 답변이 Fact로 저장
→ Case Report 생성
→ 미확인 사실 표시
→ 다음 행동 표시
→ 다시 열어도 같은 Case 진행상태 유지
→ 이후 계산·증거·문서를 같은 Case에 연결 가능
```

이 흐름이 안정화되기 전에는 계산기·문서·가이드 개수를 더 늘리지 않는다.
