# 인사야 1.0 Architecture — FINAL RC

> **기준일:** 2026-08-16
> **목적:** 목표 구조가 아니라 현재 Production에서 실제로 동작하는 구조와 안전 경계를 설명한다.
> **코드 baseline:** `2de40069dea23c8d33d28f632aec7676e98ff132`

---

## 1. 전체 시스템

```text
Browser
│
├─ Legacy Product Home
│   ├─ index.html
│   ├─ lib/product-home.js runtime adapter
│   ├─ content/home-navigation.js
│   └─ wage-intake-launcher.js
│
├─ Dedicated Core Case Workspaces
│   ├─ /wage-intake
│   ├─ /dismissal-intake
│   ├─ /retirement-intake
│   ├─ /worktime-intake
│   └─ /annual-leave-intake
│
├─ Shared Case Frontend
│   ├─ case-client-core.js
│   └─ case-workspace-core.css
│
└─ HTTP
    ↓
server.js (bootstrap only)
    ↓
lib/application.js
    ├─ Case API
    ├─ AI API
    ├─ Document API
    ├─ Expert API
    ├─ Public Operation API
    ├─ Admin API
    ├─ Partner API
    ├─ Secure Summary route
    ├─ static/public pages
    └─ branded 404

SQLite
├─ structured Cases
├─ bookings / leads
├─ experts / partner data
├─ events / feedback / notifications
└─ access / operational records
```

---

## 2. Bootstrap / Application Boundary

### `server.js`

`server.js`는 더 이상 도메인 endpoint를 직접 구현하지 않는다.

책임:

```text
1. lib/env.js load
2. createApplication({ rootDir })
3. retention scheduler start
4. app.listen()
```

이 경계는 테스트로 고정한다.

### `lib/application.js`

Express application 조립의 단일 진입점이다.

책임:

- JSON parser
- trust proxy
- HTTP security middleware
- session security 생성
- rate limiter 생성
- router mounting
- health
- product home
- static files
- branded 404

`server.js`에 새로운 API 구현을 다시 추가하지 않는다.

---

## 3. Server Domain Routers

현재 서버 domain은 다음 파일로 분리돼 있다.

| Domain | Module | 주요 contract |
|---|---|---|
| Core Cases | `lib/case-routes.js` | `/api/cases/*` |
| AI 상담 | `lib/ai-routes.js` | `/api/chat`, `/api/summary` |
| 문서센터 | `lib/document-routes.js` | `/api/docs`, `/api/doc`, `/api/docpacks`, `/api/docpack` |
| 노무사 공개검색 | `lib/expert-routes.js` | `/api/nomu` + seed |
| 공개 운영입력 | `lib/public-operation-routes.js` | lead/booking/event/feedback/privacy delete |
| 운영자 | `lib/admin-routes.js` | `/api/admin/*` |
| 파트너 노무사 | `lib/partner-routes.js` | `/api/partner/*` |
| 보안 상담요약 | `lib/secure-summary-routes.js` | `/r/:token` |

Refactor의 원칙은 URL·request·response contract를 유지하고 내부 책임만 옮기는 것이었다.

---

## 4. Shared Server Infrastructure

### Session Security — `lib/session-security.js`

관리자·파트너의 signed session 기반을 제공한다.

현재 contract:

- HMAC SHA-256 signature
- 12시간 기본 TTL
- timing-safe verification
- expiry check
- `HttpOnly`
- `SameSite=Strict`
- HTTPS에서 `Secure`
- Production `ADMIN_TOKEN` 미설정 시 random token으로 fail-closed

Admin/Partner router가 이 helper를 dependency injection으로 공유한다.

### Rate Limit — `lib/rate-limit.js`

현재 in-memory limiter.

```text
key = IP + request path
```

기존 endpoint별 quota/window를 유지하며 초과 시:

```json
{ "error": "too_many_requests" }
```

과 `Retry-After`를 반환한다.

현재 단일 Render instance 구조에서는 충분한 baseline이지만 다중 instance 확장 시 shared limiter 저장소가 필요할 수 있다.

### HTTP Security — `lib/http-security.js`

