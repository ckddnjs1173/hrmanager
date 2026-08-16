# 인사야 Business — Compliance Deadline Notification Runtime

> 상태: Bundle 13 구현 계약
> 기준일: 2026-08-16
> 선행 계약: `docs/11_COMPLIANCE_CALENDAR_RUNTIME.md`
> 관련 코드: `lib/compliance-notification-contract.js`, `lib/saas-notification-repo.js`, `lib/notification-scheduler.js`

---

## 1. 목적

Compliance Notification은 별도 일정 시스템이 아니다.

`Compliance Action.due_at`을 기준으로 운영자가 놓치기 쉬운 시점에 **중복 없는 알림 후보**를 만들고, 현재 단계에서는 인앱 알림으로 전달한다.

```text
Compliance Action
  ↓ due_at
Calendar deadline contract
  ↓
Deadline milestone
  ↓
Notification Outbox
  ↓
In-app Notification
```

외부 이메일/SMS 공급자는 Bundle 13 범위에 포함하지 않는다.

---

## 2. 알림 시점

KST 날짜 기준으로 다음 시점만 생성한다.

```text
7일 전  ACTION_DUE_7D
3일 전  ACTION_DUE_3D
1일 전  ACTION_DUE_1D
당일    ACTION_DUE_TODAY
지연    ACTION_OVERDUE
```

중간 날짜에는 알림을 만들지 않는다.

예:

- 6일 전: 없음
- 5일 전: 없음
- 4일 전: 없음
- 2일 전: 없음

`OVERDUE`는 동일 due date에 대해 최초 1회만 생성한다. 매일 반복하지 않는다.

---

## 3. 시간대

Calendar 계약과 동일하게 `Asia/Seoul`을 사용한다.

Notification에서 날짜 계산 로직을 별도로 구현하지 않고 `compliance-calendar-contract.js`를 재사용한다.

---

## 4. 수신자 V1

자동 수신자:

```text
OWNER
HR_ADMIN
```

조건:

- 해당 Organization의 ACTIVE membership
- Organization ACTIVE

자동 제외:

- MANAGER
- EMPLOYEE
- BILLING_ADMIN
- EXTERNAL_ADVISOR
- inactive/removed membership

이유:

노무 리스크 알림을 업무 범위가 확인되지 않은 사용자에게 자동 확산하지 않기 위해서다.

향후 `owner_membership_id` 담당자 지정 기능이 운영화되면 담당자 우선 정책을 별도 버전으로 추가한다.

---

## 5. Dedup

중복 방지 단위:

```text
channel
organization
recipient user
action
due date
notification milestone
```

개념적 key:

```text
IN_APP:<org>:<user>:COMPLIANCE_ACTION:<action>:<dueDate>:<notificationKey>
```

DB의 `dedup_key UNIQUE`로 최종 방어한다.

같은 sweep를 반복 실행해도 동일 알림이 증가하지 않아야 한다.

---

## 6. Stale candidate 취소

아직 전달되지 않은 PENDING 후보는 다음 경우 `CANCELLED` 처리한다.

- Action이 DONE/DISMISSED가 됨
- Action due date 삭제
- Action due date 변경
- 수신자의 eligible membership 제거/변경
- 해당 milestone 시점이 이미 지나감

예:

3일 전 알림 전달이 실패하여 PENDING인 상태에서 다음 날이 되었다면 오래된 `ACTION_DUE_3D`를 늦게 전달하지 않는다.

---

## 7. Outbox

테이블:

`compliance_notification_outbox`

상태:

```text
PENDING
DELIVERED
CANCELLED
FAILED
```

현재 channel:

```text
IN_APP
```

Bundle 13에서는 이메일/SMS channel을 선언하지 않는다.

Outbox와 실제 Inbox를 분리하는 이유는 향후 외부 provider를 추가하더라도 candidate generation 규칙을 재사용하기 위해서다.

---

## 8. In-app Inbox

테이블:

`in_app_notifications`

주요 필드:

```text
organization_id
recipient_user_id
outbox_id
notification_key
title
body
severity
source_type
source_id
metadata
created_at
read_at
```

읽음 처리는 해당 recipient 본인만 가능하다.

다른 tenant/user의 notification id를 직접 입력해도 읽음 처리할 수 없어야 한다.

---

## 9. API

조회:

```http
GET /api/saas/organizations/:organizationId/notifications
```

옵션:

```text
unreadOnly=1
limit=1..100
```

응답:

```text
notifications
unreadCount
```

읽음:

```http
PATCH /api/saas/organizations/:organizationId/notifications/:notificationId/read
```

보안:

- SaaS feature gate
- authenticated session
- Organization membership
- `compliance.read`
- read write에는 CSRF
- recipient user id 일치

---

## 10. Scheduler

`server.js` lifecycle에서 기존 Retention scheduler와 동일한 방식으로 시작/중지한다.

기본 sweep 간격:

```text
60분
```

환경 변수:

```text
COMPLIANCE_NOTIFICATION_SWEEP_INTERVAL_MS
```

최소 허용값:

```text
60,000 ms
```

프로덕션에서 `SAAS_ENABLED=0`이면 scheduler는 DB를 조회하지 않는 no-op이다.

graceful shutdown 시 interval을 정리한다.

---

## 11. 문구 안전성

사용자가 직접 설정한 `MANUAL_INTERNAL` due date는 항상 다음으로 설명한다.

**내부 관리 기한**

금지:

- 법정기한
- 법률상 마감일
- 법적으로 반드시 해당 날짜까지 수행해야 함

Notification은 기존 Action due date의 source를 전달할 뿐 새로운 법적 기한을 추론하지 않는다.

---

## 12. UI

Business Workspace에 다음을 추가한다.

- `알림` navigation
- unread badge
- 알림 목록
- severity
- due date/source label
- 읽음 처리
- 수동 새로고침

현재는 browser push, OS notification, 이메일, SMS를 사용하지 않는다.

---

## 13. 테스트 완료 조건

1. 7/3/1/당일/지연 milestone unit test
2. 중간 날짜 미생성
3. 동일 sweep idempotency
4. due date 변경 시 새 milestone 가능
5. stale PENDING 취소
6. overdue 동일 due date 1회
7. Owner/HR Admin only recipient policy
8. tenant isolation
9. read/unread lifecycle
10. SaaS OFF scheduler no-op
11. graceful scheduler stop hook
12. PostgreSQL migration/E2E
13. Business Chromium Inbox 표시/읽음
14. Worker Chromium 회귀 없음

---

## 14. 다음 단계

Bundle 13 이후 우선순위:

1. notification preference / mute policy
2. Action assignee 기반 수신자 우선순위
3. durable delivery retry/FAILED 정책
4. 이메일 provider adapter (운영 승인 후)
5. Monthly Compliance Close와 overdue reminder 연계

외부 provider를 붙이기 전에도 Candidate → Outbox → In-app 구조가 충분히 검증되어야 한다.
