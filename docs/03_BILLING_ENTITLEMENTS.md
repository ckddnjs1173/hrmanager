# 인사야 SaaS — Billing / Entitlement

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 관련 코드: `lib/billing-contract.js`
> 관련 DB: `db/postgres/020_billing_entitlements.sql`

---

## 1. 핵심 원칙

결제사 상태를 곧바로 제품 권한으로 사용하지 않는다.

```text
Payment Provider
→ Billing Account / Subscription
→ Plan
→ Entitlement
→ Product Access
```

결제사는 돈을 받는 수단이다.

제품 기능의 source of truth는 인사야의 Subscription/Entitlement다.

따라서 Stripe, PortOne, Toss Payments 등 provider가 바뀌어도 Business logic을 다시 만들지 않는다.

---

# 2. Plan

초기 Plan key:

- FREE
- STARTER
- STANDARD
- PRO
- ENTERPRISE

가격은 DB의 `plan_prices`에서 관리한다.

코드에 `if plan === PRO` 형태로 기능을 하드코딩하지 않는다.

기능은 Entitlement로 판단한다.

---

# 3. 가격 가설

초기 실험값:

| Plan | 월 가격 가설 | 대상 |
|---|---:|---|
| Free | 0원 | 유입/체험 |
| Starter | 49,000원 | 1~10인 |
| Standard | 99,000원 | 11~30인 |
| Pro | 199,000원 | 31~100인/다지점 |
| Enterprise | 협의 | 100인+, API/SSO/SLA |

연간 결제는 약 10개월 가격 수준을 실험안으로 둔다.

이 가격은 제품 계약이 아니라 GTM 가설이다.

---

# 4. Entitlement

Permission과 분리한다.

예:

```text
employee.limit = 10
admin.limit = 1
workplace.limit = 1
case.full = true
document.workflow = false
```

초기 entitlement key:

- employee.limit
- admin.limit
- workplace.limit
- case.full
- risk.dashboard
- document.workflow
- advisor.collaboration
- audit.read
- audit.export
- audit.retention_days
- ai.monthly_credits
- bulk.import
- api.access
- sso.access

Entitlement는 boolean 또는 non-negative integer를 기본 타입으로 한다.

향후 복잡한 value가 필요하면 schema version을 추가한다.

---

# 5. Plan Entitlement와 Subscription Override

기본:

```text
Plan Entitlement
```

Enterprise나 임시 프로모션은:

```text
Subscription Entitlement Override
```

를 사용할 수 있다.

우선순위:

```text
subscription override
> plan entitlement
> default deny
```

Override는 effective period와 reason을 가진다.

---

# 6. Subscription Lifecycle

```text
TRIALING
├ ACTIVE
├ CANCELLED
└ EXPIRED

ACTIVE
├ PAST_DUE
└ CANCELLED

PAST_DUE
├ ACTIVE
├ GRACE
├ SUSPENDED
└ CANCELLED

GRACE
├ ACTIVE
├ SUSPENDED
└ CANCELLED

SUSPENDED
├ ACTIVE
└ CANCELLED

CANCELLED
→ EXPIRED
```

`EXPIRED`에서 자동 복구하지 않는다.

새 구독 또는 운영자 승인 절차를 사용한다.

---

# 7. Trial

초기 가설:

- 14일 또는 30일
- 카드 선등록 필수 아님
- Activation을 먼저 측정

Trial 종료 시:

- 결제수단/구독 활성화 → ACTIVE
- 전환 없음 → EXPIRED 또는 Free downgrade

어느 정책을 택할지는 실제 판매 실험 전에 확정한다.

데이터를 Trial 종료와 동시에 삭제하지 않는다.

---

# 8. Upgrade

권장 초기 정책:

- 즉시 기능 활성화
- 결제 provider가 prorate 지원 시 반영
- Entitlement 변경은 provider webhook 성공 여부와 별개로 idempotent 처리

Webhook 순서 꼬임에 대비해 provider event id를 저장한다.

---

# 9. Downgrade

Downgrade 때문에 고객 데이터를 즉시 삭제하지 않는다.

예:

```text
Pro: employee.limit 100
→ Starter: employee.limit 10
현재 Employee 35명
```

처리:

- 기존 35명 유지
- 추가 생성 제한
- 일부 고급 action 제한
- 고객에게 정리/upgrade 안내

데이터 삭제를 과금 수단으로 사용하지 않는다.

---

# 10. Failed Payment

권장 lifecycle:

```text
ACTIVE
→ PAST_DUE
→ retry
→ GRACE
→ SUSPENDED
```