기본 응답 보호:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- Referrer Policy
- Permissions Policy
- CSP
- HTTPS HSTS

### Retention — `lib/retention-scheduler.js`

기동 시 + 주기적으로 기존 retention policy를 실행한다.

도메인 보존정책 자체는 repository layer에 있고 scheduler는 실행 lifecycle만 담당한다.

### Branded HTML — `lib/branded-page.js`

보안 요약 링크의 상태 화면과 일반 404가 같은 brand shell을 사용한다.

---

## 5. Case Domain Registry

`lib/case-domain-registry.js`가 Core Case 등록의 canonical layer다.

등록 domain:

```text
wage
dismissal
retirement
worktime
annual_leave
```

각 descriptor는 다음을 연결한다.

- stable domain ID
- label
- UI path
- API route fragment
- service operations

`lib/case-routes.js`는 registry를 순회해 공통 endpoint를 등록한다.

새 Core Case를 추가하려면 registry contract와 service operations를 충족해야 한다. 단, 1.0 scope에서는 5개로 동결한다.

---

## 6. Case Architecture

### 공통 pipeline

```text
Intake UI
↓
Protected Case API
↓
Intake Normalizer
↓
Case Facts / Missing Facts
↓
Deterministic Legal / Money Rules
↓
Action Planner
↓
Resource / Document Planner
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
├─ procedures
└─ report
```

### Case module pattern

일반적인 사건:

```text
<case>-intake.js
<case>-rules.js
<case>-actions.js
<case>-resources.js
<case>-report.js
<case>-service.js
```

임금체불은 초기 구현 역사로 이름이 다르다.

```text
wage-intake-service.js
wage-money.js
legal-rules.js
wage-resources.js
wage-report.js
```

이 차이는 registry/service adapter가 외부 contract에서 흡수한다. 경로 이름을 통일하기 위한 대규모 파일 이동은 1.0 과제가 아니다.

---

## 7. Case API Contract

Base:

```text
/api/cases
```

대표 pattern:

```text
POST   /<case>-intake
GET    /:id/<case>-intake
PATCH  /:id/<case>-intake
GET    /:id/<case>-report
POST   /:id/<case>-document/:templateKey
DELETE /:id
```

추가 공통 endpoint:

```text
GET /api/cases/readiness
```

### Access token

생성 응답은 opaque token을 반환한다.

```json
{
  "case": { "id": "..." },
  "accessToken": "opaque-token"
}
```

후속 요청:

```text
x-case-token: <token>
```

또는:

```text
Authorization: Bearer <token>
```

Case ID만 아는 것으로 조회할 수 없다.

---

## 8. Browser Case Security / Shared Client

### `case-client-core.js`

공통 `CaseAccessClient`가 다음 transport 책임을 가진다.

- session token lookup/store
- protected API request
- `x-case-token`
- status-aware error
- Case PATCH
- delete flow
- document/report 공통 helper

임금체불의 다단계 UI처럼 화면 구조가 다른 경우에도 access transport만 공통 adapter를 사용한다.

### Token storage

브라우저에서는 `sessionStorage`만 사용한다.

하지 않는 것:

- `localStorage`
- URL query/hash에 Case token 노출
- permanent browser token

### Document preview

Case 문서 결과는 plain text로 렌더링한다.

```text
server template
→ JSON text
→ <pre>.textContent
```

사용자 입력값을 executable HTML로 주입하지 않는다.

### Shared Workspace CSS

`case-workspace-core.css`

공통:

- source/resource section
- document cards
- procedure box
- preview overlay
- shared workspace layout elements

법률적 의미가 다른 사건별 UI는 각 전용 CSS/client에 남긴다.

---

## 9. Legal Registry / Deterministic Rules

### `lib/legal-registry.js`

Core 5 Case의 legal source adapter다.

제공:

- domain lookup
- canonical source list
- stable normalization
- registry validation
- authority/article collision detection

같은 법령의 공식 URL 표현이 다를 수 있으므로 URL 문자열 자체의 완전 일치보다 법률 authority/article contract를 우선한다.

### Rule principle

