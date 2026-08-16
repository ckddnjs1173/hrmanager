# 인사야 SaaS — RBAC / Permission Matrix

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 관련 코드: `lib/access-control-contract.js`

---

## 1. 원칙

인사야의 권한 모델은 `Role 이름 → 허용/거절` 하나로 끝내지 않는다.

최종 authorization은 다음을 순서대로 본다.

```text
Authenticated User
→ Active Membership
→ Role Permission
→ Resource Scope
→ Sensitive Field Policy
→ ShareGrant (cross-org인 경우)
→ Subscription Entitlement
→ Audit
```

Role은 permission preset이다.

Business 기능 코드가 다음처럼 Role 이름을 직접 검사하는 것은 금지한다.

```text
if (user.role === 'OWNER') ...
```

대신:

```text
can(user, 'employee.salary.read', resource)
```

형태를 사용한다.

---

# 2. Role Template

초기 Role:

- OWNER
- HR_ADMIN
- MANAGER
- EMPLOYEE
- EXTERNAL_ADVISOR
- BILLING_ADMIN

## OWNER

회사/사무소 전체 관리.

특수 권한:

- Organization 설정
- Role 변경
- Member 제거
- Billing
- Audit export
- Organization 삭제 요청

## HR_ADMIN

실무 인사·노무 관리자.

기본적으로:

- Employee 관리
- 급여 정보 열람
- Case 전체 관리
- Document 승인
- Audit 열람

Billing과 Organization 삭제는 기본 허용하지 않는다.

## MANAGER

담당 조직/사업장 범위의 관리자.

기본 scope:

```text
assigned workplaces / teams
```

기본적으로 급여 열람, 전체 export, member 관리, billing은 금지한다.

## EMPLOYEE

본인 데이터만 접근.

기본 scope:

```text
self
```

본인 Employee record, 본인 급여, 본인이 요청한 Case/문서 접근만 허용한다.

## EXTERNAL_ADVISOR

외부 공인노무사/자문자.

Organization 일반 데이터 권한을 주지 않는다.

기본 scope:

```text
grant_only
```

ShareGrant가 존재하는 Case/Document만 읽거나 검토한다.

## BILLING_ADMIN

결제/구독 전용.

Employee/Case/Document에 접근하지 않는다.

---

# 3. Permission Matrix

| Action | Owner | HR Admin | Manager | Employee | External Advisor | Billing Admin |
|---|---|---|---|---|---|---|
| org.read | O | O | O | O | 공유정보만 | O |
| org.manage | O | X | X | X | X | X |
| org.delete | O | X | X | X | X | X |
| member.read | O | O | X | X | X | X |
| member.invite | O | O | X | X | X | X |
| member.role.change | O | X | X | X | X | X |
| member.remove | O | X | X | X | X | X |
| workplace.read | O | O | scoped | X | 공유 시만 | X |
| workplace.manage | O | O | X | X | X | X |
| compliance.read | O | O | scoped | X | 공유 시만 | X |
| compliance.manage | O | O | X | X | 검토만 | X |
| employee.read | O | O | scoped | self | X | X |
| employee.write | O | O | X | X | X | X |
| employee.salary.read | O | O | 기본 X | self | X | X |
| employee.export | O | O | X | X | X | X |
| case.read | O | O | scoped | self | grant | X |
| case.create | O | O | scoped | request/self | X | X |
| case.update | O | O | scoped | X | review only | X |
| case.delete | O | O | X | X | X | X |
| case.share | O | O | X | X | X | X |
| document.generate | O | O | scoped | X | X | X |
| document.review | O | O | X | X | grant | X |
| document.approve | O | O | X | X | X | X |
| document.download | O | O | scoped | self | grant | X |
| audit.read | O | O | X | X | X | X |
| audit.export | O | X | X | X | X | X |
| billing.read | O | X | X | X | X | O |
| billing.manage | O | X | X | X | X | O |
| subscription.change | O | X | X | X | X | O |

`scoped`, `self`, `grant`는 단순 permission bit 외 추가 scope validation이 필요하다는 뜻이다.

---

# 4. Scope Model

## organization

Organization 전체 resource.

Owner / HR Admin의 기본 범위.

## assigned

Membership scope에 허용된 workplace/team만.

Manager의 기본 범위.

예:

```json
{
  "workplaceIds": ["wp-a", "wp-b"]
}
```

