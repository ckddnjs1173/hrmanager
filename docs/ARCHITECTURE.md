# 인사야 Architecture — PREDEPLOY RC

> **기준일:** 2026-08-25  
> **목적:** 장기 목표가 아니라 현재 저장소의 실제 실행 구조, tenant/security boundary, 배포 전 안전계약을 기록한다.

---

## 1. 전체 구조

```text
Browser
├─ Public / Worker
│  ├─ Legacy Product Home
│  ├─ Core 5 Case Workspaces
│  └─ Guide / Calculator / Document surfaces
├─ Business
│  ├─ Login / invitation continuation
│  ├─ Organization workspace
│  ├─ Risk / Action / Calendar / Notification
│  ├─ Compliance Close
│  └─ Business Case / Document / Advisor collaboration
└─ Advisor
   ├─ Login / invitation preview
   ├─ Shared Case list
   └─ Comment / document download / document review

HTTP
↓
server.js
↓
lib/application.js
├─ /api/health / /api/readiness
├─ /api/cases/*
├─ /api/saas/*
├─ AI / documents / experts / public operations
├─ admin / partner / secure summary
├─ public SEO transforms
└─ guarded static assets

Storage
├─ Worker/legacy runtime adapter
├─ PostgreSQL SaaS primary
├─ encrypted document binary store
└─ audit/event history
```

핵심 원칙은 Worker, Business, Advisor가 같은 서비스에 존재하더라도 **자동으로 같은 security domain이 되지 않는 것**이다.

---

## 2. Bootstrap / Application Boundary

### `server.js`

`server.js`는 bootstrap만 담당한다.

```text
env load
→ createApplication()
→ scheduler/job start
→ app.listen()
→ graceful shutdown
```

도메인 route, tenant authorization, legal rule을 다시 `server.js`로 넣지 않는다.

### `lib/application.js`

Express composition의 canonical entrypoint다.

- trust proxy
- request context / request ID
- HTTP security headers
- JSON size limit
- session/rate-limit infrastructure
- domain router mount
- user-facing HTML transformation
- SEO/runtime origin routes
- guarded static serving
- branded 404 / safe error boundary

---

## 3. Public / Worker Architecture

### Core 5 Registry

`lib/case-domain-registry.js`가 Worker 1.0 Case의 canonical registry다.

```text
wage
dismissal
retirement
worktime
annual_leave
```

각 descriptor는 stable domain ID, UI path, intake/report/document route fragments, service operations를 연결한다.

### Case pipeline

```text
Intake UI
↓
Protected Case API
↓
Fact normalization / Missing facts
↓
Deterministic Legal / Money rules
↓
Action / Resource planner
↓
Repository
↓
Workspace
├─ facts
├─ assessment / money
├─ evidence
├─ next action
├─ official sources
├─ documents
├─ official procedure
└─ report
```

### Access boundary

Case 생성 시 opaque token을 발급한다.

- Case ID만으로 protected Case 조회 금지
- token 원문 DB 미저장
- browser token은 현재 탭 `sessionStorage` only
- URL query에 Case token 저장 금지
- expiry/revoke/retention 적용
- 후속 요청은 `x-case-token` 또는 Bearer contract 사용

### Frontend shared layers

```text
case-client-core.js
case-workspace-core.css
assets/brand/case-ui.css
case-detail.js
case-detail.css
```

`case-detail.*`는 predeploy UX layer다. 법률/계산 로직을 재구현하지 않고 loading/error/offline/focus/mobile/accessibility만 공통 보강한다.

---

## 4. Legal / Rule Boundary

`lib/legal-registry.js`가 공식 Legal source contract의 기준이다.

```text
Known facts
↓
Reference date
↓
Deterministic rule/calculator
↓
assessment / amount / assumptions / source / warning
↓
UI or AI explanation
```

원칙:

