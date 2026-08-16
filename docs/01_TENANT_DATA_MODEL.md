# 인사야 SaaS — Identity / Tenant / Organization Data Model

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 적용 단계: SaaS Foundation
> 관련 코드: `lib/tenant-contract.js`, `lib/storage-contract.js`, `db/postgres/010_saas_identity.sql`

---

## 1. 목적

인사야는 현재 익명 Worker Case 중심 서비스다. SaaS 확장에서는 동일한 법률·Case·문서 엔진을 재사용하되, Business와 Pro 데이터는 계정과 Organization 기준으로 강하게 격리해야 한다.

이 문서는 다음 질문에 대한 구현 기준을 고정한다.

- 한 사람이 Worker / Business / Pro를 동시에 사용할 수 있는가
- 회사 데이터의 tenant boundary는 어디인가
- 회사가 입력한 Employee와 실제 로그인 User를 어떻게 구분하는가
- 여러 지점의 상시근로자수·법 적용 범위를 어떤 객체로 계산하는가
- 외부 노무사가 회사 데이터에 어떤 방식으로 접근하는가
- Organization 초대/탈퇴/삭제는 어떤 lifecycle을 따르는가
- 현재 익명 Worker Case를 SaaS 계정에 어떻게 연결할 것인가

---

# 2. 최상위 결정

## 2.1 Global User Identity는 하나, Security Realm은 분리

```text
User
├ Worker Realm
├ Business Membership(s)
└ Pro Membership(s)
```

한 이메일 주소로 Worker, Business, Pro를 모두 사용할 수 있다.

그러나 동일 User라는 이유만으로 각 realm의 데이터가 자동 연결되면 안 된다.

예:

```text
박OO
├ A회사 HR Admin
└ 개인 Worker Case: "회사에서 임금을 못 받았다"
```

A회사는 다음을 알 수 없어야 한다.

- 해당 User가 Worker 서비스를 사용했다는 사실
- Worker Case 존재 여부
- Case ID
- Case 내용
- 계산 결과
- 전문가 상담 여부

즉 `User identity 공유`와 `업무 데이터 공유`는 별개의 문제다.

---

## 2.2 Worker 로그인은 초기에는 선택사항

현재 Worker Case의 장점은 로그인 없이 바로 문제를 구조화할 수 있다는 점이다.

따라서 SaaS 계정 도입 후에도:

```text
문제 입력
→ 익명 Case 생성
→ token으로 접근
→ 결과 확인
→ 선택: "내 계정에 저장"
```

순서를 유지한다.

가입은 acquisition gate가 아니라 persistence/편의 기능이다.

초기 SaaS 개발에서 기존 `cases`와 `case_access_tokens`에 `user_id`를 추가하지 않는다.

향후 명시적 저장 기능이 필요하면 별도 binding을 사용한다.

예:

```text
worker_case_account_links
- case_id
- user_id
- linked_at
- linked_by_explicit_action
```

이 binding은 Employer Organization과 무관하다.

---

# 3. Organization 모델

Organization은 Business와 Pro에만 존재한다.

```text
Organization.type
- BUSINESS
- PRO_OFFICE
- INTERNAL
```

Worker 개인 사용자는 Organization이 없어도 된다.

한 User는 여러 Organization에 속할 수 있다.

예:

```text
User A
├ Company Alpha / HR_ADMIN
├ Company Beta / EXTERNAL_ADVISOR
└ Labor Office Gamma / OWNER
```

관계는 `Membership`으로 표현한다.

```text
User
  ↓
Membership
  ↓
Organization
```

---

# 4. 핵심 ERD

```text
users
├ auth_identities
├ user_sessions
└ organization_memberships
      ↓
organizations
├ business_profiles
├ workplaces
├ compliance_scopes
│   └ compliance_scope_workplaces
├ employees
│   ├ employments
│   └ employee_user_links ──→ users
├ share_grants
├ audit_logs
└ organization_deletion_requests
```

Worker realm:

```text
cases
├ case_events
└ case_access_tokens
```

Worker realm과 SaaS tenant realm은 초기에는 저장 객체 수준에서도 분리한다.

---

# 5. User / Auth

## users

Global identity만 저장한다.

주요 필드:

- `id`
- `email_normalized`
- `email_verified_at`
- `status`
- `created_at`
- `updated_at`
- `deleted_at`

회사별 직급, 급여, 부서 등은 저장하지 않는다.

## auth_identities

로그인 수단을 User와 분리한다.

예:

- password
- email magic link
- Google
- 향후 SSO

동일 User가 복수 provider를 가질 수 있다.