## self

EmployeeUserLink로 연결된 본인 Employee/Employment만.

## grant_only

External Advisor 전용.

ShareGrant 없이는 resource 자체를 발견할 수 없어야 한다.

## billing_only

Billing resources만.

---

# 5. Sensitive Field Policy

모든 Employee read가 같은 수준의 정보 공개를 의미하지 않는다.

초기 sensitive category:

- wage/salary
- disciplinary/dismissal Case
- private contact information
- export
- 향후 health/accommodation data

초기에는 dynamic field ACL 엔진을 만들기보다 service policy에서 명시적으로 분리한다.

예:

```text
employee.read
employee.salary.read
```

Manager는 `employee.read`가 있어도 `employee.salary.read`가 없으면 급여 필드를 받지 않는다.

API serializer 단계에서 masking한다.

---

# 6. External Advisor

External Advisor는 일반 Membership만으로 Case를 읽을 수 없다.

정상 흐름:

```text
Business HR Admin
→ Case 선택
→ Advisor 선택
→ permissions + expiry 설정
→ ShareGrant 생성
→ Advisor 검토
→ revoke/expire
```

Grant permission 예:

- shared.case.read
- shared.case.review
- shared.document.read
- shared.document.review

Grant가 만료되면 다음 요청부터 즉시 접근 불가.

다운로드 URL이 이미 발급된 경우 short TTL을 사용한다.

---

# 7. Membership State

Permission보다 먼저 Membership status를 확인한다.

```text
INVITED → 접근 불가
ACTIVE → 평가 진행
SUSPENDED → 접근 불가
REMOVED → 접근 불가
```

Role permission이 존재해도 ACTIVE가 아니면 deny다.

---

# 8. Entitlement와 Permission의 차이

Permission:

> 이 사용자가 이 행동을 할 자격이 있는가?

Entitlement:

> 이 Organization의 요금제가 이 기능을 사용할 수 있는가?

예:

```text
HR_ADMIN
+ document.approve permission = true
+ document.workflow entitlement = false
→ 기능 사용 불가 / upgrade 안내
```

반대로 Plan이 기능을 제공하더라도 User permission이 없으면 사용할 수 없다.

최종식:

```text
Allowed = Membership
       && Permission
       && Scope
       && Entitlement
       && Resource policy
```

---

# 9. Deny 처리

보안상 다른 tenant resource 존재 여부를 노출하면 안 되는 요청은 `404` 형태를 우선한다.

예:

```text
Org A가 Org B Case ID 직접 요청
→ 404
```

자기 Organization 안에서 권한이 부족한 경우는 제품 UX에 따라 403을 사용할 수 있다.

API 에러에는 내부 policy 상세를 과도하게 노출하지 않는다.

서버 audit에는 실제 deny reason을 기록할 수 있다.

---

# 10. Break-glass

운영자가 장애/지원 목적으로 고객 데이터에 접근하는 기능은 일반 admin permission과 분리한다.

필수:

- 명시적 reason
- time limit
- 가능하면 2차 승인
- 시작/종료 audit
- 고객 support ticket/reference
- 다운로드 제한

운영자 impersonation은 초기 MVP에서 제공하지 않는다.

필요해질 때 별도 정책으로 설계한다.

---

# 11. 테스트 기준

반드시 자동화할 시나리오:

1. Manager가 미할당 Workplace Employee 조회 → deny
2. Manager 급여 열람 → deny
3. Employee 다른 Employee 조회 → deny
4. Billing Admin Employee/Case 조회 → deny
5. External Advisor ShareGrant 없음 → deny
6. ShareGrant 있음 + shared permission → allow
7. ShareGrant revoke/expire → deny
8. SUSPENDED Membership → 모든 tenant access deny
9. HR Admin subscription 변경 → deny
10. Owner org.delete → permission allow, 실제 삭제는 lifecycle/re-auth 추가 검사
11. Entitlement 없는 기능 → permission 있어도 기능 실행 deny
12. Cross-tenant resource id → deny/not found

---

# 12. 구현 순서

```text
permission constants
→ role templates
→ membership guard
→ tenant context
→ scope resolver
→ field policy
→ ShareGrant policy
→ entitlement guard
→ audit middleware
→ IDOR integration tests
```

Business 화면 구현 전에 최소 employee/case/document 권한 경로를 먼저 완성한다.
