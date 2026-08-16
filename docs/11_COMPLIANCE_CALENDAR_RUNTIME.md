# 인사야 Business — Compliance Calendar Runtime

> 상태: Bundle 12 구현 계약
> 기준일: 2026-08-16
> 관련 코드: `lib/compliance-calendar-contract.js`, `lib/saas-calendar-repo.js`
> 관련 원본 데이터: `compliance_actions.due_at`

---

## 1. 목적

Compliance Calendar는 별도 일정 관리 제품이 아니다.

목적은 Business Risk/Action 흐름에서 이미 발생한 **해야 할 일과 기한**을 운영자가 놓치지 않도록 한 화면에 투영하는 것이다.

핵심 원칙:

```text
Risk Finding
  ↓
Compliance Action
  ↓
due_at
  ↓
Compliance Calendar projection
```

Calendar 전용 원본 테이블을 만들지 않는다.

`compliance_actions.due_at`이 단일 원천이다.

---

## 2. 왜 Calendar 테이블을 별도로 만들지 않는가

동일한 기한을 Action과 Calendar에 이중 저장하면 다음 문제가 생긴다.

- Action 기한 변경 후 Calendar 미동기화
- Action 완료 후 Calendar 잔존
- 삭제/복구/재오픈 시 상태 불일치
- 법률 Rule 재평가 후 두 데이터 원천이 충돌

따라서 초기 Runtime은 Calendar를 **read projection**으로 구현한다.

Action이 `OPEN`, `IN_PROGRESS`, `BLOCKED`이고 `due_at`이 있을 때 Calendar에 노출한다.

`DONE`, `DISMISSED`는 운영 Calendar에서 자동 제외한다.

---

## 3. 기한 Source 구분

### 3.1 사용자 설정 기한

Business 사용자가 직접 입력하는 날짜는 다음으로 저장한다.

```text
dueDateSource = MANUAL_INTERNAL
```

UI 명칭:

**내부 관리 기한**

절대 다음 표현으로 바꾸지 않는다.

- 법정기한
- 법적 마감일
- 반드시 이 날까지 해야 하는 법률상 의무일

사용자가 입력한 날짜는 회사 내부 운영 목표일일 뿐이다.

### 3.2 법률 Rule 산출 기한

향후 검증된 Rule Engine이 법적 기한을 산출하는 경우에만 별도 source를 사용한다.

그 경우 최소 다음 정보가 재현 가능해야 한다.

```text
rule_id
rule_version
effective_date
reference_date
source_id
calculation/result metadata
```

AI는 법정기한을 임의 생성하지 않는다.

---

## 4. 시간대와 날짜 경계

Business Calendar 기준 시간대는 고정한다.

```text
Asia/Seoul
UTC+09:00
```

사용자 입력 `YYYY-MM-DD`는 해당 날짜의 한국시간 종료 시각으로 저장한다.

예:

```text
2026-08-20
→ 2026-08-20 23:59:59.999 KST
→ 2026-08-20T14:59:59.999Z
```

이렇게 하면 DB는 `TIMESTAMPTZ`를 유지하면서 UI의 날짜 의미가 바뀌지 않는다.

---

## 5. Timing Status

활성 Action의 `due_at`과 현재 KST 날짜를 비교한다.

```text
OVERDUE
DUE_TODAY
NEXT_7_DAYS
SCHEDULED
```

규칙:

- due date < today → `OVERDUE`
- due date = today → `DUE_TODAY`
- today < due date <= today + 7일 → `NEXT_7_DAYS`
- 그 이후 → `SCHEDULED`

상태가 `DONE`이면 `COMPLETED`, `DISMISSED`이면 `DISMISSED`로 판단하며 운영 Calendar projection에서는 제외한다.

기한이 없으면 `UNSCHEDULED`이며 Calendar에 노출하지 않는다.

---

## 6. API

### 내부 관리 기한 설정/해제

```http
PATCH /api/saas/organizations/:organizationId/actions/:actionId/due-date
```

설정:

```json
{
  "dueDate": "2026-08-20"
}
```

해제:

```json
{
  "dueDate": null
}
```

보안:

- SaaS feature gate
- authenticated session
- CSRF
- `compliance.manage`
- organization scope

### Calendar 조회

```http
GET /api/saas/organizations/:organizationId/compliance-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
```

기본 범위:

- KST 오늘
- 오늘 + 30일

최대 조회 범위:

- 366일

응답은 다음을 포함한다.

```text
range
summary
overdue
events
```

`overdue`는 선택한 미래 범위 밖에 있더라도 운영상 놓치면 안 되므로 별도 반환한다.

---

## 7. Event / Audit

기한 설정과 해제는 둘 다 업무 상태 변경이다.

`compliance_action_events`:

```text
type = DUE_DATE_CHANGED
metadata.fromDueAt
metadata.toDueAt
metadata.source = MANUAL_INTERNAL
```

Audit:

```text
action = compliance.action.due_date
resource_type = compliance_action
resource_id = action id
```

기존 Event/Audit row를 수정하지 않는다.

---

## 8. Business UI

Dashboard:

- 기존 Risk/Action metric
- `기한 지연` metric 추가

Action:

- 활성 Action에 내부 관리 기한 입력
- 저장
- 해제
- UI에서 법정기한이 아니라는 문구를 명시

Calendar:

- 지연
- 오늘
- 7일 이내
- 향후 예정
- 날짜
- Action 제목
- Priority
- Action 상태
- 기한 source

완료/제외된 Action은 reload 후 Calendar에서 사라진다.

---

## 9. 하지 않는 것

Bundle 12에서는 다음을 구현하지 않는다.

- 독립 Calendar 이벤트 생성
- 개인 일정/회의 일정
- Google Calendar 양방향 동기화
- 이메일/SMS 리마인더
- 법정기한을 AI가 추정하여 자동 입력
- Calendar 전용 별도 DB 원본
- Monthly Compliance Close

---

## 10. 검증 기준

필수 테스트:

1. KST 날짜 경계 unit test
2. invalid date rejection
3. 최대 조회 범위 제한
4. due date set/clear PostgreSQL E2E
5. cross-tenant direct access 차단
6. `DUE_DATE_CHANGED` Event 확인
7. `compliance.action.due_date` Audit 확인
8. Business Chromium에서 Action → 기한 지정 → Calendar 반영
9. Action DONE 후 Calendar에서 제거
10. 기존 Worker Chromium 회귀 없음

---

## 11. 다음 단계

Calendar 다음 Runtime 우선순위:

1. due 7일/3일/1일/당일/overdue notification 후보 생성
2. notification outbox 및 중복 방지
3. in-app notification
4. 외부 email provider는 별도 운영 승인 후 연결
5. Monthly Compliance Close에서 미완료/지연 Action snapshot 활용