```text
Known facts
↓
Deterministic Rules
↓
{
  assessment,
  amount,
  assumptions,
  sources,
  warnings,
  verifiedAt
}
↓
UI / AI explanation
```

명확한 법정 숫자·기한·산식은 AI가 생성한 문장보다 rule result가 우선한다.

### Date boundaries

Case rule은 필요 시 시행일/사건일 경계를 다룬다.

예: 연차 domain은 법률 변경 경계와 365/366일 employment boundary를 명시적으로 관리한다.

미지원 날짜를 현재 규칙으로 조용히 치환하지 않는 것이 원칙이다.

---

## 10. AI Architecture

AI endpoint는 `lib/ai-routes.js`에 분리돼 있다.

내부 AI 계층:

```text
lib/ai.js
lib/prompt.js
lib/knowledge.js
```

흐름:

```text
키워드 분류 가능
→ AI classifier 생략

키워드 미적중
→ AI semantic classification

Core Case 법률/계산
→ deterministic result 우선

AI
→ 설명·요약·자유 질문 보조
```

AI provider key가 없어도 Core Case와 서버는 동작할 수 있다.

---

## 11. Document Architecture

공통 document template engine:

```text
lib/docs.js
```

공개 문서 API는 `lib/document-routes.js`가 담당한다.

Case 문서 흐름:

```text
Case facts / calculation
↓
<case>-resources.js
↓
prefill values
↓
document template
↓
JSON text/html
↓
Case UI에서는 plain-text preview
```

Legacy 독립 문서센터는 HTML preview 기능을 유지하지만 Core Case security boundary와는 별도다.

---

## 12. Expert / Booking Architecture

### Public Expert

`lib/expert-routes.js`

- 공개 노무사 목록
- region filter
- 최초 seed 책임

### Public Operations

`lib/public-operation-routes.js`

- lead
- booking
- analytics event
- feedback
- privacy deletion

상담 booking은 contact + consent contract를 유지한다.

### Admin

`lib/admin-routes.js`

- login/logout/session
- booking/lead data
- summary/notification/feedback
- booking 상태/배정
- expert visibility
- partner token 발급

Admin은 signed session + CSRF 또는 `x-admin-token` 호환 경로를 유지한다.

### Partner

`lib/partner-routes.js`

- issued token login
- signed partner session
- 본인에게 배정된 booking만 조회
- 허용 상태(`in_progress`, `done`)와 memo만 변경

---

## 13. Secure Expert Summary

`lib/secure-summary-routes.js`

```text
GET /r/:token
```

현재 보안 contract:

- booking token lookup
- 만료 시 410
- 없는 token 404
- `noindex`
- user content HTML escape
- telephone href sanitize
- access log
- IP 원문 대신 SHA-256 기반 truncated hash
- print/PDF action

HTML shell은 `lib/branded-page.js`와 공유한다.

---

## 14. Content Architecture — Migration In Progress

### 현재 Legacy

`index.html`은 여전히 UI·가이드·계산기 metadata·법률 copy 등을 상당량 포함한다.

### 첫 external source

```text
content/home-navigation.js
```

근로자/사업주 사이트 metadata와 category IA의 canonical runtime source다.

`lib/product-home.js`가 `/`와 `/index.html`을 제공할 때:

1. legacy inline navigation block을 external binding으로 교체
2. `content/home-navigation.js`를 head에 주입
3. Case launcher를 body 끝에 주입

물리적 `index.html`에는 migration 중 fallback copy가 남아 있다.

### 다음 migration

```text
TOPICS
→ ARTICLES
→ legacy legal copy
→ calculator metadata
→ SEO builder shared source
```

대형 monolith를 한 번에 수정하지 않고 작은 canonical source 단위로 이동한다.

---

## 15. Persistence

### 현재

- Node built-in `node:sqlite`
- Case repository
- legacy operational repository
- 파일 기반 SQLite

기본 DB와 `DB_PATH` override를 지원한다.

### 현재 운영 한계

Render free filesystem은 장기 영속 storage contract가 아니다.

```text
Application runtime ✅
Exact deployment verification ✅
Structured persistence while instance lives ✅
Long-term restart/redeploy persistence ❌ guaranteed
```

