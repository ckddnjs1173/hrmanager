# 인사야 — 노동문제 해결 플랫폼

**Production:** https://insaya.onrender.com/

인사야는 노동문제를 하나의 **Case(사건)** 로 구조화하고, 필요한 사실 확인부터 법률 기준·예상 금액·증거·문서·공식 절차·전문가 전달 준비까지 실제 다음 행동으로 이어주는 서비스입니다.

현재 제품 판정은 **인사야 1.0 Code/Product RC**입니다. Core 5 제품 기능과 코드 구조는 완료됐고, GA 전 남은 핵심 조건은 운영 데이터의 **durable persistence + 실제 복구 rehearsal**입니다.

## Core 5 Cases

- 임금체불 — `/wage-intake`
- 해고·권고사직 — `/dismissal-intake`
- 퇴직금·퇴직연금 — `/retirement-intake`
- 근로시간·연장/야간/휴일수당 — `/worktime-intake`
- 연차유급휴가·미사용수당 — `/annual-leave-intake`

공통 흐름:

```text
사건 생성
→ 사실 구조화
→ 결정론 법률/계산
→ 증거
→ 다음 행동
→ 공식 근거
→ 문서
→ 공식기관 절차
→ Case Report
→ 삭제
```

1.0 Core Case는 위 5개로 동결합니다. 추가 Case, 계정형 My Cases, 대규모 프론트 재작성은 GA blocker가 아닙니다.

## 제품 Source of Truth

| 문서 | 역할 |
|---|---|
| [`docs/PRODUCT_PLAN_1.0.md`](./docs/PRODUCT_PLAN_1.0.md) | 최종 제품 정의·Scope Freeze |
| [`docs/STATUS.md`](./docs/STATUS.md) | 실제 구현·검증 상태 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 현재 코드 구조와 보안 경계 |
| [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) | RC → GA 체크리스트 |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | SQLite backup/restore·영속성 runbook |
| [`docs/REPO_REFACTOR_PLAN.md`](./docs/REPO_REFACTOR_PLAN.md) | GA를 막지 않는 Legacy/Content migration |

## 빠른 시작

```bash
npm install
cp .env.example .env
npm start
```

기본 주소는 `http://localhost:3000`입니다. AI provider key가 없어도 서버와 Core Case의 결정론 기능은 동작하며 AI 상담은 데모 모드로 동작할 수 있습니다.

## 현재 구조

```text
server.js                         bootstrap only
└─ lib/application.js            Express composition
   ├─ /api/readiness             canonical runtime readiness
   ├─ /api/cases/*               Core Case API
   ├─ AI / docs / experts
   ├─ public operations
   ├─ admin / partner
   └─ secure summary

lib/case-domain-registry.js       Core 5 registry
lib/legal-registry.js             Core legal source registry
case-client-core.js               shared protected Case transport
case-workspace-core.css           shared workspace shell
content/home-navigation.js        first externalized Legacy content source
```

주요 router:

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

공통 서버 인프라:

```text
lib/session-security.js
lib/rate-limit.js
lib/http-security.js
lib/retention-scheduler.js
lib/runtime-readiness.js
lib/sqlite-backup.js
```

## 주요 API

### Case

- `POST /api/cases/<case>-intake`
- `GET/PATCH /api/cases/:id/<case>-intake`
- `GET /api/cases/:id/<case>-report`
- `POST /api/cases/:id/<case>-document/:templateKey`
- `DELETE /api/cases/:id`

### Operations

- `GET /api/health` — 가벼운 liveness
- `GET /api/readiness` — **canonical readiness**
- `GET /api/cases/readiness` — 기존 운영 도구용 compatibility alias
- `POST /api/chat`, `POST /api/summary`
- `GET /api/docs`, `POST /api/doc`
- `GET /api/docpacks`, `POST /api/docpack`
- `GET /api/nomu`
- `POST /api/lead`, `POST /api/booking`
- `POST /api/privacy/delete`
- `/api/admin/*`, `/api/partner/*`
- `GET /r/:token`

## Readiness 의미

`/api/readiness`는 일반 서비스 가동 여부와 **민감 Case 데이터를 장기 저장할 준비가 됐는지**를 구분합니다.

무료/ephemeral baseline에서는:

```text
ready = true
readyForSensitiveCaseStorage = false
```

GA durable storage에서는 다음 두 조건이 모두 필요합니다.

```text
1. DB_PATH가 실제 파일 기반 durable mount를 가리킴
2. restart/redeploy survival test 후 PERSISTENT_STORAGE=1 설정
```

그리고 운영 강제 모드에서:

```text
REQUIRE_PERSISTENT_DB=1
```

을 사용합니다. `DB_PATH=:memory:`는 어떤 설정에서도 durable storage로 인정하지 않습니다.

## 검증

로컬:

```bash
npm test
npm run build
npm run release:check
```

PR:

```text
Node regression / build / Release gate
→ actual Chromium desktop/mobile
```

`main`:

```text
PR checks
→ Render auto deploy
→ build-info exact SHA
→ /api/readiness
→ PII 없는 synthetic Core 5 Cases
→ legal / money / document / report 검증
→ synthetic Case 삭제
```

마지막 **배포 검증 완료 main**:

```text
SHA:    65c50f5de89260f8db33cf27f0e64fde0f211325
CI run: 31921056734
check             ✅
browser-e2e       ✅
production-smoke  ✅
```

현재 `fix/1.0-rc-finalization` 브랜치는 readiness/운영 계약을 강화하는 **배포 전 후보**이며, `main`에 병합하기 전까지 Production에는 영향을 주지 않습니다.

## Backup / Restore

```bash
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

백업은 SQLite integrity, foreign keys, required tables를 검증하며 restore-check는 운영 DB 위에 직접 덮어쓰지 않고 별도 target으로 복구 가능성을 확인합니다.

## RC → GA 순서

```text
1. durable storage 선택
2. durable DB_PATH 설정
3. REQUIRE_PERSISTENT_DB=1 설정
4. marker record 생성
5. restart 후 유지 확인
6. redeploy 후 유지 확인
7. PERSISTENT_STORAGE=1 설정
8. /api/readiness에서 readyForSensitiveCaseStorage=true 확인
9. verified backup 생성 및 host 밖 보관
10. restore-check + 실제 restore rehearsal
11. Core 5 production smoke green
```

**비용이 발생하는 persistent disk나 외부 유료 서비스는 코드 작업 과정에서 자동 활성화하지 않습니다.**

## 1.0 이후

GA를 막지 않는 후속 작업:

- Legacy `TOPICS` / `ARTICLES` Content Source 이동
- Legacy legal/calculator single-source
- 운영 모니터링 고도화
- 접근성 audit
- account-based My Cases 검토
- 사업주 제품
- 노무사 SaaS/CRM

## 안전 원칙

- 민감정보 최소수집
- 모르는 사실 임의 추정 금지
- 법정 숫자·기한은 결정론 rule 우선
- 공식 source 및 기준일 관리
- Case token은 browser `sessionStorage` only
- 전문가 전달은 명시적 동의 기반
- 관리자/파트너 signed session + CSRF 유지

**인사야 1.0의 목표는 더 많은 메뉴가 아니라, 노동문제 하나를 실제 해결 단계까지 가져가는 것입니다.**
