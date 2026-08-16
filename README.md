# 인사야 — 노동문제 해결 플랫폼

**Production:** https://insaya.onrender.com/

인사야는 사용자가 노동문제를 하나의 **Case(사건)** 로 정리하고, 필요한 사실 확인부터 법률 기준·예상 금액·증거·문서·공식 절차·전문가 전달 준비까지 실제 다음 행동으로 이어가게 하는 서비스입니다.

현재 상태는 **인사야 1.0 Code/Product RC**입니다. 핵심 제품 기능과 코드 구조는 완료됐고, GA 전 남은 가장 중요한 조건은 운영 SQLite 데이터의 **durable persistence**입니다.

## Core 5 Cases

아래 5개 사건은 전용 Workspace, 보호 API, 결정론 Legal/Calculator, 문서·공식 절차·Case Report를 갖고 있습니다.

- 임금체불 — `/wage-intake`
- 해고·권고사직 — `/dismissal-intake`
- 퇴직금·퇴직연금 — `/retirement-intake`
- 근로시간·연장/야간/휴일수당 — `/worktime-intake`
- 연차유급휴가·미사용수당 — `/annual-leave-intake`

공통 흐름:

```text
사건 생성
→ 사실 구조화
→ 법률/계산
→ 증거
→ 다음 행동
→ 공식 근거
→ 문서
→ 공식기관
→ Case Report
```

1.0 Core Case는 현재 5개로 동결합니다.

## 기존 주요 기능

Core Case 외 기존 기능도 유지됩니다.

- AI 노무 상담 / 상담 요약
- 기존 계산기
- 문서센터 / 문서팩
- 노동 가이드 / 정적 SEO 페이지
- 노무사 공개 검색
- 상담 요청 / 전문가 전달
- Admin 운영 화면
- 노무사 Partner 대시보드
- SQLite 기반 예약·리드·운영 데이터

이 기능들은 독립 메뉴 개수를 늘리는 방향보다 Case 해결 경험을 보조하는 역할로 발전시킵니다.

## 제품 Source of Truth

| 문서 | 역할 |
|---|---|
| [`docs/PRODUCT_PLAN_1.0.md`](./docs/PRODUCT_PLAN_1.0.md) | 최종 제품 정의·Scope Freeze·1.1 이후 방향 |
| [`docs/STATUS.md`](./docs/STATUS.md) | 실제 구현·CI·운영 상태 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 현재 Production 아키텍처·보안 경계 |
| [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) | Code/Product RC → GA 체크리스트 |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | SQLite backup/restore runbook |
| [`docs/REPO_REFACTOR_PLAN.md`](./docs/REPO_REFACTOR_PLAN.md) | 남은 Content/Legacy migration 계획 |

과거 기획문서는 최신 구현의 직접 TODO source로 사용하지 않습니다. 필요한 내용은 위 문서로 승격한 뒤 archive 대상으로 분류합니다.

## 빠른 시작

```bash
npm install
cp .env.example .env
npm start
```

기본 주소:

```text
http://localhost:3000
```

AI provider key가 없어도 서버와 Core Case의 결정론 기능은 실행됩니다. AI 상담은 provider가 없으면 데모 모드로 동작할 수 있습니다.

## 현재 구조

### Application

```text
server.js
↓
lib/application.js
```

`server.js`는 env load, application 생성, retention scheduler, listen만 담당합니다.

### Server Routers

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

### Server Infrastructure

```text
lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/branded-page.js
```

### Case

| 영역 | 위치 |
|---|---|
| Case domain registry | `lib/case-domain-registry.js` |
| Legal registry | `lib/legal-registry.js` |
| Case API | `lib/case-routes.js` |
| Case 저장/접근 | `lib/case-repo.js`, `lib/case-access.js` |
| Case rules | `lib/*-rules.js`, `lib/wage-money.js`, `lib/legal-rules.js` |
| Case UI | `*-intake.html`, `*-intake-client.js` |
| Shared Case transport | `case-client-core.js` |
| Shared Workspace CSS | `case-workspace-core.css` |

### Legacy / Content