따라서 Code/Product RC와 GA를 구분한다.

---

## 16. Runtime Readiness

`lib/runtime-readiness.js`

endpoint:

```text
GET /api/cases/readiness
```

검증 영역:

- deployed build metadata
- AI status
- Case Registry 5개
- Legal Registry
- SQLite query probe
- journal mode
- foreign keys
- required tables
- persistence config

민감한 실제 DB path는 응답에 노출하지 않는다.

`REQUIRE_PERSISTENT_DB=1` 상태에서 `DB_PATH`가 없으면 ready=false가 된다.

Liveness는 rate-limit 영향이 없는 `/api/health`를 계속 사용한다.

---

## 17. Backup / Restore

`lib/sqlite-backup.js`

도구:

```text
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

Backup verification:

- `PRAGMA integrity_check`
- `PRAGMA foreign_key_check`
- required app tables
- overwrite protection

Restore-check는 운영 DB 위에 덮어쓰지 않고 별도 target DB로 검증한다.

현재 tooling은 준비됐지만 off-host backup 운영과 실제 restore rehearsal은 durable storage 선택 후 GA 단계에서 수행해야 한다.

---

## 18. Retention / Privacy

현재 원칙:

- Case 계산에 불필요한 PII 최소수집
- token expiry
- abandoned Case lifecycle
- user delete
- booking privacy delete
- expert handoff consent
- secure summary expiry/access log

계정형 장기 `My Cases`가 도입되면 개인정보 보존정책을 별도로 확장해야 한다.

---

## 19. Release Architecture

### PR

```text
PR
↓
check
├─ Node regression
├─ build
└─ release gate
↓
actual Chromium
├─ desktop Case journeys
├─ annual leave journey
└─ mobile viewport
```

PR은 production synthetic Case를 만들지 않는다.

### main

```text
main merge
↓
check
↓
Chromium
↓
Render auto deploy
↓
production-smoke
├─ build-info SHA == github.sha
├─ readiness
├─ synthetic Core Cases
├─ legal / money verification
├─ document
├─ report
└─ cleanup DELETE
```

단순 HTTP 200만으로 배포 성공을 판정하지 않는다.

---

## 20. Build Metadata

`npm run build`에서 `scripts/write-build-info.mjs`가 deployment metadata를 생성한다.

Production smoke는 Render가 노출하는 build metadata의 commit이 현재 GitHub `main` SHA와 일치할 때만 핵심 flow 검증을 진행한다.

---

## 21. 현재 기술 부채

### Legacy Content — P1/P2

`index.html`에 남은:

- TOPICS
- ARTICLES
- 법률 설명
- calculator metadata
- 기타 Legacy UI logic

을 external source로 점진 이동해야 한다.

### Legacy Legal Duplication — P1

Core Case는 Legal Registry를 사용하지만 Legacy 계산기/가이드의 법률 숫자/설명 일부는 중복될 수 있다.

### Account-based Case Recovery — 1.1+

현재는 session-only anonymous Case다. 계정/멀티디바이스는 durable persistence 및 개인정보 lifecycle 설계 후 진행한다.

### Distributed Runtime — 미래

현재 in-memory rate limit은 단일 instance baseline이다. 수평 확장 시 shared rate-limit backend를 검토해야 한다.

---

## 22. 구조 변경 원칙

1. endpoint URL과 response contract를 먼저 고정한다.
2. `server.js`에 domain route를 다시 넣지 않는다.
3. registry/adapter를 이용해 기존 구현을 보존한다.
4. Legal source와 법정 수치는 가능한 한 canonical source로 수렴한다.
5. UI 공통화가 Case별 법적 차이를 숨기지 않게 한다.
6. Content Source는 block 단위로 이동한다.
7. 큰 프레임워크 rewrite는 현재 구조의 유지보수 필요성이 실제로 요구할 때 별도 결정한다.
8. `main`은 항상 Render에 배포 가능한 상태를 유지한다.
9. 비용이 발생하는 infrastructure 변경은 code refactor와 분리한다.

**현재 architecture의 다음 필수 변화는 코드 구조가 아니라 durable production persistence다.**