- 숫자·법정기한·핵심 적용판단은 LLM 자유생성보다 deterministic result 우선
- 모르는 사실은 guess하지 않고 missing/unknown 유지
- source metadata는 공식 URL/시행일/verified context를 보존
- Worker와 Business rule이 같은 법적 사실을 다룰 때도 tenant/business workflow와 법률 source 자체는 분리해서 생각한다.

---

## 5. Legal Change Governance

법령 변경 감지 결과가 운영 Rule을 자동으로 바꾸지 않는다.

```text
Official source candidate
→ source snapshot
→ content SHA-256
→ human review
→ rule proposal
→ fixture validation
→ READY_FOR_IMPLEMENTATION
→ 별도 code/review/release
```

보안/품질 불변조건:

- allowlisted official source만 후보로 사용
- human review bypass 금지
- fixture 없는 proposal 검증 금지
- AI 자동 승인 금지
- runtime ACTIVE 자동 승격 금지
- scheduler는 production에서 명시적 enable 전까지 OFF/fail-closed

Admin Legal Queue는 기존 Admin 인증/CSRF 경계를 사용한다.

---

## 6. SaaS Identity / Tenant Boundary

Business SaaS의 기본 security graph:

```text
Global User
↓
Organization
↓
Membership
↓
Role / Permission
↓
Tenant-owned Resource
```

### Organization boundary

- tenant-owned resource는 `organization_id`를 가진다.
- 요청자는 ACTIVE Membership을 가져야 한다.
- resource의 실제 organization과 요청 scope를 다시 비교한다.
- 클라이언트가 보낸 organization ID만 신뢰하지 않는다.

### RBAC

역할/권한은 canonical SaaS RBAC contract를 통과한다.

예:

- OWNER: organization destructive/billing/management 범위
- HR_ADMIN: HR/Compliance management 범위
- MANAGER: 제한된 운영 범위
- EMPLOYEE: 자신의 허용 범위
- BILLING_ADMIN: billing 전용 경계
- EXTERNAL_ADVISOR: Membership role이 아니라 ShareGrant 경계

외부 Advisor를 편의를 위해 Organization Membership으로 자동생성하지 않는다.

---

## 7. SaaS Authentication

Production Business/Advisor 인증은 magic-link 이메일 계층을 사용한다.

```text
email request
→ server token issue
→ provider delivery
→ URL fragment
→ /business-login.html
→ fragment 즉시 제거
→ one-time verify API
→ HttpOnly/SameSite session
→ Business or Advisor continuation
```

보안 원칙:

- production JSON raw magic token echo 금지
- token을 localStorage/sessionStorage에 보관하지 않음
- fragment를 읽은 즉시 `history.replaceState`로 제거
- return target allowlist
- malformed token/session fail-safe
- production email configuration 미완성 시 fail-closed

Organization invitation과 Advisor invitation도 이메일 전달 및 one-time token 경계를 사용한다.

---

## 8. Business Product Architecture

현재 Business 흐름:

```text
Auth
→ Organization / Membership
→ Onboarding
→ Company / Employee Lite facts
→ Risk evaluation
→ Action
→ Calendar / Notification
→ Monthly Compliance Close
→ Business Case
→ Document / Advisor collaboration
```

### Risk / Action

Risk는 임의 점수형 AI 평가가 아니라 finite deterministic rule pack을 사용한다.

```text
facts
→ rule applicability
→ APPLICABLE / NOT_APPLICABLE / UNCERTAIN
→ severity / finding
→ remediation Action candidate
```

UNKNOWN fact를 위반으로 승격하지 않는다.

Action은 explicit state machine과 history를 가진다. BLOCKED/DISMISSED 등은 이유를 요구하고, 완료조건을 우회해 cosmetic DONE으로 바꾸지 않는다.

### Compliance Calendar

법정기한과 내부 관리일을 같은 문구로 표시하지 않는다. 날짜 계산은 Asia/Seoul business date contract를 사용한다.

### Monthly Compliance Close

