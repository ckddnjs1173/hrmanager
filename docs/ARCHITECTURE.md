# 인사야 1.0 Architecture — FINAL RC

> **기준일:** 2026-08-16
> **마지막 배포 검증 main:** `65c50f5de89260f8db33cf27f0e64fde0f211325`
> **목적:** 목표 구조가 아니라 현재 1.0 RC 코드의 실제 책임과 안전 경계를 기록한다.

---

## 1. 전체 구조

```text
Browser
├─ Legacy Product Home
│  ├─ index.html
│  ├─ lib/product-home.js
│  └─ content/home-navigation.js
├─ Core Case Workspaces
│  ├─ /wage-intake
│  ├─ /dismissal-intake
│  ├─ /retirement-intake
│  ├─ /worktime-intake
│  └─ /annual-leave-intake
└─ Shared Case Frontend
   ├─ case-client-core.js
   └─ case-workspace-core.css

HTTP
↓
server.js
↓
lib/application.js
├─ liveness / readiness
├─ Core Case API
├─ AI / documents / experts
├─ public operations
├─ admin / partner
├─ secure summary
└─ static / branded 404

SQLite
├─ Cases
├─ bookings / leads
├─ expert / partner data
├─ events / feedback / notifications
└─ access / operational records
```

---

## 2. Bootstrap Boundary

### `server.js`

책임은 네 가지뿐이다.

```text
env load
→ createApplication()
→ retention scheduler start
→ app.listen()
```

도메인 route나 security primitive를 다시 `server.js`에 넣지 않는다.

### `lib/application.js`

Express composition의 단일 진입점이다.

- JSON parser
- trust proxy
- HTTP security middleware
- signed session security
- rate limiter
- operational probes
- domain router mounting
- product home/static
- branded 404

---

## 3. Operational Probe Boundary

### Liveness

```text
GET /api/health
```

가벼운 프로세스 생존 확인용이다. Render health check는 이 endpoint를 사용한다.

### Canonical Readiness

```text
GET /api/readiness
```

rate-limit 바깥에서 다음을 검증한다.

- build commit / branch
- SQLite query
- foreign keys
- required tables
- Core 5 Case Registry
- Legal Registry
- persistence enforcement state

### Compatibility Alias

```text
GET /api/cases/readiness
```

기존 운영 도구를 깨지 않기 위해 유지한다. 신규 운영 자동화는 `/api/readiness`를 사용한다.

### 두 readiness 의미

```text
ready
= 현재 애플리케이션이 요청을 정상 처리할 수 있는가

readyForSensitiveCaseStorage
= 민감한 사용자 Case를 장기 저장할 durable storage가 실제 검증됐는가
```

무료 Render baseline에서는 `ready=true`여도 `readyForSensitiveCaseStorage=false`가 정상이다.

---

## 4. Persistence Safety Contract

DB는 `lib/db.js`가 연다.

```text
DB_PATH 미설정 → data/app.db
DB_PATH 설정   → 해당 파일
```

readiness에는 실제 파일 경로를 노출하지 않고 다음 non-secret metadata만 전달한다.

```text
explicitPathConfigured
inMemory
```

민감 Case 장기 저장 준비 완료 조건:

```text
명시적 DB_PATH
AND in-memory가 아님
AND PERSISTENT_STORAGE=1
```

`PERSISTENT_STORAGE=1`은 단순 설정값이 아니라 **restart/redeploy survival test가 끝났다는 운영자 attestation**이다.

운영에서 `REQUIRE_PERSISTENT_DB=1`이면 위 조건이 충족되지 않을 때 readiness는 fail-closed한다.

`DB_PATH=:memory:` 또는 `file::memory:*` 계열은 durable storage로 인정하지 않는다.

---

## 5. Core Case Registry

`lib/case-domain-registry.js`가 등록의 canonical layer다.

```text
wage
dismissal
retirement
worktime
annual_leave
```

각 descriptor는:

- stable domain ID
- label
- UI path
- intake/report/document route fragments
- service operations

를 연결한다.

`lib/case-routes.js`는 registry를 순회해 공통 endpoint를 등록한다.

---

## 6. Core Case Pipeline

