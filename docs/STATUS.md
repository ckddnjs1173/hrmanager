# 인사야 구현 현황 — PREDEPLOY RC

> **Source of Truth:** 현재 저장소 구현·검증·운영 준비 상태  
> **기준일:** 2026-08-25  
> **Production:** https://insaya.onrender.com/  
> **현재 판정:** 제품/코드 기능은 predeploy RC. Production SaaS 활성화와 GA 승인은 별도 운영 검증이 필요함.

---

## 1. 현재 결론

인사야는 더 이상 Worker용 1.0 Core Case만 있는 구조가 아니다.

현재 소스는 아래 네 영역을 공통 Case/Legal 기반 위에서 제공한다.

```text
1. Worker Core 5 노동문제 해결
2. Business 노동 Compliance SaaS
3. External Advisor Case/문서 협업
4. Internal Legal Change Governance
```

현재 단계의 핵심 과제는 새 기능 추가가 아니라 **배포 전 제품 마감 + production 운영 조건 검증**이다.

---

## 2. 제품 영역별 상태

| 영역 | 상태 | 비고 |
|---|---|---|
| Worker Core 5 | ✅ | 임금체불·해고·퇴직금·근로시간·연차 |
| Case Engine | ✅ | 구조화 facts, opaque token, report/document/action |
| Legal Registry / deterministic rules | ✅ | 기준일·공식 근거·fixture 중심 |
| Business Auth | ✅ | magic-link, production email adapter |
| Organization / Membership / RBAC | ✅ | tenant 경계 및 역할 권한 |
| Business Onboarding | ✅ | 회사 초기 설정 |
| Risk / Action | ✅ | 위험 및 다음 조치 |
| Compliance Calendar | ✅ | 기한/일정 |
| Notification | ✅ | Business 알림 |
| Monthly Compliance Close | ✅ | 월 단위 마감 workflow |
| Business Case | ✅ | 상태·event·협업 기준 resource |
| External Advisor ShareGrant | ✅ | 회사 Membership 없이 Case 단위 공유 |
| Advisor Collaboration | ✅ | 초대·수락·목록·의견·철회 |
| Encrypted Document Workflow | ✅ | 문서 버전·암호화·검토·다운로드 감사 |
| Legal Change Governance | ✅ | 후보→사람검토→proposal→fixture→ready |
| Legal auto activation | ⛔ | 의도적으로 금지 |
| UI Design System | ✅ | Pretendard local, violet primary, responsive |
| Predeploy Security/SEO hardening | ✅/검증중 | PR detail pass에서 최종 회귀 검증 |
| Production PostgreSQL 실전환 | ⬜ | 운영 환경 작업 |
| Production email domain 검증 | ⬜ | SPF/DKIM/provider 검증 필요 |
| restart/redeploy persistence | ⬜ | 실제 Render 운영 검증 필요 |
| exact-SHA production smoke | ⬜ | 최종 main 배포 후 수행 |
| SaaS public activation | ⬜ | 위 조건 완료 후에만 활성화 |

---

## 3. Worker Core 5

### 지원 Case

- 임금체불 — `/wage-intake`
- 해고·권고사직 — `/dismissal-intake`
- 퇴직금·퇴직연금 — `/retirement-intake`
- 근로시간·연장/야간/휴일수당 — `/worktime-intake`
- 연차유급휴가·미사용수당 — `/annual-leave-intake`

공통 구조:

```text
Case 생성
→ Facts
→ Legal/Rule
→ Money 또는 핵심 판단
→ Evidence
→ Next Action
→ Sources
→ Documents
→ Official Procedure
→ Report
→ Delete
```

### 배포 전 공통 UX 하드닝

Core 5는 `case-detail.js` / `case-detail.css` 공통 레이어를 사용한다.

- loading state ARIA
- 동적 error/empty state ARIA
- API 401/403/404/429/5xx 사용자 안내
- offline/online 안내
- raw backend error code 노출 완화
- keyboard focus-visible
- 390px 모바일 입력/터치 영역
- reduced motion