한 달의 Risk/Action 상태를 snapshot으로 닫는 workflow다. 미해결 high-impact 항목이 있으면 acknowledgment/note contract를 요구한다. Close는 법률적 인증서라고 표현하지 않는다.

---

## 9. Business Case Boundary

`business_cases`는 Advisor 협업의 실제 resource root다.

```text
DRAFT
→ OPEN
→ RESOLVED
→ OPEN (explicit reopen)
→ ARCHIVED (terminal)
```

- organization ownership 고정
- ACTIVE authorized membership만 생성/변경
- append-only event/history
- ShareGrant 발급 시 실제 Case의 organization ownership 재검증
- 공유 가능한 Case 상태를 제한

---

## 10. External Advisor / ShareGrant Boundary

외부 Advisor는 global User identity를 사용하지만 Business tenant Membership을 얻지 않는다.

```text
Business Case
→ Advisor Invitation
→ exact invited User acceptance
→ ShareGrant
→ explicit permissions
→ advisor-safe endpoints
→ revoke / expiry
```

ShareGrant permission 예:

```text
case.read
comment.create
document.read
document.review
```

불변조건:

- cross-tenant grant 차단
- 회사 내부 Member를 외부 Advisor로 중복 공유하지 않음
- 초대받은 exact User만 수락
- expiry/revoke 즉시 다음 요청 차단
- advisor-safe API는 tenant 내부 필드를 과다 반환하지 않음
- 회사 OWNER/HR_ADMIN 권한을 매 관리 요청마다 재검증

`advisor-detail.*`는 오류/만료/철회/loading/mobile 접근성 layer이며 authorization source가 아니다.

---

## 11. Document Architecture

Business Case 문서 workflow:

```text
metadata request
→ binary upload
→ signature/type/size verification
→ encryption
→ VERIFIED + CLEAN
→ review request
→ Advisor authorized download
→ APPROVED or CHANGES_REQUESTED
→ new version
→ re-review
```

### Security

- AES-256-GCM encrypted binary storage
- DB에 document 원본 평문 직접 저장 금지
- server-side size/SHA-256 재계산
- 허용 MIME/signature contract
- PDF 위험 active-content 기본 검사
- VERIFIED + CLEAN 이전 review 금지
- download마다 current grant/permission 재검증
- grant revoke 후 즉시 download 차단
- download/review audit event

`DOCUMENT_STORAGE_SECRET`은 현재 key rotation migration 없이 임의 변경하면 기존 암호화 문서를 복호화하지 못한다.

내장 active-content 검사는 전문 malware scanner와 동일하다고 주장하지 않는다.

---

## 12. Storage Architecture

### Worker / legacy

기존 Worker/공개 서비스는 runtime storage facade를 통해 legacy SQLite와 PostgreSQL migration path를 분리한다.

### SaaS production

Business/Advisor production은 PostgreSQL primary만 허용한다.

```text
STORAGE_DRIVER=postgres
DATABASE_URL=<secret>
REQUIRE_PERSISTENT_DB=1
```

SaaS enabled 상태에서 SQLite fallback으로 조용히 내려가지 않는다.

### Persistence attestation

`PERSISTENT_STORAGE=1`은 코드를 켜는 기능이 아니라 **실제 restart/redeploy 생존을 운영자가 검증했다는 attestation**이다.

Production readiness는 secret/path 자체를 노출하지 않고 준비 여부만 반환한다.

---

## 13. HTTP Security / Error Boundary

공통 middleware:

```text
request ID
HTTP security headers
JSON size bound
rate limit
safe application error boundary
```

