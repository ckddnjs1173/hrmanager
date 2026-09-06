# Business/Advisor Production Readiness Audit — 2026-09-07

> 범위: 읽기 전용 대조 감사. 코드 수정, DB/시크릿/환경변수 변경, migration/cutover 스크립트 실행 없음.
> 기준 SHA: `66ab39a0a32d0bd237143655e50944e69b2feacd`(main, PR #104 머지 직후)
> 대조한 소스: `docs/STATUS.md`, `docs/PREDEPLOY_CHECKLIST.md`, `docs/08_POSTGRES_CUTOVER_RUNBOOK.md`, `docs/04_DATA_ARCHITECTURE.md`, `render.yaml`, `.github/workflows/*.yml`, `lib/production-deployment-contract.js`, `lib/saas-runtime-config.js`, `lib/runtime-readiness.js`, `lib/saas-email-delivery.js`, `db/postgres/*.sql`(21개), `scripts/postgres-*.mjs`, `scripts/db-*.mjs`, `scripts/export-sqlite-portable.mjs`, `scripts/external-advisor-email-invitation-e2e.mjs`, `scripts/advisor-collaboration-browser-e2e.mjs`.
> **선행 확인**: `git fetch` + `git log origin/main` 결과 PR #103(status-pill)·#104(문서 갱신)가 이미 main에 머지되어 있음을 확인. 이 감사는 그 이후 상태를 대상으로 하며, 해당 두 작업을 재작업하지 않았다. `gh pr list`는 이 세션에 `gh` 인증이 없어 실행하지 못했다(아래 E-2 참고, git log로 대체 확인).

---

## 분류 기준

- **(a) 지금 당장 막는 것**: 코드가 이미 존재하고, 현재 설정값 기준으로 실제로 요청/부팅을 fail-closed 시키는 것.
- **(b) 구현은 됐지만 검증만 안 된 것**: 코드·테스트(CI 포함)는 존재하지만, 실제 production 대상 실행/발송/전환은 아직 한 번도 안 한 것.
- **(c) 코드 자체가 없는 것**: 문서/정책은 있지만 그걸 수행하는 코드가 저장소 어디에도 없는 것.
- **(d) 문서만 오래된 것**: 코드는 바뀌었는데 문서(또는 문서 안 다른 절)가 그걸 못 따라간 것.
- **(e) Production에서 직접 확인해야만 아는 것**: 저장소 코드/문서만으로는 원천적으로 알 수 없는 것(Render 실제 설정, 실제 발송 이력 등).

---

## A. (a) 지금 당장 막는 것 — 코드가 이미 fail-closed 중

1. **`render.yaml` 현재 baseline**: `SAAS_ENABLED=0`, `STORAGE_DRIVER=sqlite`(`render.yaml:39-56`). 이 값 그대로면 `/api/saas/*` 전체가 `saas-routes.js:110`의 `if (!config.enabled) return res.status(404)`로 즉시 404.
2. **`lib/saas-runtime-config.js:15-16`**: `SAAS_ENABLED=1`인데 `storage.primary!=='postgres'`면 `getSaasRuntimeConfig()`가 `throw new Error("saas_requires_postgres_runtime")`. 이 함수는 `saas-routes.js`, `saas-email-routes.js`, `saas-risk-routes.js`, `saas-compliance-close-routes.js`, `saas-advisor-collaboration-routes.js`, `lib/notification-scheduler.js` 6곳에서 **매 요청마다** `try/catch`로 호출되고, catch 시 `503`을 반환한다(`saas-routes.js:106-113` 확인). 즉 "SaaS는 켰는데 DB는 아직 postgres로 안 바꿨다"는 상태는 서버 부팅은 되지만 SaaS API 전체가 즉시 503으로 막힌다 — 코드로 직접 확인.
3. **`lib/production-deployment-contract.js:31-41`**: `NODE_ENV=production` && `SAAS_ENABLED=1`일 때, `STORAGE_DRIVER!=postgres`/`DATABASE_URL` 없음/`REQUIRE_PERSISTENT_DB·PERSISTENT_STORAGE` 미충족/세션·문서 시크릿 32자 미만/`SITE_URL`이 HTTPS 아님/`SAAS_EMAIL_PROVIDER!=resend`/`RESEND_API_KEY` 없음/`SAAS_EMAIL_FROM` 형식 오류 — 이 중 하나라도 걸리면 `ok:false`이고 이 값은 `/api/readiness`에 그대로 노출된다(`lib/runtime-readiness.js:106-116,145`). `render.yaml`을 보면 `SITE_URL`, `SAAS_EMAIL_PROVIDER`, `RESEND_API_KEY`, `SAAS_EMAIL_FROM`이 전부 `sync:false`(수동 설정, 현재 값 없음)로 되어 있어, **오늘 그냥 `SAAS_ENABLED=1`만 올리면 이 게이트가 최소 4개 항목에서 즉시 실패한다.**
4. **`saas_auth_token_echo_forbidden_in_production`**: `SAAS_AUTH_TOKEN_ECHO=1`이 `NODE_ENV=production`에서 켜지면 `saas-runtime-config.js:21-22`가 즉시 throw(요청마다 503). `render.yaml`은 기본 `"0"`.

→ 결론: **"실수로 SaaS가 절반만 켜져서 위험한 상태로 노출되는" 실패 모드는 코드 수준에서 이미 촘촘히 막혀 있다.** 이번 감사에서 새로 발견한 위험한 P0 코드 결함은 없었다.

---

## B. (b) 구현은 됐지만 검증만 안 된 것

1. **Resend 이메일 발송** (`lib/saas-email-delivery.js`): magic-link·조직 초대·Advisor 초대 3종 발송 함수가 전부 구현돼 있고, `test/saas-email-delivery.test.js`가 mock `fetch`로 요청 헤더/본문/토큰이 URL fragment에만 들어가는지(쿼리스트링 노출 안 됨) 등을 검증한다. **그러나 실제 Resend 계정·검증된 발신 도메인을 향한 발송은 이 저장소 안 어디에도 실행 기록이 없다.** `PREDEPLOY_CHECKLIST.md` 4절이 이걸 명시적으로 미완료 항목("실제 production 또는 staging 도메인에서 Business magic-link 1회 사용 검증")으로 적어 두고 있고, 코드/테스트 상태와 정확히 일치한다.
2. **Advisor 초대 흐름 자체 로직**: `scripts/external-advisor-email-invitation-e2e.mjs`가 실제 PostgreSQL 컨테이너 + 실제 Express 앱으로 초대 생성→로그인→ShareGrant 부여까지 검증하지만, `SAAS_AUTH_TOKEN_ECHO=1`로 **이메일 발송 자체를 우회**한다(코드 11-14행에서 명시적으로 이 env를 켬). 즉 "초대 로직"은 검증됐지만 "초대 메일이 실제로 상대방 받은편지함에 도착하는지"는 검증 범위 밖.
3. **Advisor ShareGrant 테넌트 경계**: `scripts/advisor-collaboration-browser-e2e.mjs`가 실제 브라우저로 Case 생성→암호화 문서 v1→Advisor 다운로드→수정요청→v2→승인→댓글→Business 측 접근 철회까지, 그리고 "Membership/organization API 접근 불가"까지 검증하고 CI(`advisor-collaboration-ci.yml`)에서 매 push 실행된다. 이건 **fixture 데이터 기준**이며 실제 운영 조직 데이터로 검증된 적은 없다(구조적으로 당연 — 아직 운영 조직이 없다).
4. **PostgreSQL 마이그레이션 21개**(`db/postgres/*.sql`): CI의 `postgres-runtime` job이 실제 Postgres 서비스 컨테이너를 띄워 스키마 적용+Case CRUD까지 매 PR 검증한다(`.github/workflows/ci.yml:50` 부근, `docs/08_POSTGRES_CUTOVER_RUNBOOK.md` 2절과 일치). **다만 이건 CI의 임시 컨테이너 대상이며, 실제 production 데이터를 대상으로 한 cutover는 한 번도 실행되지 않았다** — `docs/STATUS.md` 3절 "Production PostgreSQL cutover: ⬜ 미완료"와 정확히 일치.
5. **Production smoke 자동화**: `readiness-production-smoke.mjs`/`production-http-security-smoke.mjs`/`production-smoke.mjs`/`annual-leave-production-smoke.mjs`가 실제 `https://insaya.onrender.com`을 대상으로 `main` push마다 GitHub Actions에서 실행되도록 워크플로가 존재한다(`ci.yml:209-231`, 코드로 직접 확인). `docs/STATUS.md`는 "2026-09-06 배포에서 성공했다"고 적고 있으나, **이 세션은 `gh` 인증이 없어 실제 Actions 실행 로그를 직접 열람하지 못했다** — git log상 merge 커밋 존재만으로 간접 추정.

---

## C. (c) 코드 자체가 없는 것

1. **PostgreSQL 전용 backup/restore 자동화가 없다.** `scripts/db-backup.mjs`·`scripts/db-restore-check.mjs`는 `lib/sqlite-backup.js`만 사용하는 **SQLite 전용** 도구다. 저장소 전체에서 `pg_dump`/`pg_restore`/"off-host" 관련 코드를 검색했으나 0건. Postgres cutover 이후에는 이 두 스크립트가 아예 대상 DB를 백업하지 못한다.
2. **`docs/04_DATA_ARCHITECTURE.md` 10절 "Backup 정책"**이 요구하는 "정기 logical export를 off-host storage에 저장"(2계층 백업의 두 번째 계층)을 수행하는 스케줄러/스크립트가 없다. RPO/RTO 목표(24h/4h, 이후 1h/1-2h)도 정책 숫자만 있고 이를 측정·집행하는 코드는 없다.
3. **롤백 SHA/DB 복구지점을 기록하는 전용 파일이나 스크립트가 없다.** `PREDEPLOY_CHECKLIST.md` 11절, `docs/08_POSTGRES_CUTOVER_RUNBOOK.md` 3절은 "기록한다/확보한다"는 절차 문장뿐이고, 이를 자동 기록하는 코드는 없다(수작업 전제로 보임 — 코드가 없는 게 반드시 결함은 아니지만, "확보돼 있다"고 확인할 방법이 현재 없다는 뜻).

---

## D. (d) 문서만 오래된 것 / 문서-코드 불일치

1. **`docs/08_POSTGRES_CUTOVER_RUNBOOK.md` 4절 "12개 기존 production table"**은 `lib/storage-contract.js`의 `LEGACY_CORE_TABLES`(정확히 12개: bookings/booking_events/access_logs/leads/nomusa/events/notifications/nomusa_accounts/feedback/cases/case_events/case_access_tokens)를 가리킨다. 이 목록은 Worker 레거시 스키마 시절 값 그대로이며, 이후 마이그레이션 `010_saas_identity.sql`부터 `150_business_case_document_binary_store.sql`까지 **21개 중 9개**가 추가한 Business/Advisor SaaS 스키마(조직·멤버십·Business Case·ShareGrant·초대·컴플라이언스·문서 바이너리 등)는 이 목록에 없다. `scripts/export-sqlite-portable.mjs`·`scripts/postgres-cutover-check.mjs`의 "semantic validation"(SQLite ↔ Postgres 데이터 일치 검증, `lib/postgres-portable.js`의 `validatePostgresAgainstPortable`)은 이 12개 테이블만 비교한다. → **이건 실제 문제인지 "미확인/판단 필요"로 남긴다**: 현재 코드 구조상 `SAAS_ENABLED=1`은 postgres 런타임을 강제하므로(A-2) SQLite에 SaaS 실데이터가 쌓일 경로 자체가 없어 보이고, 그렇다면 12개 테이블만 검증해도 실제로는 무결하다 — 그러나 이게 "의도된 설계"라고 문서 어디에도 명시돼 있지 않으며, 이 감사에서 그 의도를 확정할 근거를 찾지 못했다.
2. 그 외에는 **`docs/STATUS.md`(기준일 2026-09-06)가 현재 코드와 잘 맞는다** — PR #100/#102/#103 반영 사항, 5개 readiness profile 값, `render.yaml` baseline 값 등을 코드와 직접 대조했을 때 불일치를 발견하지 못했다. 오래된 문서 문제는 이번 감사 범위에서 크게 발견되지 않았다.

---

## E. (e) Production에서 직접 확인해야만 아는 것

1. **Render Dashboard의 실제 현재 환경변수 값.** `render.yaml`은 최초 provisioning 시점의 baseline이며, `docs/STATUS.md` 7절도 "Render Dashboard의 현재 실시간 설정과 자동으로 동일하다고 간주하지 않는다"고 이미 명시하고 있다 — 이 감사도 같은 한계를 갖는다. 저장소만 보고 "지금 Render에 `SAAS_ENABLED`가 몇으로 돼 있는지"는 알 수 없다.
2. **최근 `main` push의 GitHub Actions 실행 결과(특히 `production-smoke`).** 이 세션은 `gh auth login`이 안 돼 있어 `gh pr list`/`gh run list` 모두 실행하지 못했다. `docs/STATUS.md`의 "2026-09-06 exact-SHA smoke 성공" 서술은 git log(머지 커밋 존재)로 간접 확인했을 뿐, Actions 로그를 직접 열람하지 못했다.
3. **Resend 발신 도메인의 SPF/DKIM 실제 설정 상태** — Resend 대시보드/DNS 레코드를 직접 봐야 하며 코드/저장소에는 이를 알 수 있는 정보가 없다.
4. **Render free tier 파일시스템의 실제 영속성 여부** — `docs/STATUS.md`/`render.yaml` 주석은 "durable로 간주하지 않는다"고 서술하지만, 이는 정책적 선언이지 실측 결과가 아니다. 실제 restart/redeploy 후 데이터 생존 여부는 production에서 직접 재현해야 안다.

---

## 결론 (요약, 판단 없음)

- **오늘 SaaS가 안 켜져 있는 이유**: `render.yaml` baseline이 `SAAS_ENABLED=0`이기 때문(A-1) — 코드 결함이 아니라 명시적 설정.
- **켜려면 막히는 지점**: PostgreSQL 미전환(A-2, B-4), 이메일 발신 secret 미설정+미검증(A-3, B-1), 영속성 미검증(B-4), 이 세 축 전부 `production-deployment-contract.js`라는 단일 게이트에서 한꺼번에 걸린다(A-3).
- **코드가 아예 없어서 나중에 반드시 새로 만들어야 하는 것**: PostgreSQL 백업/복구 자동화(C-1, C-2).
- **문서와 코드가 안 맞을 수 있는 유일한 지점**: cutover 검증 도구가 12개 레거시 테이블만 보고 SaaS 스키마는 안 본다는 것(D-1) — 실제 위험인지는 미확인.
- **이 저장소만으로는 못 보는 것**: Render 실제 설정, 최근 Actions 실행 결과, Resend DNS 상태, free tier 실제 영속성(E-1~4).