도메인별 계산/법률 로직을 복제하지 않고 공통 UX 계층만 추가한다.

---

## 4. Business Compliance SaaS

현재 구현된 주요 계층:

```text
User
→ Auth
→ Organization
→ Membership / RBAC
→ Onboarding
→ Employee Lite / company facts
→ Risk
→ Action
→ Calendar
→ Notification
→ Compliance Close
→ Business Case
→ Document / Advisor Collaboration
```

### 권한 원칙

- 조직 데이터는 `organization_id` 경계를 넘지 않는다.
- Business 협업 관리 권한은 정해진 RBAC를 통과해야 한다.
- 외부 Advisor를 회사 Membership으로 자동 승격하지 않는다.
- Worker B2C 사건과 Employer tenant 데이터는 자동 연결하지 않는다.

### Business predeploy detail

`business-detail.js` / `business-detail.css`에서 다음을 보강했다.

- pending/중복작업 시각 상태
- 사용자 친화 API 오류 문구
- session expiry 안내
- bootstrap failure state
- ARIA live/focus
- prompt 기반 사유 입력을 dialog 기반 입력으로 교체
- 모바일 pending/error layout

---

## 5. External Advisor Collaboration

공유 구조:

```text
Business Case
→ invitation
→ Advisor 본인 global User 확인
→ ShareGrant ACCEPTED
→ 허용 permission만 사용
→ Case / comment / document / review
→ 회사 revoke 또는 expiry
→ 다음 요청 즉시 거부
```

보안 불변조건:

- cross-tenant Case 공유 차단
- Advisor에게 내부 Membership 자동생성 금지
- Advisor 본인만 초대 수락 가능
- 만료/철회 즉시 접근 차단
- Case 실제 `organization_id`로 소유권 검증
- 다운로드/검토마다 권한 재검증

### Advisor predeploy detail

`advisor-detail.js` / `advisor-detail.css` 공통 보강:

- loading/empty/error ARIA
- invitation expired/revoked 사용자 안내
- ShareGrant expired/revoked 사용자 안내
- 401/403/429/5xx/network error 안내
- visible view heading focus
- disabled/focus/touch target/mobile 처리

---

## 6. 문서 보안

현재 Business Case 문서 workflow:

```text
회사 업로드
→ 형식/크기/signature 검사
→ encrypted binary store
→ VERIFIED + CLEAN
→ 검토 요청
→ Advisor download
→ APPROVED 또는 CHANGES_REQUESTED
→ 회사 새 version
→ 재검토
```

주요 제약:

- AES-256-GCM 암호화 저장
- PostgreSQL에 문서 평문 원본 직접 저장 금지
- 허용 형식: PDF/DOCX/HWP/HWPX
- 서버에서 SHA-256/size 재계산
- PDF active-content 기본 방어
- Advisor 권한 철회 후 다음 다운로드 차단
- 다운로드 audit event
- `DOCUMENT_STORAGE_SECRET` 임의 변경 금지

현재 active-content 검사는 전문 백신/악성코드 스캐너와 동일하다고 표시하지 않는다.

---

## 7. Legal Change Governance

법령변경은 자동으로 runtime 판정에 반영하지 않는다.

```text
official source candidate
→ snapshot/content hash
→ human review
→ rule proposal
→ fixture validation
→ READY_FOR_IMPLEMENTATION
```

금지:

- AI 자동 승인
- human review bypass
- fixture 없는 rule 승격
- 변경 감지 결과의 runtime ACTIVE 자동 적용

Legal Source Monitor Scheduler는 production에서 명시적으로 켜기 전까지 OFF/fail-closed 상태를 유지한다.

---

## 8. Production Auth / Email

Production SaaS는 이메일 전달 계층을 사용한다.

구현:

- Business magic-link email
- Organization member invitation email
- External Advisor invitation email
- raw token production JSON 비노출
- fragment 기반 token 전달
- `/business-login.html`에서 fragment 즉시 제거
- invitation email 실패 시 생성된 invitation revoke
- return target allowlist