## user_sessions

세션은 서버가 소유한다.

필수:

- raw token 저장 금지
- token hash 저장
- 만료
- revoke
- 전체 세션 revoke
- 필요 시 IP hash / User-Agent

---

# 6. Membership

권한은 User 자체가 아니라 Organization Membership에 붙는다.

```text
organization_memberships
- organization_id
- user_id
- role_key
- status
- scope
```

초기 role template:

- OWNER
- HR_ADMIN
- MANAGER
- EMPLOYEE
- EXTERNAL_ADVISOR
- BILLING_ADMIN

실제 권한은 다음 RBAC 문서에서 action permission으로 정의한다.

Role enum 하나만으로 모든 정책을 처리하지 않는다.

`scope`는 Manager의 workplace/team 제한 등에 사용한다.

---

# 7. Organization Invitation

초대 lifecycle:

```text
PENDING
├ ACCEPTED
├ EXPIRED
└ REVOKED
```

원칙:

- 초대 token은 hash만 저장
- single-use
- expiry 필수
- 재전송 시 기존 token revoke 가능
- 초대 수락 시 현재 로그인 이메일과 초대 이메일 검증
- 다른 Organization Membership을 자동 생성하지 않음

초기 권장 만료: 7일.

---

# 8. Workplace와 ComplianceScope를 분리

이 구분은 인사야 Business의 핵심 모델이다.

## Workplace

실제 운영 장소다.

예:

- 본사
- 강남점
- 부산점
- 물류센터

## ComplianceScope

노동법 적용범위를 판단할 때 사용하는 법적 aggregation 단위다.

```text
Organization
├ Workplace A
├ Workplace B
└ ComplianceScope X
    ├ Workplace A
    └ Workplace B
```

실제 지점이 둘이라고 해서 반드시 법적으로 서로 다른 `사업 또는 사업장`이라고 단정할 수 없다.

따라서 5인 기준, 취업규칙, 연장근로 가산 등 적용범위를 Risk Engine이 계산할 때 물리 지점 개수만 사용하면 안 된다.

ComplianceScope는 다음을 가진다.

- grouping 근거
- worker count 산정 방식
- 적용 rule version
- effective period
- verified status

사실관계가 부족하면 Risk Engine은 강제 판정 대신:

```text
scope status = UNCERTAIN
```

으로 표시하고 추가 질문 또는 전문가 검토를 요구한다.

---

# 9. Employee와 Employment를 분리

## Employee

회사 내부의 사람 레코드다.

```text
Employee
- employee_number
- display_name
- work_email(optional)
- status
```

주민등록번호는 초기 제품에서 저장하지 않는다.

## Employment

그 사람과 회사 사이의 근로관계다.

```text
Employment
- employee_id
- workplace_id
- employment_type
- hire_date
- termination_date
- weekly_contract_hours
- wage_type
- probation period
- fixed-term period
- effective period
```

이렇게 분리해야 재입사, 계약 변경, 과거 근로관계 이력을 보존할 수 있다.

---

# 10. Employee != User

회사가 직원 명단에 이메일을 입력했다고 해서 해당 이메일의 인사야 User와 자동 연결하지 않는다.

금지:

```text
employee.work_email == user.email
→ 자동 link
```

허용:

```text
회사 초대
→ User가 링크 확인
→ 명시적 수락
→ employee_user_links ACTIVE
```

이 원칙은 Worker privacy leak 방지를 위해 필수다.

`employee_user_links`는 초대와 수락이 모두 있어야 ACTIVE가 될 수 있다.

---

# 11. Worker Case와 Business Case

초기에는 저장소까지 분리한다.

```text
WorkerCaseRepository
- anonymous/token security

BusinessCaseRepository
- authenticated
- organization scoped
```

공유하는 것은 저장 row가 아니라 Domain Engine이다.

```text
Case Rules
Legal Registry
Calculation Engine
Document Engine
AI Explanation
```

즉 기존 `cases`에 nullable `organization_id`, `user_id`를 계속 추가해 하나의 거대한 테이블로 만드는 방향은 채택하지 않는다.

PostgreSQL tenant isolation이 충분히 안정된 뒤 저장소 통합 필요성을 다시 평가한다.

---

# 12. External Advisor / Pro Collaboration

외부 노무사를 회사의 일반 HR Admin으로 넣지 않는다.

기본 모델:

```text
Business Organization
  ↓ explicit ShareGrant
Pro Organization / Advisor User
```

ShareGrant는 다음을 명시한다.

- owner organization
- grantee organization/user
- resource type
- resource id
- permissions
- expiry
- revoke

