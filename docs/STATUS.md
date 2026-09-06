# 인사야 구현 현황 — CURRENT PREDEPLOY RC

> **Source of Truth:** 현재 저장소의 제품·코드 구현 상태와 마지막 Production 검증 상태를 요약한다.  
> **기준일:** 2026-09-06  
> **Production:** https://insaya.onrender.com/  
> **현재 판정:** 공개 Worker 제품은 운영 중이며, Business/Advisor SaaS는 코드 구현과 Production 활성화를 분리해 관리하는 Predeploy RC 상태다.

---

## 1. 현재 결론

인사야는 Worker / Business / Advisor / Legal Governance를 공통 Case / Legal 기반으로 연결하는 구조다.

```text
Worker
Business
Advisor
Legal Governance
        ↓
Shared Case / Legal / Rule
Document / Audit / Action
```

현재 제품의 중심 객체는 `Case`다.

법정 숫자·기한·명확한 적용 판단은 LLM 자유생성보다 deterministic Rule / Legal Registry 결과를 우선한다. 법률 변경 감지 결과는 human review와 fixture validation 없이 runtime Rule로 자동 승격하지 않는다.

코드 구현 완료, GitHub merge 완료, Production 배포 완료, Production 기능 활성화 완료를 서로 같은 상태로 취급하지 않는다.

---

## 2. 2026-09-06 기준 주요 반영 사항

2026-08-25 PREDEPLOY RC 이후 다음 제품 변경이 `main`에 반영됐다.

### Case-first IA

PR #100에서 public IA를 Case-first 흐름으로 재정비했다.

- Home의 AI 상담 진입을 유지하면서 Worker / Business / 노동생활 도구 / 노무사 찾기 진입을 분리
- public entry page: `worker.html`, `employer.html`, `tools.html`
- 글로벌 navigation 정비
- 전문가 연결 표현을 특정 노무사 “추천”이 아니라 “찾기·비교” 중심으로 정리
- 노무사 directory의 노출 정책과 실제 정렬 로직을 일치시킴
- Worker Core 5의 기존 Case Facts → Legal/Rule → 계산/판단 → Evidence → Next Action 흐름 유지

### Design system consolidation

PR #102에서 public/Worker/Business의 accent를 `#5B4BFF` 보라 계열로 통일하고 공통 semantic token 사용을 확대했다.

- accent / success / warning / danger 의미 분리
- 버튼과 표 presentation 규칙 통합
- Worker Core intake 화면의 잔여 도메인별 초록·남색 계열 제거
- `tools.html`, home의 노무사 영역에 카테고리 아이콘 presentation 보강

### Worker Case status presentation

PR #103에서 Worker Core 5의 Case status pill을 실제 `case.status`에 연결했다.

```text
intake / analysis / active → accent
waiting                  → warning
resolved                 → success
archived                 → warning
```

이 변경은 상태 표시용 presentation wiring이며 Worker Core 5의 계산·법률판정 로직을 변경하지 않는다.

---

## 3. 제품 영역별 상태

| 영역 | 코드 상태 | Production 상태 / 비고 |
|---|---|---|
| Worker Core 5 | ✅ 구현 | 공개 Production smoke 통과 |
| Case Engine | ✅ 구현 | opaque token, facts, report/document/action |
| Legal Registry / deterministic rules | ✅ 구현 | 기준일·공식 근거·fixture 중심 |
| Case-first public IA | ✅ 구현 | Worker / Business / tools / expert entry 분리 |
| Expert directory policy | ✅ 구현 | sponsored / verified / 지역·분야 기준과 UI 고지 정합화 |
| Business Auth | ✅ 구현 | magic-link/email adapter 코드 존재; Production SaaS 활성화와 별개 |
| Organization / Membership / RBAC | ✅ 구현 | tenant boundary 유지 |
| Business Onboarding / Risk / Action | ✅ 구현 | deterministic compliance flow |
| Calendar / Notification / Compliance Close | ✅ 구현 | SaaS runtime 활성화와 별개 |
| Business Case | ✅ 구현 | tenant-owned Case resource |
| External Advisor ShareGrant | ✅ 구현 | Organization Membership으로 자동 승격하지 않음 |
| Advisor Collaboration | ✅ 구현 | invitation / Case / comment / document permission 경계 |
| Encrypted Document Workflow | ✅ 구현 | AES-256-GCM, permission recheck, audit |
| Legal Change Governance | ✅ 구현 | human review / fixture gate |
| Legal auto activation | ⛔ 금지 | 의도적으로 지원하지 않음 |
| Design system baseline | ✅ 반영 | violet accent + semantic state token; 소규모 cleanup backlog 존재 |
| Production PostgreSQL cutover | ⬜ 미완료 | runtime/CI 지원과 실제 cutover를 구분 |
| Durable persistence attestation | ⬜ 미완료 | restart/redeploy/backup/restore 검증 전 `PERSISTENT_STORAGE=1` 금지 |
| Production email verification | ⬜ 미완료/미확인 | provider/domain/SPF/DKIM 실제 운영 검증 필요 |
| Business/Advisor SaaS public activation | ⬜ 미활성 | PostgreSQL/persistence/email/security 조건 이후 별도 결정 |

