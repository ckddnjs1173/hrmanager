# 인사야 — 노동문제 해결 · 노동 Compliance 플랫폼

**Production:** https://insaya.onrender.com/

> **Source state 기준일:** 2026-08-25  
> 현재 저장소는 Worker Core 5 + Business Compliance SaaS + External Advisor Collaboration + Legal Governance를 하나의 공통 법률/Case 기반 위에 구성한 **predeploy release candidate** 단계입니다.  
> 코드가 준비된 것과 production SaaS가 활성화된 것은 구분합니다. Production 활성화는 `docs/PREDEPLOY_CHECKLIST.md`의 운영 조건을 모두 충족한 뒤에만 진행합니다.

## 제품 구조

```text
                         INSAYA
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
      Worker             Business            Advisor
  노동문제 해결       사업주 Compliance     외부 전문가 협업
        │                   │                   │
        └──────────── Shared Platform ──────────┘
                            │
                    Case / Legal / Rule
                    Document / Audit
                    Notification / Action
```

### Worker — Core 5

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

Worker Case의 접근 토큰은 URL에 넣지 않고 브라우저 탭의 `sessionStorage`에만 보관합니다. 법률 적용·금액·기한의 핵심 판단은 LLM 자유생성이 아니라 Case/Rule/Legal 계층의 결정론 로직을 우선합니다.

### Business — Compliance SaaS

현재 소스에 다음 기반이 구현되어 있습니다.

- SaaS 로그인 / magic-link
- Organization / Membership / tenant 경계
- RBAC
- Business onboarding
- Risk / Action
- Compliance Calendar
- Notification
- Monthly Compliance Close
- Business Case
- 외부 Advisor 공유/철회
- 문서 업로드·버전·검토 workflow
- Audit/event 기록
- production 이메일 전달 계층

SaaS 기능은 production에서 자동으로 켜지지 않으며 `SAAS_ENABLED=1`과 필수 운영 secret/DB/email 조건이 모두 갖춰져야 합니다.

### Advisor — 외부 전문가 협업

외부 전문가는 회사 내부 Membership을 받지 않습니다.

```text
회사 Business Case
→ 명시적 Case ShareGrant
→ Advisor 본인 초대 수락
→ 허용된 Case/문서만 조회
→ 의견/문서 검토
→ 회사가 접근 종료
→ 다음 요청부터 즉시 차단
```

문서 원본은 별도 저장 계층에서 암호화하며, 문서 접근·검토·다운로드 권한은 매 요청마다 재검증합니다.

### Legal Governance

법령 변경은 runtime Rule에 자동 승격하지 않습니다.

```text
공식 출처 후보
→ snapshot/hash
→ 사람 검토
→ Rule proposal
→ fixture 검증
→ READY_FOR_IMPLEMENTATION
→ 별도 구현/검증
```

Legal Source Monitor Scheduler는 production에서 명시적으로 활성화하지 않는 한 fail-closed 상태를 유지합니다.

## 배포 전 하드닝

현재 predeploy detail pass에는 다음이 포함됩니다.

- 저장소 루트 정적 서빙에서 `server.js`, `lib/`, `db/`, `tests/`, package/deployment 파일 차단
- canonical / OG / JSON-LD / robots / sitemap의 `SITE_URL` 기반 origin 처리
- malformed cookie/session fail-safe
- CSP / HSTS / COOP / Permissions Policy 등 HTTP security 보강
- health/readiness/error/404 `no-store`
- 정적 asset cache 정책
- Core 5 공통 loading/error/offline/token-expiry UX
- Business 상세 pending/error/session UX
- Advisor loading/error/invitation/access-revocation UX
- Business Login fragment token 즉시 제거 및 사용자 친화 오류 처리
- desktop/mobile visual smoke와 회귀 테스트

## 데이터 / 저장소

Worker 1.0의 초기 저장 경로와 SaaS production 저장 요구조건은 구분합니다.

Business/Advisor SaaS production은 PostgreSQL primary를 전제로 합니다.

필수 운영 조건:

```text
STORAGE_DRIVER=postgres
DATABASE_URL=<secret>
REQUIRE_PERSISTENT_DB=1
```