예:

```text
Case #123
READ + REVIEW
2026-09-30까지
```

외부 Advisor는 ShareGrant 없이:

- 전체 Employee 목록
- 급여
- 다른 Case
- 전체 Audit Log

에 접근할 수 없다.

---

# 13. Tenant Boundary Invariant

개발과 테스트에서 다음을 절대조건으로 둔다.

1. Business/Pro tenant resource는 organization owner를 가진다.
2. API lookup은 `resource_id`만으로 조회하지 않는다.
3. `organization_id + resource_id` 기준으로 scope한다.
4. Membership 제거 즉시 tenant 접근권한을 잃는다.
5. Employer tenant는 Worker Case 존재 여부도 조회할 수 없다.
6. 이메일/전화번호 일치로 Employee ↔ User를 자동 연결하지 않는다.
7. External Advisor는 ShareGrant 없이 cross-org resource를 볼 수 없다.
8. ShareGrant는 resource-scoped, revocable, expiry 가능해야 한다.
9. 운영자의 break-glass 접근은 시간 제한과 audit가 필요하다.
10. last owner가 아무 절차 없이 Organization을 떠날 수 없다.

IDOR 회귀 테스트는 필수다.

예:

```text
Org A 로그인
GET /organizations/A/cases/{OrgB case id}
→ 404 또는 access denied
```

---

# 14. Organization Lifecycle

```text
DRAFT
→ ACTIVE
→ SUSPENDED
→ ACTIVE

ACTIVE
→ DELETION_PENDING
→ ACTIVE (취소)
→ DELETED
```

`ACTIVE → DELETED` 직행은 금지한다.

삭제 절차:

```text
Owner 재인증
→ 삭제 요청
→ 14~30일 grace
→ Organization suspended/read-only
→ export 제공
→ hard delete
→ backup retention expiry
```

법적 보존 또는 legal hold가 있으면 삭제 실행을 중단할 수 있다.

---

# 15. Owner 규칙

Organization은 최소 1명의 ACTIVE Owner를 가져야 한다.

마지막 Owner는:

- 다른 ACTIVE Member에게 ownership 이전
- 또는 Organization closure 절차 시작

중 하나 없이 탈퇴할 수 없다.

Owner transfer에는 재인증을 요구한다.

MFA가 활성화된 계정은 MFA 재확인을 요구한다.

---

# 16. 삭제와 데이터 소유권

User 계정 삭제와 Organization 삭제는 다른 작업이다.

User가 회사를 떠나도 회사 데이터는 Organization 소유로 유지된다.

예:

```text
HR Admin 퇴사
→ Membership REMOVED
→ User 개인 계정 유지 가능
→ 회사 Employee/Case/Document/Audit 데이터 유지
```

Organization 삭제는 Owner 권한과 grace period를 거친다.

---

# 17. 초기 Business Acquisition과 연결

현재 공개 사업주 자율점검을 SaaS funnel로 재사용한다.

```text
익명 Risk Check
→ "확인할 항목 6개"
→ 결과 저장/관리
→ User 생성
→ Organization 생성
→ 회사 노무 DNA
→ Employee 1명 또는 CSV
→ Full Risk Scan
→ 첫 Action 완료
```

가입 전에 결과를 보여준다.

SaaS 가입을 무료 도구 사용의 선행조건으로 만들지 않는다.

---

# 18. 구현 순서

```text
1. PostgreSQL target schema
2. User/Auth repository
3. Organization/Membership repository
4. tenant context middleware
5. organization-scoped repository tests
6. invitation flow
7. Workplace / ComplianceScope
8. Employee / Employment
9. EmployeeUserLink explicit flow
10. ShareGrant
11. Audit
12. Organization deletion/offboarding
```

Worker Case account save는 위 foundation 안정화 이후 별도 기능으로 진행한다.

---

# 19. 완료 조건

이 모델은 다음 테스트가 모두 존재할 때 구현 완료로 본다.

- 같은 resource ID라도 다른 org context에서 접근 불가
- Membership REMOVED 이후 API 접근 불가
- Worker Case를 Employer가 조회할 수 없음
- Employee email과 User email 일치만으로 link 생성되지 않음
- 초대 수락 전 EmployeeUserLink ACTIVE 불가
- ShareGrant revoke/expiry 이후 Advisor 접근 불가
- 마지막 Owner 무단 탈퇴 불가
- Organization 삭제 grace 취소 가능
- Audit event가 tenant/resource/actor/request ID를 기록

이 invariant는 Business MVP보다 먼저 완성한다.