| 영역 | 위치 |
|---|---|
| Legacy home/UI | `index.html` |
| Runtime home adapter | `lib/product-home.js` |
| 첫 canonical Content Source | `content/home-navigation.js` |
| 정적 SEO build | `scripts/build-site.mjs` |

Content Source migration은 대형 rewrite 없이 `TOPICS → ARTICLES → legacy legal/calculator metadata` 순으로 계속합니다.

## 주요 API

### Case

- `POST /api/cases/<case>-intake`
- `GET/PATCH /api/cases/:id/<case>-intake`
- `GET /api/cases/:id/<case>-report`
- `POST /api/cases/:id/<case>-document/:templateKey`
- `DELETE /api/cases/:id`
- `GET /api/cases/readiness`

### Product / Operations

- `POST /api/chat`
- `POST /api/summary`
- `GET /api/docs`, `POST /api/doc`
- `GET /api/docpacks`, `POST /api/docpack`
- `GET /api/nomu`
- `POST /api/lead`, `POST /api/booking`
- `POST /api/privacy/delete`
- `/api/admin/*`
- `/api/partner/*`
- `GET /r/:token`
- `GET /api/health`

## 검증

로컬 기준:

```bash
npm test
npm run build
npm run release:check
```

GitHub PR:

```text
Node regression / build / Release gate
→ actual Chromium desktop/mobile
```

`main`:

```text
PR checks
→ Render auto deploy
→ build-info exact SHA
→ runtime readiness
→ PII 없는 synthetic Core Cases
→ legal / money / document / report 검증
→ synthetic Case 삭제
```

마지막 코드 기능 baseline `2de40069dea23c8d33d28f632aec7676e98ff132`는 GitHub Actions run `31920757600`에서 `check`, `browser-e2e`, `production-smoke` 모두 통과했습니다.

## Backup / Restore

현재 SQLite backup/restore tooling은 준비돼 있습니다.

```bash
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

검증 항목:

- SQLite integrity
- foreign keys
- required tables
- overwrite protection
- 별도 target restore

자세한 절차는 [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)를 참고하세요.

## GA 전 반드시 필요한 것

현재 Render free filesystem은 장기 user-data persistence를 보장하지 않습니다.

따라서 Code/Product RC → GA 전 다음이 필요합니다.

```text
1. durable storage 선택
2. durable DB_PATH 설정
3. REQUIRE_PERSISTENT_DB=1
4. restart 후 데이터 유지 검증
5. redeploy 후 데이터 유지 검증
6. verified backup 생성
7. backup을 host 밖 안전 저장소에 보관
8. restore-check + 실제 복구 rehearsal
9. readiness green
10. Core 5 production smoke green
```

Render Persistent Disk + SQLite를 유지하는 것이 작은 변경 중 하나이며, 외부 DB도 선택할 수 있습니다.

**비용이 발생하는 persistent disk나 외부 유료 서비스를 코드 작업 과정에서 자동 활성화하지 않습니다.**

## 1.0 이후

GA를 막지 않는 후속 작업:

- Legacy `TOPICS` / `ARTICLES` Content Source 이동
- Legacy legal/calculator single-source
- 운영 모니터링
- 접근성/오류 상태 고도화
- account-based My Cases 검토
- 사업주 제품
- 노무사 SaaS/CRM

아래 항목은 1.0 GA 필수범위가 아닙니다.

- 6번째 Core Case
- 사용자 계정
- multi-device Case sync
- 전체 frontend framework rewrite
- 자동 노무사 추천/배정
- 새 수익화 시스템

## 안전 원칙

- 민감정보 최소수집
- 모르는 사실 임의 추정 금지
- 법정 숫자·기한은 결정론 rule 우선
- 공식 source 및 기준일 관리
- Case token은 browser sessionStorage only
- 전문가 전달은 명시적 동의 기반
- 관리자/파트너 session + CSRF 유지
- 구체적 사건은 필요 시 공인노무사·공식기관 절차로 연결

**인사야 1.0의 목표는 더 많은 메뉴가 아니라, 노동문제 하나를 실제 해결 단계까지 가져갈 수 있는 제품입니다.**