주요 header:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Origin-Agent-Cluster`
- `X-Permitted-Cross-Domain-Policies`
- Content-Security-Policy
- secure request HSTS

예상하지 못한 API error는 내부 stack/message를 반환하지 않고 request ID를 제공한다.

health/readiness/404/error response는 cache하지 않는다.

---

## 14. Public Static Boundary

현재 저장소는 server source와 browser asset이 같은 root에 공존하는 legacy 구조다.

따라서 `express.static(rootDir)` 전에 `createPublicStaticGuard()`를 적용한다.

차단 범주:

```text
.env*
server.js
package*.json
render.yaml / Procfile
lib/
db/
scripts/
test/ tests/
docs/
.github/
backup/log/sql/sqlite/db artifacts
```

의도적 public data인 `/data/nomusa.json` 등만 허용한다.

### 장기 구조 개선

궁극적으로 blocklist guard보다 아래가 바람직하다.

```text
public/
  html/js/css/assets/data-public

server.js
lib/
db/
scripts/
tests/
docs/
```

즉 public root allowlist 구조로의 이동은 post-GA technical debt다. 현재 guard는 predeploy security boundary로 유지한다.

---

## 15. SEO / Public Origin

`SITE_URL`을 canonical production origin source로 사용한다.

- home canonical
- Open Graph
- JSON-LD
- article metadata
- robots.txt
- sitemap.xml

build-time localhost나 과거 Render URL이 runtime response에 남지 않도록 server transformation을 사용한다.

---

## 16. User-facing Presentation Layers

서버/도메인 contract를 직접 수정하지 않고 presentation hardening을 후단에 주입한다.

```text
assets/brand/*               shared design system
business-ui-copy.js          enum/copy presentation adapter
business-detail.js/css       Business pending/error/a11y layer
advisor-detail.js/css        Advisor state/a11y layer
case-detail.js/css           Core 5 state/a11y layer
```

원칙:

- API enum을 UI 편의를 위해 서버에서 몰래 변경하지 않음
- domain state machine과 display copy 분리
- 내부 error code를 최종 사용자에게 그대로 노출하지 않음
- desktop/mobile/focus/reduced-motion 확인

---

## 17. Operational Probes

### Liveness

```text
GET /api/health
```

프로세스 생존 확인용. `Cache-Control: no-store`.

### Readiness

```text
GET /api/readiness
```

현재 runtime storage, Core registry, Legal registry, production enforcement 조건을 확인한다.

기존 compatibility alias `/api/cases/readiness`는 운영 도구 호환을 위해 유지할 수 있으나 신규 자동화는 canonical endpoint를 사용한다.

---

## 18. Release / CI Architecture

### Pull Request

```text
npm ci
→ Node regression
→ build / content / release checks
→ PostgreSQL E2E
→ Worker/public Chromium
→ Business Chromium
→ Advisor Collaboration
→ Business Case Document
→ Legal Admin
→ Compliance Close
→ UI Visual Smoke
```

Predeploy detail pass에서는 추가로:

- private static path exposure
- SEO origin
- malformed cookie/session
- Core 5 common detail contract
- Core 5 mobile browser smoke
- Business Login missing/expired state
- Advisor detail error contract

을 gate한다.

### Main / Production

```text
merge approved SHA
→ Render deploy
→ deployed exact SHA 확인
→ /api/health
→ /api/readiness
→ synthetic Worker Core 5
→ Business/Advisor smoke
→ actual email magic-link
→ Advisor invite/accept/revoke
→ cleanup
```

PR branch 자체를 production release 대상으로 사용하지 않는다.

---

## 19. Production Activation Boundary

코드 merge와 SaaS 공개 활성화는 별개다.

Production SaaS 승인 전 필요한 외부 운영 조건:

```text
PostgreSQL provision/migration
→ production secrets
→ Resend sender-domain verification
→ restart/redeploy persistence proof
→ backup/recovery point
→ final main exact-SHA smoke
→ rollback point
→ activation decision
```

이 조건은 `docs/PREDEPLOY_CHECKLIST.md`가 canonical runbook이다.

비용이 발생하는 storage/provider나 `SAAS_ENABLED=1`을 개발 과정에서 임의로 활성화하지 않는다.
