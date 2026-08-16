# 인사야 1.0 구현 현황 — FINAL RC

> **Source of Truth:** 현재 구현·CI·운영 검증 상태
> **기준일:** 2026-08-16
> **Production:** https://insaya.onrender.com/
> **마지막 배포 검증 완료 main:** `65c50f5de89260f8db33cf27f0e64fde0f211325`
> **검증 run:** `31921056734`
> **현재 판정:** Code/Product RC

---

## 1. 현재 결론

인사야 1.0의 제품 코드 범위는 완료됐다.

```text
✅ 임금체불 Case
✅ 해고·권고사직 Case
✅ 퇴직금·퇴직연금 Case
✅ 근로시간·연장/야간/휴일수당 Case
✅ 연차유급휴가·미사용수당 Case

✅ Case Registry
✅ Legal Registry
✅ 공통 Case client / workspace
✅ 서버 domain router 분리
✅ application/bootstrap 분리
✅ session / rate-limit / HTTP security 분리
✅ runtime readiness
✅ SQLite online backup / restore-check
✅ Content Source 점진 분리 시작
```

Core 5는 아래 해결 흐름을 실제 코드로 제공한다.

```text
사건 생성
→ 사실 구조화
→ 적용범위/법률 규칙
→ 금액 또는 핵심 판단
→ 증거
→ 다음 행동
→ 공식 근거
→ 문서
→ 공식기관 절차
→ Case Report
→ 삭제
```

**새 Core Case 추가는 1.0 목표가 아니다.**

GA의 남은 핵심 차단조건은 **durable user-data persistence와 실제 복구 rehearsal**이다.

---

## 2. 검증 상태

### PR

```text
check
├─ npm ci
├─ Node regression
├─ build
└─ release:check

browser-e2e
├─ actual Chromium
├─ Core Case journeys
└─ 390×844 mobile
```

### main

```text
merge
→ check
→ Chromium
→ Render auto deploy
→ build-info exact SHA
→ /api/readiness
→ PII 없는 synthetic Core 5 Cases
→ legal/money/document/report 검증
→ synthetic Case 삭제
```

마지막 배포 검증 완료 기준:

```text
main SHA: 65c50f5de89260f8db33cf27f0e64fde0f211325
CI run:   31921056734

check             ✅ success
browser-e2e       ✅ success
production-smoke  ✅ success
```

현재 `fix/1.0-rc-finalization`은 배포 전 후보 브랜치이며 `main`에 병합되지 않는 한 Production에 영향이 없다.

---

## 3. Core 5 Cases

| Case | UI | 주요 도메인 | 운영 검증 |
|---|---|---|---|
| 임금체불 | `/wage-intake` | `lib/wage-*`, `lib/legal-rules.js` | ✅ |
| 해고·권고사직 | `/dismissal-intake` | `lib/dismissal-*` | ✅ |
| 퇴직금·퇴직연금 | `/retirement-intake` | `lib/retirement-*` | ✅ |
| 근로시간·수당 | `/worktime-intake` | `lib/worktime-*` | ✅ |
| 연차 | `/annual-leave-intake` | `lib/annual-leave-*` | ✅ |

`lib/case-domain-registry.js`가 위 5개 domain의 canonical 등록 계층이며 `lib/case-routes.js`가 registry를 순회해 API를 연결한다.

---

## 4. Case / Legal 공통 기반 — 완료

### Case

- 구조화된 SQLite Case repository
- opaque access token
- token 원문 DB 미저장
- browser `sessionStorage` only
- `x-case-token` / Bearer
- token expiry / revoke
- retention lifecycle
- shared protected transport: `case-client-core.js`
- shared resource/document shell: `case-workspace-core.css`

### Legal

`lib/legal-registry.js`가 Core 5의 공식 source contract를 조회·검증한다.

원칙:

```text
Known facts
→ deterministic rule / calculator
→ assessment / amount / assumptions / sources / warnings
→ UI·AI explanation
```

모르는 사실은 임의 추정하지 않는다.

Legacy 계산기·가이드에 남은 중복 법률 copy는 GA blocker가 아닌 후속 single-source migration이다.

---

## 5. Server 구조 — 완료

```text
server.js
└─ lib/application.js
   ├─ /api/health
   ├─ /api/readiness
   ├─ /api/cases/*
   ├─ AI
   ├─ documents
   ├─ experts
   ├─ public operations
   ├─ admin
   ├─ partner
   └─ secure summary
```

도메인 router:

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

공통 infra:

