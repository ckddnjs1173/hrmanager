# 인사야 1.0 구현 현황 — FINAL RC

> **Source of Truth:** 현재 구현·CI·운영 검증 상태를 기록한다.
> **기준일:** 2026-08-16
> **Production:** https://insaya.onrender.com/
> **마지막 코드 기능 기준 main:** `2de40069dea23c8d33d28f632aec7676e98ff132`
> **상태:** Code/Product RC — GA 전 운영 데이터 영속성 결정 필요

---

## 1. 현재 결론

인사야 1.0의 제품 코드 기준 핵심 범위는 완료됐다.

```text
✅ 임금체불 Case
✅ 해고·권고사직 Case
✅ 퇴직금·퇴직연금 Case
✅ 근로시간·연장/야간/휴일수당 Case
✅ 연차유급휴가·미사용수당 Case

✅ Case Registry
✅ Legal Registry
✅ 공통 Case client transport / workspace CSS
✅ 서버 도메인 router 분리
✅ server bootstrap 분리
✅ runtime readiness
✅ SQLite online backup / restore-check
✅ Content Source 점진 분리 시작
```

Core 5 Case는 단순 계산기나 설명 페이지가 아니라 아래 흐름을 실제 운영 환경에서 제공한다.

```text
사건 생성
→ 사실 구조화
→ 적용범위/법률 규칙
→ 금액 또는 핵심 판단
→ 증거 상태
→ 다음 행동
→ 공식 근거
→ 문서
→ 공식기관 절차
→ Case Report
→ 삭제
```

현재 단계에서 **새 Core Case를 더 추가하는 것은 1.0 목표가 아니다.**

1.0 GA의 유일한 큰 운영 차단조건은 **SQLite 사용자 데이터의 영속 저장**이다.

---

## 2. 검증 상태

### PR 검증

모든 구조·기능 PR은 다음 체인을 통과한 뒤 병합한다.

```text
check
├─ npm ci
├─ Node 회귀 테스트
├─ build
└─ release:check

browser-e2e
├─ 실제 Chromium
├─ Core Case 사용자 여정
└─ 390×844 모바일 확인
```

### main 검증

`main` push 후에는 Render가 실제 해당 SHA를 배포했는지 검증한다.

```text
main merge
→ check
→ Chromium
→ Render auto deploy
→ build-info exact SHA 확인
→ /api/cases/readiness
→ PII 없는 synthetic Cases
→ 법률/금액/문서/Report 검증
→ synthetic Cases 삭제
```

### 최신 코드 baseline

`2de40069dea23c8d33d28f632aec7676e98ff132` 기준 GitHub Actions run `31920757600`:

- `check` ✅
- `browser-e2e` ✅
- `production-smoke` ✅

운영 스모크는 실제 사용자 개인정보를 사용하지 않는다.

---

## 3. Core 5 Cases

| Case | 진입 경로 | 서버 도메인 | 운영 검증 |
|---|---|---|---|
| 임금체불 | `/wage-intake` | `lib/wage-*`, `lib/legal-rules.js` | ✅ |
| 해고·권고사직 | `/dismissal-intake` | `lib/dismissal-*` | ✅ |
| 퇴직금·퇴직연금 | `/retirement-intake` | `lib/retirement-*` | ✅ |
| 근로시간·수당 | `/worktime-intake` | `lib/worktime-*` | ✅ |
| 연차 | `/annual-leave-intake` | `lib/annual-leave-*` | ✅ |

Case API는 `lib/case-domain-registry.js`의 descriptor를 기준으로 `lib/case-routes.js`가 연결한다.

---

## 4. Case 공통 기반 — ✅

### Case Registry

`lib/case-domain-registry.js`

등록된 Core domain:

```text
wage
dismissal
retirement
worktime
annual_leave
```

각 descriptor는 UI 경로, route fragment, label, service operation을 연결한다.

### 저장 모델

SQLite의 Case repository에 구조화된 사건 상태를 저장한다.

주요 정보:

- case type / status
- facts / missing facts
- issues / assessments
- evidence
- calculations
- legal sources
- actions
- documents
- metadata

대화 로그가 없어도 현재 사건 상태를 이해할 수 있는 구조를 유지한다.

### 접근 보호

- 생성 시 opaque access token 발급
- token 원문 DB 미저장
- browser `sessionStorage`에만 저장
- `x-case-token` 또는 Bearer 검증
- token expiry
- 삭제/revoke
- 방치 사건 retention lifecycle