초기 grace 예시: 7일.

실제 기간은 결제 정책 확정 시 DB/config로 관리한다.

SUSPENDED에서도 최소한 다음은 허용하는 방향을 검토한다.

- 로그인
- billing 화면
- data export
- subscription 복구

고객 데이터는 보존한다.

---

# 11. Cancel

기본:

```text
cancel_at_period_end = true
```

현재 결제기간 종료까지 기능을 유지한다.

즉시 취소는 환불/사기/관리자 조치 등 별도 사유에서 사용한다.

CANCELLED 이후 period 종료 시 EXPIRED.

---

# 12. Usage Meter

초기 meter:

- employee_count
- admin_seat_count
- workplace_count
- ai_credit_usage

각 meter는 aggregation 방식을 가진다.

예:

```text
employee_count → LATEST
ai_credit_usage → SUM
```

usage event에는 idempotency key를 요구한다.

Webhook/retry 때문에 같은 사용량이 중복 계산되는 것을 막는다.

---

# 13. Limit 초과

Hard delete/강제 차단보다 action-level enforcement를 사용한다.

예:

```text
employee.limit = 10
현재 10
→ 11번째 Employee 생성 차단
→ 기존 10명 조회/관리 가능
```

AI credit 초과는:

- 추가 구매
- 다음 period까지 제한
- higher plan 안내

중 하나를 제품 정책으로 선택할 수 있다.

---

# 14. Billing Admin

Billing Admin은:

- billing account
- invoice
- subscription
- 결제수단

만 관리한다.

Employee/Case/Document 데이터는 볼 수 없다.

Owner는 Billing 권한을 포함한다.

HR Admin은 기본 Billing 권한이 없다.

---

# 15. Invoice / Receipt

`invoice_references`는 결제사의 invoice 원본을 복제하는 테이블이 아니다.

인사야에서 필요한 참조만 저장한다.

- provider
- provider invoice id
- status
- amount
- period
- paid time

세금계산서/현금영수증/카드영수증 세부정책은 국내 결제사 결정 후 확정한다.

---

# 16. Coupon

초기 지원 유형:

- PERCENT
- AMOUNT
- TRIAL_EXTENSION
- CUSTOM

쿠폰도 product entitlement를 직접 수정하지 않는다.

가격/기간을 조정하고 Subscription state는 별도 유지한다.

---

# 17. Enterprise

Enterprise는 가격이 수기 계약이어도 SaaS 시스템 안에서는 Entitlement로 표현한다.

예:

```text
employee.limit = 500
workplace.limit = 50
api.access = true
sso.access = true
audit.retention_days = 1095
```

계약서에만 존재하고 제품 DB에는 없는 특수 기능을 최소화한다.

---

# 18. Access Evaluation

최종 기능 접근:

```text
User Permission
+ Tenant Scope
+ Active Subscription State
+ Effective Entitlement
+ Usage Limit
```

예:

```text
HR Admin
permission: document.approve = true
entitlement: document.workflow = true
→ allow
```

```text
HR Admin
permission = true
entitlement = false
→ deny + upgrade CTA
```

---

# 19. Webhook 원칙

실제 결제 provider 도입 시:

- signature 검증
- event id idempotency
- raw secret logging 금지
- out-of-order event 처리
- retry-safe
- provider 상태를 내부 Subscription state로 normalize

Webhook 실패 때문에 고객 Entitlement가 영구적으로 꼬이지 않도록 reconciliation job을 둔다.

---

# 20. 테스트 기준

필수:

1. ACTIVE → TRIALING 불가
2. EXPIRED → ACTIVE 직접 전환 불가
3. PAST_DUE → ACTIVE 가능
4. invalid entitlement type 거절
5. subscription override가 plan value보다 우선
6. Billing Admin은 people/case permission 없음
7. HR Admin은 subscription.change 없음
8. limit 초과 시 기존 데이터 삭제 없음
9. duplicate usage event idempotency 차단
10. provider reference 없이도 Enterprise 수기 subscription 표현 가능
11. cancel_at_period_end 동안 period 종료 전 entitlement 유지
12. entitlement 없는 기능은 permission 있어도 deny

---

# 21. 구현 순서

```text
Plan/Price tables
→ Entitlement repository
→ Subscription repository
→ entitlement resolver
→ usage meter
→ permission + entitlement guard
→ Billing UI
→ payment provider adapter
→ webhook
→ reconciliation
→ invoice/receipt
```

결제 provider 선택은 이 foundation 뒤에 해도 된다.