```text
Intake UI
↓
Protected Case API
↓
Fact Normalizer / Missing Facts
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

일반 module pattern:

```text
<case>-intake.js
<case>-rules.js
<case>-actions.js
<case>-resources.js
<case>-report.js
<case>-service.js
```

임금체불은 초기 역사상 일부 이름이 다르지만 registry/service adapter가 외부 contract를 흡수한다.

---

## 7. Case API / Access

대표 pattern:

```text
POST   /api/cases/<case>-intake
GET    /api/cases/:id/<case>-intake
PATCH  /api/cases/:id/<case>-intake
GET    /api/cases/:id/<case>-report
POST   /api/cases/:id/<case>-document/:templateKey
DELETE /api/cases/:id
```

Case 생성 시 opaque access token을 발급한다.

후속 요청은:

```text
x-case-token: <token>
```

또는 Bearer token을 사용한다.

보안 원칙:

- token 원문 DB 미저장
- Case ID만으로 조회 금지
- browser `sessionStorage` only
- expiry / revoke / retention
- 문서 preview는 `<pre>.textContent`

---

## 8. Legal Architecture

`lib/legal-registry.js`는 Core 5의 공식 source adapter다.

```text
Known facts
↓
Deterministic rule/calculator
↓
assessment / amount / assumptions / sources / warnings / verifiedAt
↓
UI / AI explanation
```

명확한 법정 숫자·기한·산식은 AI 생성문보다 deterministic result가 우선한다.

모르는 사실은 임의 추정하지 않고 unknown/missing으로 남긴다.

Legacy 계산기·가이드의 duplicate legal copy는 후속 Content/Legal single-source migration 대상이다.

---

## 9. Server Domain Routers

```text
lib/case-routes.js
lib/ai-routes.js
lib/document-routes.js
lib/expert-routes.js
lib/public-operation-routes.js
lib/admin-routes.js
lib/partner-routes.js
lib/secure-summary-routes.js
```

공통 infrastructure:

```text
lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/branded-page.js
```

기존 URL·request·response contract를 보존하면서 내부 책임을 분리한다.

---

## 10. Admin / Partner / Secure Summary

### Admin

- signed session + CSRF
- `x-admin-token` compatibility
- booking/lead 운영
- summary/notification/feedback
- expert visibility / partner token 발급

### Partner

- issued token login
- signed partner session
- 본인 배정 booking만 조회
- 제한된 상태/memo 변경

### Secure Summary

```text
GET /r/:token
```

- expiry
- 404/410 상태
- `noindex`
- HTML escape
- telephone sanitize
- access log
- IP 원문 대신 hash

---

## 11. Content Architecture

현재 `index.html`은 여전히 큰 Legacy monolith다.

첫 external canonical source:

```text
content/home-navigation.js
```

`lib/product-home.js`가 `/`와 `/index.html`을 제공할 때 외부 source를 사용한다.

후속 migration:

```text
TOPICS
→ ARTICLES
→ legacy legal copy
→ calculator metadata
→ SEO/UI shared source
```

이 migration은 유지보수/정확도 개선이며 1.0 GA blocker가 아니다.

---

## 12. Backup / Restore Architecture

`lib/sqlite-backup.js`는 Node `node:sqlite` online backup API를 사용한다.

```text
source DB
→ online backup
→ integrity_check
→ foreign_key_check
→ required table check
→ verified backup
```

Restore check:

```text
backup
→ 별도 target DB
→ integrity/foreign-key/table 검증
```

운영 DB에 자동 덮어쓰지 않는다.

---

## 13. Release Architecture

### PR

```text
npm ci
→ Node regression / build / release:check
→ actual Chromium desktop/mobile
```

PR은 Production을 검증하지 않는다.

### main

```text
merge
→ check
→ Chromium
→ Render auto deploy
→ exact deployed SHA
→ /api/readiness
→ synthetic Core 5 Cases
→ legal/money/document/report
→ cleanup
```

마지막 배포 검증 기준:

```text
SHA:    65c50f5de89260f8db33cf27f0e64fde0f211325
CI run: 31921056734
```

---

## 14. 1.0 RC 남은 경계

개발 구조상 남은 큰 불확실성은 없다.

GA에 필요한 외부 운영 단계:

```text
durable storage 선택
→ DB_PATH
→ REQUIRE_PERSISTENT_DB=1
→ restart/redeploy survival test
→ PERSISTENT_STORAGE=1
→ readyForSensitiveCaseStorage=true
→ off-host backup
→ restore rehearsal
→ final Core 5 smoke
```

아래는 GA를 막지 않는다.

- Legacy Content 완전 분리
- account-based My Cases
- 6번째 Case
- frontend framework rewrite
- employer/consultant SaaS

**비용이 발생하는 storage나 외부 유료 서비스는 명시적 운영 결정 없이 활성화하지 않는다.**