### Frontend 공통화

`case-client-core.js`가 보호 transport의 공통 책임을 가진다.

- Case access token
- protected fetch
- HTTP status-aware errors
- PATCH
- document preview
- Report
- 삭제/복원 UX 공통 기반

Case 화면 자체의 법적 차이는 각 전용 client에 남긴다.

공통 resource/document shell 스타일은 `case-workspace-core.css`를 사용한다.

---

## 5. Legal / Calculator 공통 기반 — ✅ Core Cases

### Legal Registry

`lib/legal-registry.js`

Core 5 Case의 공식 법률 source contract를 한 registry에서 조회·검증한다.

현재 보장:

- domain별 canonical source 조회
- stable source normalization
- authority/article 충돌 검증
- Case rule module의 legal context 재사용
- 공식 법률 source contract 테스트

### 결정론 원칙

법정 계산·기한·명확한 적용규칙은 AI가 확정하지 않는다.

```text
Facts
→ deterministic rule/calculator
→ legal result
→ UI/AI explanation
```

모르는 사실은 임의 추정하지 않고 missing/unknown 상태로 남긴다.

### 남은 Legacy 중복

Core Case는 registry 기반이지만 기존 `index.html`의 계산기·가이드·법률 copy에는 동일 숫자/설명이 남아 있을 수 있다.

이는 **GA blocker가 아닌 P1/P2 single-source migration**으로 관리한다.

---

## 6. Server 구조 — ✅ 분리 완료

`server.js`는 현재 bootstrap만 담당한다.

```text
server.js
├─ env load
├─ createApplication()
├─ retention scheduler start
└─ listen
```

실제 Express 조립은 `lib/application.js`가 담당한다.

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

공통 infrastructure:

```text
lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/branded-page.js
```

Endpoint URL과 기존 response contract는 유지하면서 내부 책임만 분리했다.

---

## 7. 기존 제품 기능

| 영역 | 상태 | 현재 역할 |
|---|---|---|
| AI 노무 상담 | 🟢 유지 | 자유 질문·사건 이해/설명 보조 |
| 상담 요약 | 🟢 유지 | 구조화 요약 |
| 계산기 | 🟡 Legacy + Case engine 공존 | SEO/독립 도구, 향후 single source 수렴 |
| 문서센터/문서팩 | 🟢 유지 | 독립 문서 + Case prefill 엔진 |
| 노동 가이드/SEO | 🟢 유지 | 검색 유입·교육 콘텐츠 |
| 노무사 검색 | 🟢 유지 | 공개 지역/분야 정보 |
| 상담 요청 | 🟢 유지 | 동의 기반 booking |
| 보안 요약 링크 | 🟢 분리 완료 | 만료·escape·access log |
| Admin | 🟢 router 분리 | 운영 데이터 관리 |
| Partner | 🟢 router 분리 | 배정 상담 조회/상태 관리 |

---

## 8. Content Source — 🟡 시작

Legacy `index.html`은 여전히 큰 단일 파일이지만, 대형 rewrite 없이 source를 밖으로 옮기는 migration을 시작했다.

첫 canonical source:

```text
content/home-navigation.js
```

현재 `/`와 `/index.html` 런타임은 product-home adapter를 통해 근로자/사업주 IA 데이터를 이 external source에서 사용한다.

물리적인 `index.html`에는 migration 중 fallback 사본이 남아 있다.

다음 이동 순서:

1. `TOPICS` / guide catalog
2. `ARTICLES` / article content
3. legacy legal copy
4. calculator metadata
5. SEO builder와 UI source 통일

이 작업은 유지보수·정확도 single-source를 위한 P1/P2이며 1.0 GA의 직접 차단조건은 아니다.

---

## 9. 운영 Readiness / Backup — ✅ 코드 준비

### Runtime readiness

`GET /api/cases/readiness`

노출 내용:

- build commit / branch
- AI runtime 상태
- Core Case registry count
- Legal registry validation
- SQLite probe
- foreign keys / journal mode
- 필수 table 상태
- persistence readiness

DB 경로 같은 secret/운영 경로는 응답에 직접 노출하지 않는다.

`REQUIRE_PERSISTENT_DB=1`인데 `DB_PATH`가 없으면 fail-closed할 수 있다.

### Backup