`PERSISTENT_STORAGE=1`은 설정만으로 영속성을 만드는 옵션이 아닙니다. 실제 restart/redeploy 생존 검증을 완료한 뒤 운영자가 선언하는 값입니다.

암호화 문서의 `DOCUMENT_STORAGE_SECRET`은 기존 문서가 존재하는 상태에서 임의 변경하면 안 됩니다. 현재 키 회전 migration 없이 변경하면 기존 문서를 복호화할 수 없습니다.

## Production 인증 / 이메일

Production Business/Advisor 로그인과 초대는 이메일 전달 계층을 사용합니다.

```text
SAAS_EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
SAAS_EMAIL_FROM=<verified sender>
SITE_URL=https://...
```

Production JSON 응답에 raw magic/invitation token을 반환하지 않습니다. 이메일 링크의 민감 토큰은 URL fragment로 전달하고 전용 로그인 화면에서 즉시 주소창에서 제거합니다.

## 주요 코드 구조

```text
server.js
└─ lib/application.js
   ├─ /api/health
   ├─ /api/readiness
   ├─ /api/cases/*
   ├─ /api/saas/*
   ├─ AI / docs / experts
   ├─ public operations
   ├─ admin / partner
   └─ secure summary

lib/case-domain-registry.js       Worker Core 5 registry
lib/legal-registry.js             Legal source registry
lib/saas-*.js                     SaaS tenant/risk/close/advisor/email 계층
lib/business-case-*.js            Business Case / document 계층
case-client-core.js               Worker Case shared client
case-detail.js                    Core 5 공통 predeploy UX hardening
business-detail.js                Business predeploy UX hardening
advisor-detail.js                 Advisor predeploy UX hardening
```

## 검증

로컬:

```bash
npm ci
npm run check
npm run content:check
npm run deployment:check
npm run release:check
```

PR에서는 일반 Node/build/release gate 외에 PostgreSQL 및 실제 Chromium E2E/Visual QA를 사용합니다.

주요 CI 영역:

- CI
- PostgreSQL runtime E2E
- Worker/public Chromium
- Business Workspace Chromium
- Advisor Collaboration CI
- Business Case Document CI
- Legal Admin CI
- Compliance Close CI
- UI Visual Smoke

## Production 배포 승인 조건

소스 병합만으로 배포 완료로 보지 않습니다. 최소 다음을 모두 확인합니다.

1. 배포 후보 main SHA 고정
2. `npm run release:check` 성공
3. 필수 CI 전부 green
4. PostgreSQL migration/cutover 검증
5. production secrets 입력
6. Resend 발신 도메인/SPF/DKIM 검증
7. restart/redeploy persistence 검증
8. `/api/readiness` 확인
9. exact-SHA production smoke
10. 실제 magic-link 1건
11. 테스트 조직 Advisor 초대/수락/철회 1건
12. rollback SHA와 DB 복구 지점 기록

상세 절차는 [`docs/PREDEPLOY_CHECKLIST.md`](./docs/PREDEPLOY_CHECKLIST.md)를 따릅니다.

## Source of Truth

| 문서 | 역할 |
|---|---|
| [`docs/STATUS.md`](./docs/STATUS.md) | 현재 구현/검증/남은 운영 조건 |
| [`docs/PREDEPLOY_CHECKLIST.md`](./docs/PREDEPLOY_CHECKLIST.md) | production 배포 승인 체크리스트 |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 코드 구조와 보안 경계 |
| [`docs/SAAS_BUSINESS_ROADMAP.md`](./docs/SAAS_BUSINESS_ROADMAP.md) | Worker → Business → Pro/SaaS 장기 방향 |
| [`docs/SAAS_PLANNING_BACKLOG.md`](./docs/SAAS_PLANNING_BACKLOG.md) | SaaS 세부 기획 backlog |

## 빠른 시작

```bash
npm install
cp .env.example .env
npm start
```

기본 주소는 `http://localhost:3000`입니다. AI provider key가 없어도 서버와 결정론 Case 기능은 동작할 수 있으며, production secret·SaaS 이메일·유료 인프라를 개발 과정에서 자동 활성화하지 않습니다.