---

## 4. Worker Core 5

Canonical Worker 범위:

- 임금체불 — `/wage-intake`
- 해고·권고사직 — `/dismissal-intake`
- 퇴직금·퇴직연금 — `/retirement-intake`
- 근로시간·연장/야간/휴일수당 — `/worktime-intake`
- 연차유급휴가·미사용수당 — `/annual-leave-intake`

공통 구조:

```text
Case 생성
→ Facts
→ Legal / Rule
→ 계산 또는 핵심 판단
→ Evidence
→ Next Action
→ 공식 근거
→ Document
→ 공식기관 절차
→ Case Report
→ Delete
```

Worker Case는 opaque access token 기반이다.

- Case ID만으로 protected Case 조회 금지
- token 원문 DB 미저장
- URL query에 Case token 저장 금지
- revoke / expiry / retention 적용

2026-09-06 status-pill 수정은 위 계산·판정 pipeline을 변경하지 않고 상태 presentation만 실제 `case.status`에 연결한다.

---

## 5. Business / Advisor / Legal Governance

### Business

코드에는 다음 기반이 구현돼 있다.

```text
Auth
→ Organization / Membership / RBAC
→ Onboarding
→ Employee Lite / company facts
→ Risk
→ Action
→ Calendar / Notification
→ Compliance Close
→ Business Case
→ Document / Advisor Collaboration
```

Business SaaS 코드가 존재한다는 사실만으로 Production에서 SaaS가 활성화되었다고 판단하지 않는다.

### Advisor

외부 Advisor는 회사 Organization Membership으로 자동 편입되지 않는다.

```text
Business Case
→ Invitation
→ exact invited User acceptance
→ ShareGrant
→ explicit permission
→ advisor-safe Case / comment / document access
→ revoke / expiry
→ 다음 요청부터 즉시 차단
```

### Legal Governance

```text
Official source candidate
→ snapshot / content hash
→ human review
→ rule proposal
→ fixture validation
→ READY_FOR_IMPLEMENTATION
→ 별도 code / review / release
```

금지:

- AI 자동 승인
- human review bypass
- fixture 없는 Rule 승격
- 변경 감지 결과 runtime 자동 반영
- 자동 `ACTIVE` 처리

---

## 6. 현재 기술 및 보안 경계

### Application

- Node.js / Express 5
- `server.js`: bootstrap
- `lib/application.js`: canonical application composition
- HTML / CSS / Vanilla JavaScript 기반 frontend
- guarded static serving

주요 API 영역:

```text
/api/health
/api/readiness
/api/cases/*
/api/saas/*
AI / Documents / Experts
Admin / Partner
```

### Storage

Runtime은 SQLite와 PostgreSQL migration path를 지원한다.

PostgreSQL runtime 및 CI 지원 완료
≠
Production PostgreSQL cutover 완료

Business/Advisor SaaS Production은 PostgreSQL primary를 전제로 한다.

### Security boundaries

- Worker opaque Case token
- Business magic-link / HttpOnly session
- CSRF
- Organization tenant isolation
- RBAC
- Advisor Case-level ShareGrant
- raw production auth/invitation token 비노출
- HTTP security headers
- private repository path static exposure 차단
- document AES-256-GCM encryption
- document access permission recheck
- audit/event history

`DOCUMENT_STORAGE_SECRET`은 key-rotation migration 없이 임의 변경하지 않는다.

---

## 7. Repository Baseline

현재 `render.yaml`의 repository baseline은 fail-closed다.

```text
Render plan = free
autoDeploy = true
STORAGE_DRIVER = sqlite
REQUIRE_PERSISTENT_DB = 0
PERSISTENT_STORAGE = 0
SAAS_ENABLED = 0
SAAS_AUTH_TOKEN_ECHO = 0
```

이 값은 Repository Baseline이며 Render Dashboard의 현재 실시간 설정과 자동으로 동일하다고 간주하지 않는다.

---

## 8. Last Verified Production