Business Login detail pass에서는 backend 내부 error code를 그대로 화면에 출력하지 않고 한국어 사용자 안내로 변환한다.

---

## 9. HTTP / Static / SEO hardening

현재 predeploy detail pass의 서버 하드닝:

### Static

저장소 root가 browser asset과 server source를 함께 포함하는 현재 구조에서 `express.static` 전에 guard를 둔다.

차단 예:

- `server.js`
- `package.json`, lockfile
- `.env*`
- `lib/`
- `db/`
- `scripts/`
- `tests/`, `test/`
- `docs/`
- SQL/SQLite/DB/backup/log 계열

의도적으로 공개하는 `data/nomusa.json`은 허용한다.

장기적으로는 public asset을 별도 `public/` root로 분리하는 것이 권장 Technical Debt다.

### HTTP

- CSP
- HSTS(secure request)
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy
- Origin-Agent-Cluster
- X-Permitted-Cross-Domain-Policies
- form-action 제한

### Cache

- health/readiness/404/error: `no-store`
- HTML: revalidate
- image/font: 장기 cache + stale-while-revalidate
- 기타 public asset: 짧은 cache/revalidate

### SEO

- `SITE_URL` 기준 canonical
- OG/JSON-LD origin 보정
- article origin 보정
- robots/sitemap dynamic origin

---

## 10. 검증 체계

로컬 필수:

```bash
npm ci
npm run check
npm run content:check
npm run deployment:check
npm run release:check
```

CI 영역:

- CI / Node regression / build / release gate
- PostgreSQL runtime E2E
- Worker/public Chromium
- Business Workspace Chromium
- Advisor Collaboration CI
- Business Case Document CI
- Legal Admin CI
- Compliance Close CI
- UI Visual Smoke

Predeploy detail pass에는 static exposure, SEO origin, malformed cookie/session, Core 5/Advisor/Business Login detail contract 회귀 테스트가 추가되어 있다.

---

## 11. Production에서 아직 완료하지 않은 것

다음은 코드만으로 완료 처리할 수 없다.

### PostgreSQL

- production DB 생성
- `DATABASE_URL`
- migration 실행
- 필요한 기존 데이터 import/validate/cutover
- restart/redeploy 생존 확인

### Secrets

- `SAAS_SESSION_SECRET`
- `DOCUMENT_STORAGE_SECRET`
- `ADMIN_TOKEN`
- AI provider key
- 기타 운영 secret

### Email

- Resend 실제 계정/키
- 발신 도메인 검증
- SPF/DKIM
- 실제 magic-link 발송
- 회사 구성원 초대
- Advisor 초대

### Smoke

- final main exact SHA 확인
- `/api/health`
- `/api/readiness`
- Core 5 synthetic case
- Business/Advisor HTTP/assets
- magic-link 1건
- Advisor 초대/수락/철회 1건
- synthetic cleanup

---

## 12. 배포 승인 기준

배포 승인 조건은 `docs/PREDEPLOY_CHECKLIST.md`를 canonical runbook으로 사용한다.

최소 조건:

```text
final main SHA fixed
+ release:check green
+ all required CI green
+ PostgreSQL migration/cutover green
+ secrets configured
+ email domain verified
+ restart/redeploy persistence verified
+ production smoke green
+ rollback point recorded
```

위 조건 이전에는 `SAAS_ENABLED=1`을 production 공개 완료로 간주하지 않는다.

---

## 13. 다음 작업 원칙

Predeploy RC 동안 금지:

- 새 Core Case 추가
- ATS/급여/풀 근태 등 별도 대형 제품 확장
- Legal 자동승인/자동활성화
- production 유료 인프라 자동 활성화

우선순위:

```text
detail QA
→ CI/Visual green
→ source-of-truth 정합성
→ main merge
→ production infrastructure
→ exact-SHA smoke
→ SaaS activation decision
```