```text
lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/branded-page.js
```

`server.js`는 env load, application 생성, retention scheduler, listen만 담당한다.

---

## 6. Runtime Readiness — 강화 완료 후보

Canonical endpoint:

```text
GET /api/readiness
```

호환 alias:

```text
GET /api/cases/readiness
```

Readiness는 두 상태를 구분한다.

### 서비스 자체 가동 가능

무료/ephemeral 저장 환경에서도 DB·Case Registry·Legal Registry가 정상이라면:

```text
ready = true
```

### 민감 Case 장기 저장 가능

다음이 모두 충족돼야 한다.

```text
명시적 file DB path
+ in-memory DB 아님
+ restart/redeploy survival test 완료
+ PERSISTENT_STORAGE=1
```

그때만:

```text
readyForSensitiveCaseStorage = true
```

`REQUIRE_PERSISTENT_DB=1` 환경에서는 위 조건이 충족되지 않으면 readiness가 fail-closed한다.

`DB_PATH=:memory:`는 어떤 플래그 조합에서도 durable storage로 인정하지 않는다.

Readiness 응답은 실제 DB filesystem path나 secret을 노출하지 않는다.

---

## 7. Backup / Restore — 코드 준비 완료

```bash
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

검증:

- `PRAGMA integrity_check`
- `PRAGMA foreign_key_check`
- required application tables
- overwrite protection
- separate-target restore verification

실제 Production restore rehearsal은 durable storage 선택 후 수행해야 한다.

---

## 8. Content Source — 진행 중, GA 비차단

첫 external source:

```text
content/home-navigation.js
```

`lib/product-home.js`가 `/`와 `/index.html`을 제공할 때 legacy inline navigation copy를 external source binding으로 치환한다.

남은 migration:

```text
TOPICS
→ ARTICLES
→ legacy legal copy
→ calculator metadata
→ SEO/UI shared source
```

대형 `index.html` rewrite는 1.0 GA 조건이 아니다.

---

## 9. 기존 제품 기능

| 영역 | 상태 |
|---|---|
| AI 노무 상담 / 요약 | 🟢 유지 |
| Legacy 계산기 | 🟢 유지, single-source 후속 |
| 문서센터 / 문서팩 | 🟢 유지 |
| 가이드 / SEO | 🟢 유지 |
| 노무사 공개 검색 | 🟢 유지 |
| booking / lead | 🟢 유지 |
| secure summary | 🟢 router 분리 완료 |
| Admin | 🟢 router 분리 완료 |
| Partner | 🟢 router 분리 완료 |

---

## 10. GA Blocker — Durable Storage

현재 Render free filesystem은 장기 사용자 데이터 저장소로 간주하지 않는다.

RC → GA 순서:

```text
[ ] durable storage 선택
[ ] durable DB_PATH 설정
[ ] REQUIRE_PERSISTENT_DB=1
[ ] marker record 생성
[ ] restart 후 marker 유지
[ ] redeploy 후 marker 유지
[ ] PERSISTENT_STORAGE=1
[ ] /api/readiness → readyForSensitiveCaseStorage=true
[ ] db:backup 성공
[ ] backup을 host 밖 안전 저장소로 이동
[ ] db:restore-check 성공
[ ] 실제 restore rehearsal
[ ] Core 5 production smoke green
```

Render Persistent Disk + SQLite는 현재 구조에서 변경 폭이 작은 선택지지만 비용이 발생할 수 있다. 외부 DB도 별도 선택지다.

**유료 인프라는 자동 활성화하지 않는다.**

---

## 11. 1.0 이후

GA 비차단 후속:

- Legacy Content Source 완전 이동
- legacy legal/calculator single-source
- 장기 error/uptime monitoring
- accessibility audit
- account-based My Cases
- multi-device recovery
- 추가 Core Case
- employer SaaS
- labor-consultant SaaS/CRM
- frontend framework 재평가

---

## 12. 최종 판정

```text
Product scope        ✅
Core 5 implementation✅
Deterministic Legal  ✅
Architecture         ✅
Security baseline    ✅
PR/Browser CI        ✅
Exact-SHA prod smoke ✅
Backup tooling       ✅
Durable persistence  ❌ 운영 결정 필요
Restore rehearsal    ❌ durable storage 이후

=> Insaya 1.0 Code/Product RC
```

**개발 측 남은 작업은 RC 안전장치를 merge 가능한 상태로 닫는 것이고, GA의 다음 실제 단계는 기능 추가가 아니라 storage 운영 결정이다.**