```text
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

검증:

- integrity_check
- foreign_key_check
- 필수 table
- 기존 파일 overwrite 보호
- 운영 DB에 직접 restore하지 않고 별도 target 검증

---

## 10. 남은 GA Blocker — 🔴 Durable Storage

현재 Render free filesystem은 재시작/재배포 후 SQLite 파일의 장기 보존을 운영 전제로 사용할 수 없다.

따라서 현재 상태는 다음과 같다.

```text
코드/제품 RC ✅
운영 기능 검증 ✅
백업/복구 tooling ✅
장기 사용자 데이터 영속 보장 ❌
```

GA 전에 해야 할 작업:

```text
[ ] 영속 저장소 선택
[ ] durable DB_PATH 설정
[ ] REQUIRE_PERSISTENT_DB=1
[ ] marker row가 restart 후 유지
[ ] marker row가 redeploy 후 유지
[ ] db:backup 성공
[ ] backup을 서비스 호스트 밖에 보관
[ ] db:restore-check 성공
[ ] 실제 restore rehearsal
[ ] readiness green
[ ] Core 5 production smoke green
```

Render Persistent Disk + 현재 SQLite 구조가 가장 작은 변경 중 하나지만 비용이 발생할 수 있다. 외부 DB도 별도 선택지다.

**유료 인프라는 자동 활성화하지 않는다.**

---

## 11. Refactor Phase 최종 현황

| Phase | 상태 | 판단 |
|---|---|---|
| A. 테스트/CI 안전망 | 🟢 완료 | Release gate + Chromium + exact-SHA production smoke |
| B. Core Case frontend 분리 | 🟢 완료 | 전용 UI + shared transport/CSS |
| C. Case / Legal common layer | 🟢 완료 | Case registry + Legal registry |
| D. Content Source | 🟡 시작 | home navigation externalized, legacy content migration 지속 |
| E. Server domain 분리 | 🟢 완료 | routers + infra + bootstrap 구조 |
| F. 운영 영속성 | 🔴 외부 결정 필요 | durable storage가 GA blocker |

---

## 12. 운영/제품상 남은 리스크

### 1. 영속 DB — 🔴

실제 장기 사용자 데이터 보존을 위해 반드시 해결해야 한다.

### 2. Legacy content single-source — 🟡

가이드·계산기·법률 설명 일부가 아직 `index.html`에 존재한다. Core Case Legal Engine과 충돌하지 않도록 순차 이동한다.

### 3. 계정 없는 Case 복구 범위 — 🟡 의도된 1.0 제약

현재 access token은 browser sessionStorage에만 존재한다. 여러 기기·장기 로그인 기반 `내 사건`은 제공하지 않는다.

계정형 My Cases는 durable storage와 개인정보 설계를 완료한 뒤 1.1+에서 검토한다.

### 4. 운영 모니터링 — 🟡

CI/production smoke/readiness는 구축됐으나 장기 운영용 에러·가용성 알림은 영속 인프라 결정 후 추가할 수 있다.

---

## 13. 1.0 출시 기준

| 기준 | 상태 |
|---|---|
| Core 5 Case end-to-end | ✅ |
| 결정론 Legal/Calculator | ✅ |
| 공식 근거 | ✅ Core Cases |
| 증거/문서/공식 절차 | ✅ |
| Case Report | ✅ |
| 보호 access token | ✅ |
| expiry / delete / retention | ✅ |
| shared Case frontend | ✅ |
| Case registry | ✅ |
| Legal registry | ✅ |
| 실제 Chromium desktop/mobile | ✅ |
| exact-SHA Render production smoke | ✅ |
| runtime readiness | ✅ |
| backup tooling | ✅ |
| restore-check tooling | ✅ |
| Server domain/bootstrap 분리 | ✅ |
| Content Source 분리 | 🟡 진행, GA 비차단 |
| 영속 DB | ❌ GA blocker |
| off-host backup + 실제 복구 rehearsal | ❌ durable storage 결정 후 |

---

## 14. 다음 실행 순서

```text
현재: 1.0 Code/Product RC

→ durable storage 선택
→ DB_PATH / REQUIRE_PERSISTENT_DB 설정
→ restart/redeploy persistence 검증
→ verified backup을 off-host 보관
→ restore rehearsal
→ readiness + Core 5 exact-SHA smoke
→ 1.0 GA

GA 이후:
→ legacy content/legal/calculator single-source 지속
→ 운영 모니터링/접근성
→ account-based My Cases 검토
→ 사업주 제품
→ 노무사 SaaS/수익화
```

**현재 개발 판단: Core 제품을 더 넓히기보다, durable storage 결정을 통해 RC를 GA로 전환하는 것이 가장 높은 우선순위다.**