# 인사야 Business — Monthly Compliance Close Runtime

> 상태: Bundle 14 구현 계약
> 기준일: 2026-08-16

## 목적

매월 Risk·Action·기한·완료 활동을 하나의 운영 Snapshot으로 확인하고 마감한다.

이 기능은 **법적 준수 인증이 아니다.** `CLOSED`는 “해당 시점의 인사야 운영 상태를 책임자가 확인해 기록했다”는 의미만 가진다.

## 구조

```text
Organization
  ↓
Compliance Close Period (YYYY-MM)
  ↓ refresh
Current mutable snapshot
  ↓ close
Append-only Closed Snapshot v1
  ↓
History / Audit
```

Open 기간의 current snapshot은 새로고침할 수 있다. 닫는 순간 최신 DB 상태를 다시 계산한다. 닫힌 Snapshot은 원본 Risk/Action이 이후 변경되어도 수정하지 않는다.

## 기간/시간대

- `Asia/Seoul`
- 월 시작: 한국시간 1일 00:00
- 월 종료 exclusive: 다음 달 1일 00:00
- 미래 월 마감 금지
- 과거 월을 늦게 마감할 수 있으나, Snapshot은 과거 월말 상태를 재구성한다고 주장하지 않는다. `generatedAt` 시점 상태와 선택 월의 완료 활동을 기록한다.

## Snapshot V1

- 활성 Risk 총수 / severity / uncertainty
- 활성 Action / status / priority
- 기한 지연 Action
- 선택 월 완료 Action
- unresolved 상위 항목
- 직원/사업장/ComplianceScope 수
- 최신 completed Risk Run의 Legal Registry version/context
- deterministic SHA-256 snapshot hash

목록은 운영 UI/기록 크기를 제한하기 위해 상위 항목 중심으로 저장한다.

## Readiness

중복 점수는 사용하지 않는다.

```text
unresolved = unique active Risk count + active Action count
```

- unresolved > 0 → `acknowledgeUnresolved=true` 필수
- Critical/High/Overdue > 0 → 위 확인 + 마감 메모 필수
- 미해결 항목이 있어도 명시적으로 확인하면 마감 가능

즉 마감 때문에 Risk를 억지로 dismiss하거나 Action을 거짓 완료 처리할 필요가 없다.

## Lifecycle

V1:

```text
OPEN → CLOSED
```

`REOPEN`은 구현하지 않는다.

닫힌 뒤 정정이 필요하면 향후 superseding snapshot/version 정책으로 확장한다. V1에서 기존 closed snapshot을 수정하는 API는 없다.

같은 월에 close를 다시 요청하면 새 Snapshot을 만들지 않고 기존 결과를 반환한다.

## API

```text
GET  /api/saas/organizations/:orgId/compliance-close/current?month=YYYY-MM
GET  /api/saas/organizations/:orgId/compliance-close/history
GET  /api/saas/organizations/:orgId/compliance-close/:month/snapshots
POST /api/saas/organizations/:orgId/compliance-close/:month/refresh
POST /api/saas/organizations/:orgId/compliance-close/:month/close
```

조회: `compliance.read`
변경/마감: `compliance.manage` + CSRF

## Audit

- `compliance.close.refresh`
- `compliance.close.complete`

Period Event:

- `REFRESHED`
- `CLOSED`

## UI

초기 V1은 `/business-close.html` 독립 Workspace로 제공한다.

표시:

- 활성 Risk
- 활성 Action
- 기한 지연
- 해당 월 완료
- unresolved 항목
- 조직 규모 context
- legal registry context
- snapshot hash
- 확인 checkbox
- 고위험 마감 note
- closed history

항상 “법적 준수 인증 아님” 문구를 노출한다.

## 하지 않는 것

- 법적 무위반 인증
- 월말 과거 상태를 현재 데이터에서 추정
- closed snapshot 수정
- 자동 reopen
- 전자서명/공인 인증서 발급
- 외부 노무사 승인 대체
- 이메일/SMS 발송

## Release gate

- KST month boundary unit test
- stable snapshot hash
- unresolved 중복계산 방지
- acknowledgement/note guard
- PostgreSQL preview/refresh/close/idempotency
- closed snapshot immutability
- tenant isolation
- event/audit persistence
- Chromium unresolved → guard → close → history
- 기존 Worker/Business CI 회귀 없음
