# 인사야 Repository Refactor Plan — Current State

> **기준일:** 2026-08-16
> **목적:** 완료된 구조 개선과 남은 migration을 구분한다.
> **원칙:** 디렉터리 모양을 예쁘게 만드는 것이 아니라 변경 위험·법률 중복·운영 위험을 줄인다.

---

## 1. 현재 판단

초기 refactor plan에서 가장 위험했던 부분은 이미 해결됐다.

```text
✅ 테스트/CI 안전망
✅ Core Case 전용 UI
✅ Case frontend 공통 transport/CSS
✅ Case Registry
✅ Legal Registry
✅ Server domain routers
✅ Session / Rate Limit / HTTP Security infra
✅ server.js bootstrap 축소
🟡 Content Source 점진 migration 시작
🔴 Production durable storage는 코드 refactor가 아닌 GA 운영 결정
```

따라서 더 이상 `src/` 디렉터리로 전체 파일을 이동하는 것 자체를 목표로 삼지 않는다.

현재 `lib/` 기반 모듈 구조가 책임을 명확히 분리한다면 경로 변경만을 위한 대규모 migration은 하지 않는다.

---

## 2. Refactor 원칙

1. `main`은 항상 배포 가능한 상태를 유지한다.
2. endpoint와 사용자 contract를 먼저 고정한다.
3. 기능 보존 테스트 없이 대형 파일을 이동하지 않는다.
4. 반복이 실제로 확인된 뒤에 abstraction을 추출한다.
5. Case별 법률 차이를 공통 UI가 숨기지 않게 한다.
6. 법정 숫자·source는 canonical layer로 수렴한다.
7. Content Source는 block 단위로 옮긴다.
8. 전체 framework rewrite는 별도 제품 결정이다.
9. 경로 이동보다 single-source와 운영 안전성을 우선한다.
10. 비용이 발생하는 infrastructure 변경은 refactor PR과 분리한다.

---

## 3. Phase A — Test / Release Safety — ✅ 완료

현재 자동 검증:

```text
PR
├─ Node regression
├─ build
├─ release gate
└─ actual Chromium desktop/mobile

main
├─ PR checks 재실행
├─ Render exact SHA 확인
├─ runtime readiness
├─ synthetic Core Cases
├─ legal/money/document/report 검증
└─ synthetic data cleanup
```

구조 변경은 이 safety net 아래에서만 진행한다.

---

## 4. Phase B — Core Case Frontend — ✅ 완료

Core 5 Case는 Legacy `index.html`과 분리된 전용 Workspace를 가진다.

```text
wage-intake.html
 dismissal-intake.html
retirement-intake.html
worktime-intake.html
annual-leave-intake.html
```

공통 frontend:

```text
case-client-core.js
case-workspace-core.css
```

공통화된 책임:

- protected Case transport
- session token
- HTTP error contract
- document/report/delete helper
- shared workspace resource/document UI

각 사건의 intake와 법률-specific UI는 전용 client에 남긴다.

### 남은 frontend migration

GA 비차단:

- Legacy home inline UI logic 축소
- generic loading/error/expired state 추가 표준화
- 접근성 audit

---

## 5. Phase C — Case / Legal Common Layer — ✅ 완료

### Case Registry

```text
lib/case-domain-registry.js
```

Core 5 Case의 UI/API/service descriptor를 등록한다.

### Legal Registry

```text
lib/legal-registry.js
```

Core 5 Case의 공식 legal source contract를 canonical adapter로 제공한다.

### 남은 legal migration

Core Case 자체가 아니라 **Legacy surface의 중복**이 남았다.

우선순위:

```text
Legacy calculator 법정 숫자
→ Legacy guide 법률 copy
→ AI knowledge/prompt와 canonical result 경계 재점검
→ SEO content source
```

경로를 `src/legal/`로 전부 이동하는 것보다 실제 duplicate source 제거가 목적이다.

---

## 6. Phase D — Content Source — 🟡 진행

### 첫 완료 slice

```text
content/home-navigation.js
```

근로자/사업주 사이트 metadata와 category IA를 외부 canonical runtime source로 분리했다.

`lib/product-home.js`가 runtime home을 제공할 때 Legacy inline block을 external binding으로 교체한다.

### 현재 남은 큰 content block

`index.html` 내부에 대체로 다음 데이터가 남아 있다.

```text
TOPICS
ARTICLES
ART_EXTRA
legal/privacy/terms copy
calculator metadata / display copy
기타 guide catalog
```

### 이동 순서

#### D1 — Guide Catalog

- `TOPICS`
- article key/category metadata
- navigation/search가 동일 source를 사용

#### D2 — Article Content

- `ARTICLES`
- `ART_EXTRA`
- guide FAQ/관련 콘텐츠

목표:

```text
content/guides/*
↓
Legacy UI renderer
+
SEO builder
```

#### D3 — Legal Copy

- UI 법률 설명에서 Core Legal Registry와 중복되는 숫자 식별
- canonical legal metadata reference로 교체
- privacy/terms처럼 법률 규칙 엔진과 성격이 다른 정책문서는 별도 content source 유지

#### D4 — Calculator Metadata

계산 로직이 아니라 UI metadata/설명부터 분리한다.

실제 법정 산식은 검증된 calculator/rule module을 우선한다.

