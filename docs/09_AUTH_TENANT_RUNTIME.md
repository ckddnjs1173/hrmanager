# 09. SaaS Auth + Tenant Runtime

> 상태: Bundle 8 runtime contract
> 기본 배포 상태: `SAAS_ENABLED=0`

## 1. 목적

기존 Worker 익명 Case 보안영역을 건드리지 않고 Business/Pro용 글로벌 User + Organization runtime을 추가한다.

```text
Worker realm
anonymous Case + Case token

Business / Pro realm
User
→ Session
→ Membership
→ Organization
```

Worker Case는 User email 또는 Employee email을 기준으로 자동 연결하지 않는다.

## 2. Feature gate

SaaS API는 `/api/saas/*` 아래에 존재하지만 기본 OFF다.

활성화 조건:

```text
SAAS_ENABLED=1
STORAGE_DRIVER=postgres
DATABASE_URL=...
SAAS_SESSION_SECRET=...
```

하나라도 충족되지 않으면 활성 SaaS runtime으로 간주하지 않는다.

현재 production은 `SAAS_ENABLED=0`을 유지하므로 기존 Worker 사용자 동작은 변하지 않는다.

## 3. 인증 방식

초기 runtime은 이메일 magic-link 기반이다.

```text
email
→ auth challenge
→ raw random token 1회 발급
→ DB에는 SHA-256 hash만 저장
→ verify
→ User 생성/확인
→ email_verified_at
→ HttpOnly session cookie
```

DB에 저장하지 않는 값:

- raw magic-link token
- raw session token
- raw invitation token

세션 쿠키:

- HttpOnly
- SameSite=Lax
- production Secure
- `/api/saas` scope
- 기본 30일 TTL

## 4. 이메일 발송 경계

Bundle 8은 이메일 provider를 임의 선택하거나 비용을 발생시키지 않는다.

따라서 실제 production delivery adapter가 붙기 전에는 SaaS login/invitation을 production에 공개하지 않는다.

`SAAS_AUTH_TOKEN_ECHO=1`은 local/test CI 전용이다.

- test/dev: raw token을 debug 응답으로 받을 수 있음
- production: 설정 자체를 거부

이 구조로 실제 SMTP/transactional email provider를 후속 Bundle에서 안전하게 연결한다.

## 5. CSRF

Cookie session을 사용하는 모든 mutation은 `x-csrf-token`을 요구한다.

CSRF token은 session ID와 `SAAS_SESSION_SECRET`의 HMAC으로 계산한다.

```text
GET /api/saas/auth/me
→ user
→ csrf
```

DB에 CSRF token을 별도 저장하지 않는다.

## 6. Organization 생성

인증된 User가 Organization을 만들면 transaction 안에서 동시에:

1. Organization ACTIVE 생성
2. OWNER Membership ACTIVE 생성
3. organization.create audit 기록

을 수행한다.

Organization ID만 아는 다른 User는 조회할 수 없다.

## 7. Membership / RBAC

권한 Source of Truth는 `lib/access-control-contract.js`다.

Bundle 8에서 실제 사용하는 permissions:

- `member.read`
- `member.invite`
- `member.role.change`
- `member.remove`

예:

```text
OWNER
- invite O
- role change O
- remove O

HR_ADMIN
- invite O
- role change X
- remove X

MANAGER
- member read X
```

API route 이름으로 권한을 판단하지 않고 active Membership + permission contract를 조회한다.

## 8. Invitation

일반 Organization 초대로 허용되는 Role:

- HR_ADMIN
- MANAGER
- EMPLOYEE
- BILLING_ADMIN

허용하지 않음:

- OWNER: 별도 owner transfer 절차가 필요
- EXTERNAL_ADVISOR: ShareGrant 기반이어야 함

초대 token도 hash만 저장한다.

accept 조건:

- authenticated User
- User verified email == invitation email
- invitation PENDING
- expiry 전
- token 일치

## 9. Owner 안전장치

Bundle 8의 일반 role/remove API는 OWNER를 변경하거나 제거하지 못한다.

```text
OWNER role change
→ owner_transfer_required

OWNER remove
→ owner_transfer_required
```

향후 별도 Owner Transfer flow에서 re-auth/MFA와 함께 구현한다.

## 10. Tenant isolation

모든 Organization resource 접근은:

```text
organization_id
+
current user
+
ACTIVE membership
```

을 요구한다.

다른 tenant ID를 직접 입력한 경우 존재 여부를 최소 노출하기 위해 `organization_not_found`로 처리한다.

## 11. Audit 구분

Global auth/security:

`security_events`

예:

- auth.magic.request
- auth.magic.verify
- auth.login
- auth.logout

Tenant operation:

`audit_logs`

예:

- organization.create
- member.invite
- member.invite.accept
- member.invite.revoke
- member.role.change
- member.remove

Global login을 특정 Organization audit에 억지로 귀속시키지 않는다.

## 12. CI Release Gate

실제 PostgreSQL 17에서 다음을 검증한다.

```text
magic-link login
→ replay 거부
→ HttpOnly session
→ CSRF 거부/허용
→ Organization 생성
→ OWNER 자동 Membership
→ HR_ADMIN 초대
→ invitation accept
→ HR_ADMIN permission
→ 두 번째 tenant cross-access 차단
→ OWNER role change
→ removed membership 즉시 접근 차단
→ raw token 미저장
→ audit/security events 확인
→ logout/session revoke
```

## 13. 다음 구현

Bundle 8 이후 실제 Business 화면 전에 필요한 runtime 순서:

1. production email delivery adapter
2. Workplace / ComplianceScope CRUD
3. Employee Lite / CSV import
4. Business onboarding runtime
5. Risk evaluation runtime
6. Business dashboard

이때도 Worker 익명 Case realm은 계속 독립 유지한다.