2026-09-06 `main` 배포에서 GitHub Actions exact-SHA Production smoke가 성공했다.

마지막으로 검증된 profile은 `free`다. `free` profile assertion은 단순 label 확인이 아니라 `/api/readiness`에 대해 다음을 검증한다.

- `ready=true`
- deployed `build.commit` = `EXPECTED_COMMIT`
- `database.ok=true`
- `database.engine=sqlite`
- Worker Case registry = 5 domains
- Legal readiness green
- deployment gate green
- `readyForSensitiveCaseStorage=false`
- persistence required / durable declaration = false
- runtime `deployment.saasEnabled=false`
- persistence 미검증 warning 존재

또한 동일 SHA에서 다음 smoke가 성공했다.

- HTTP security / SEO
- wage
- dismissal
- retirement
- worktime
- annual leave

따라서 **Last Verified Production 기준은 Render free / SQLite / SaaS disabled / durable persistence 미검증**이다.

단, GitHub Actions exact-SHA 검증 이후 Render Dashboard에서 commit 없이 환경변수나 인프라가 변경되었는지를 이 문서만으로 Current Production이라고 단정하지 않는다.

---

## 9. CI / Release 검증 체계

GitHub Actions의 주요 gate:

- Node regression / build / content / release safety
- PostgreSQL runtime E2E
- Worker/public Chromium
- Business Workspace Chromium
- Advisor Collaboration CI
- Business Case Document CI
- Legal Admin CI
- Compliance Close CI
- UI Visual Smoke
- main push exact-SHA Production smoke

Production smoke는 `EXPECTED_COMMIT`이 실제 `/api/readiness` build commit과 일치한 뒤 제품 smoke를 수행한다.

`docs/PREDEPLOY_CHECKLIST.md`가 Production SaaS 활성화와 DB cutover의 canonical runbook이다.

---

## 10. Production에서 아직 완료 처리하지 않는 것

다음은 코드 구현 또는 free-profile smoke 성공만으로 완료 처리할 수 없다.

### PostgreSQL / Persistence

- Production durable PostgreSQL provision
- migration / import / semantic validation / cutover
- restart survival
- redeploy survival
- off-host backup
- restore rehearsal
- 검증 완료 후 `PERSISTENT_STORAGE=1` attestation

### SaaS Security / Email

- Production SaaS 운영 secret 최종 확인
- verified sender/domain
- SPF / DKIM
- 실제 Business magic-link 발송/로그인
- Organization invitation 실제 전달
- Advisor invitation / accept / revoke 실제 전달 흐름

### Activation

- PostgreSQL/persistence/email 운영조건 검증
- rollback / recovery point 확보
- 별도 Production SaaS activation decision

위 조건 전에는 `SAAS_ENABLED=1`을 Production SaaS 준비 완료로 간주하지 않는다.

---

## 11. Design / presentation 정리 상태

현재 공통 accent는 `#5B4BFF`다.

상태색은 의미를 분리한다.

```text
accent  = 진행 / 선택 / brand
success = 완료 / 승인
warning = 대기 / 추가 확인 / archived 상태 표시
 danger  = 오류 / 실제 위험
```

Worker status pill은 실제 `case.status`에 연결됐다.

현재 알려진 non-P0 cleanup backlog:

- 일부 카드 radius 값 혼재
- `business-detail.css`가 현재 runtime에서 참조되지 않는 orphan 파일로 확인되어 삭제 여부 결정 필요
- 일부 `@font-face` 중복: 현재 테스트 contract가 각 CSS의 자체 선언을 요구하므로 선행 테스트 변경 없이 제거하지 않음
- 일부 presentation 문서/주석과 실제 loader 구조의 불일치 정리 필요

이 항목은 현재 계산·권한·tenant·Legal runtime 경계를 변경하는 P0 이슈가 아니다.

---

## 12. Source of Truth 사용 규칙

제품/코드 상태는 다음 순서를 따른다.

```text
GitHub main 실제 코드
→ docs/STATUS.md
→ docs/ARCHITECTURE.md
→ docs/PREDEPLOY_CHECKLIST.md
→ 기타 최신 GitHub 문서
→ Project Source
→ 과거 Migration / Audit / History
```

Production/운영 상태는 다음 순서를 따른다.

```text
Production 직접 확인
→ Render 실제 설정 / runtime
→ GitHub Actions exact-SHA Production smoke
→ render.yaml / 운영 Runbook
→ docs/STATUS.md
→ Project Source
→ 과거 운영 기록
```

현재 직접 확인하지 않은 Last Verified Production 결과를 Current Production이라고 표현하지 않는다.