#### D5 — SEO Source Unification

정적 SEO 생성기가 `index.html`을 scraping하는 구조에서 벗어나 같은 canonical content source를 직접 사용하도록 전환한다.

### 하지 않을 것

- `index.html` 전체를 한 PR에서 다시 작성
- Content migration 때문에 1.0 GA를 지연
- 이동하면서 카피·법률 내용을 임의로 동시에 개정

---

## 7. Phase E — Server Domain Split — ✅ 완료

초기 목표였던 `server.js` 집중 문제는 해결됐다.

### 현재 구조

```text
server.js                 bootstrap
lib/application.js        Express composition

lib/case-routes.js
lib/ai-routes.js
lib/document-routes.js
lib/expert-routes.js
lib/public-operation-routes.js
lib/admin-routes.js
lib/partner-routes.js
lib/secure-summary-routes.js

lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/branded-page.js
```

`server.js`는 더 이상 domain endpoint 구현을 소유하지 않는다.

### 앞으로의 규칙

새 endpoint가 필요하면:

```text
해당 domain router
→ application composition에 mount
→ route-level test
→ regression / browser / production gate
```

`server.js`에 직접 route를 다시 추가하지 않는다.

---

## 8. Phase F — Persistence / Operations — 🔴 GA Decision

이 단계는 저장소 refactor보다 실제 production infrastructure 선택이다.

현재:

```text
SQLite repository ✅
Runtime readiness ✅
Online backup ✅
Restore-check ✅
Ephemeral Render filesystem ❌ durable guarantee
```

GA 전:

1. durable storage 선택
2. `DB_PATH` 고정
3. `REQUIRE_PERSISTENT_DB=1`
4. restart persistence test
5. redeploy persistence test
6. verified backup
7. off-host backup
8. restore rehearsal
9. readiness + production smoke

DB engine 교체는 필요조건이 아니다. 현재 규모에서는 persistent disk + SQLite를 유지하는 경로도 가능하다.

---

## 9. 현재 저장소에서 유지할 Source of Truth

```text
README.md                    프로젝트 소개/실행

docs/PRODUCT_PLAN_1.0.md     제품 방향/Scope Freeze
docs/STATUS.md               실제 구현 상태
docs/ARCHITECTURE.md         현재 구조
docs/RELEASE_CHECKLIST.md    RC→GA 체크리스트
docs/OPERATIONS.md           backup/restore runbook
docs/REPO_REFACTOR_PLAN.md   남은 구조 migration
```

과거 기획문서는 구현 작업의 직접 TODO source로 사용하지 않는다.

필요한 내용은 최신 Source of Truth에 승격한 뒤 archive 대상으로 분류한다.

---

## 10. Git / PR 운영 규칙

### main

- Production source of truth
- 직접 실험 금지
- merge 후 exact-SHA production 검증

### PR

한 PR은 하나의 명확한 책임 변화만 가진다.

완료 정의:

```text
코드/문서 변경
+ 관련 regression
+ Release gate
+ 필요 시 Chromium
+ merge 후 production impact 확인
```

### 대형 migration

Content/Legacy 작업은 다음 형태를 권장한다.

```text
1. canonical source 생성
2. adapter를 통해 runtime이 새 source 사용
3. regression green
4. old fallback 제거 가능성 확인
5. 별도 PR에서 old copy 제거
```

이 패턴은 `content/home-navigation.js`에서 이미 사용했다.

---

## 11. 1.0에서 더 하지 않을 구조 작업

아래는 1.0 GA 필수 refactor가 아니다.

- 전체 파일을 `src/`로 강제 이동
- React/Next.js 전체 전환
- 모든 테스트 폴더 재분류
- `lib/docs.js` 분할만을 위한 대규모 변경
- 모든 Legacy UI를 Case UI로 즉시 교체
- DB engine을 이유 없이 PostgreSQL로 교체

실제 변경 비용 대비 유지보수/제품 가치가 명확할 때만 진행한다.

---

## 12. Refactor Completion Matrix

| 영역 | 상태 | 다음 작업 |
|---|---|---|
| CI / Release | ✅ | 유지 |
| Core Case UI | ✅ | 접근성/UX polishing |
| Case transport | ✅ | 유지 |
| Case Registry | ✅ | 1.0 scope freeze |
| Legal Registry | ✅ Core | Legacy duplicate migration |
| Server routes | ✅ | server.js 재집중 방지 |
| Security infra | ✅ | 필요 시 scale 대응 |
| Runtime readiness | ✅ | durable config 후 enforce |
| Backup tooling | ✅ | off-host 운영 연결 |
| Content Source | 🟡 | TOPICS → ARTICLES → legal/calculator |
| Durable persistence | 🔴 | GA 전 실제 선택/검증 |

---

## 13. 최종 우선순위

```text
1. RC 문서 동결
2. durable storage 운영 결정
3. persistence / backup / restore rehearsal
4. 1.0 GA
5. Content Source migration 지속
6. Legacy legal/calculator single-source
7. accessibility / monitoring
8. 1.1+ 제품 확장
```

**현재 저장소에서 가장 큰 구조 문제는 더 이상 `server.js`가 아니다. 남은 핵심 기술 부채는 Legacy content single-source이며, 가장 큰 출시 리스크는 durable persistence다.**