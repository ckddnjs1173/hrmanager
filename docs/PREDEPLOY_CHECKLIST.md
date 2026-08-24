# 인사야 배포 전 체크리스트

이 문서는 **배포 실행 전** 제품/데이터/보안/운영 조건을 확인하는 최종 체크리스트입니다. 코드가 준비되었다는 것과 production 환경이 준비되었다는 것은 구분합니다.

## 1. 배포 후보 SHA 고정

```bash
git switch main
git pull --ff-only
git log -1 --oneline
npm ci
npm run release:check
```

배포할 commit SHA를 기록하고 production smoke의 `EXPECTED_COMMIT`과 동일하게 사용합니다. PR branch나 로컬 수정본을 직접 배포하지 않습니다.

## 2. 데이터베이스

Business/Advisor SaaS를 켜는 production은 PostgreSQL primary만 허용합니다.

필수 조건:

- `STORAGE_DRIVER=postgres`
- `DATABASE_URL` secret 설정
- `REQUIRE_PERSISTENT_DB=1`
- `PERSISTENT_STORAGE=1`은 실제 restart/redeploy 생존 검증 후에만 설정
- `npm run db:pg:migrate`
- 기존 SQLite 운영 데이터가 있다면 `db:export-portable → db:pg:import → db:pg:validate → db:pg:cutover-check` 순서 준수
- 문서 저장 migration을 포함한 모든 PostgreSQL migration 적용

`PERSISTENT_STORAGE=1`은 스토리지가 실제로 영속적이라는 운영 확인 선언이지, 애플리케이션이 자동으로 영속성을 만들어 주는 옵션이 아닙니다.

## 3. SaaS 보안 secret

Production SaaS 활성화 전:

- `SAAS_ENABLED=1`
- `SAAS_SESSION_SECRET` 최소 32자 이상의 랜덤 secret
- `DOCUMENT_STORAGE_SECRET` 최소 32자 이상의 랜덤 secret
- `SAAS_AUTH_TOKEN_ECHO=0`
- `SITE_URL=https://...` 정확한 production origin
- 기존 `DOCUMENT_STORAGE_SECRET` 임의 변경 금지: 현재 키 회전 migration 없이 바꾸면 기존 암호화 문서를 복호화할 수 없습니다.

`npm run deployment:check`가 위 조건을 코드 수준에서 검사합니다.

## 4. 이메일 발송

Production 로그인/회사 구성원 초대/외부 전문가 초대는 이메일 전달 계층이 필요합니다.

- `SAAS_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY` secret
- `SAAS_EMAIL_FROM=인사야 <no-reply@검증된도메인>`
- 발신 도메인의 SPF/DKIM 등 provider 검증 완료
- 실제 production 또는 staging 도메인에서 Business magic-link 1회 사용 검증
- 회사 구성원 초대: 초대 → 이메일 → 로그인 → Membership 생성 확인
- Advisor 초대: 초대 → 이메일 → 로그인 → 초대 미리보기 → 수락 → Case/문서 접근 확인
- 발송 실패 시 pending invitation이 REVOKED 되는지 로그 확인

Production JSON 응답에는 raw magic/invitation token이 없어야 합니다.

## 5. 문서 보안

- `DOCUMENT_STORAGE_SECRET` 설정
- PDF/DOCX/HWP/HWPX 허용 형식 검증
- 최대 10MB 제한 확인
- 문서 버전 DB 상태 `VERIFIED/CLEAN` 이후에만 검토 요청 가능
- Advisor 권한 회수 후 다음 다운로드가 즉시 거부되는지 확인
- 평문 object URL/공개 signed URL을 UI 또는 API가 노출하지 않는지 확인
- 문서 access event가 남는지 확인

현재 내장 검사는 파일 형식 및 위험 active-content 방어 계층입니다. 전문 백신/악성코드 스캐너와 동일하다고 표시하지 않습니다.

## 6. UI/UX와 접근성

- 공개 홈, 상담 시작, 결과, 요약, 계산, 증거/보고서, 공식 절차, 문서 화면 확인
- Business 로그인/대시보드/Case/문서 검토/초대/접근 종료 확인
- Advisor 로그인/초대 미리보기/Case/문서 검토 확인
- Desktop와 390×844 mobile viewport 모두 확인
- Pretendard local font 로딩 실패 시 system font fallback 확인
- 키보드 focus-visible 확인
- 44px 전후의 모바일 주요 터치 영역 확인
- `prefers-reduced-motion` 확인
- 빈 상태, 오류 상태, 로딩 상태, 이메일 발송 완료 상태 확인

UI 참고 시안을 따라 시각적 일관성을 맞추되, 실제 데이터/기능이 없는 화면(예: 근로자 계정 기반의 가짜 사건목록)은 만들지 않습니다.

## 7. 법령/콘텐츠

- `npm run content:check`
- `npm run release:check`
- Legal Registry validation green
- 법령 버전 경계 테스트 green
- 공식 출처 URL과 시행일 확인
- AI가 계산/법적 결론을 단정하는 UI 문구가 없는지 확인

## 8. 브라우저/통합 테스트

PR과 배포 후보 SHA에서 다음 GitHub Actions가 모두 green이어야 합니다.

- CI / check
- PostgreSQL runtime E2E
- public Chromium E2E
- Business Workspace Chromium E2E
- Advisor Collaboration CI
- Business Case Document CI
- Legal Admin CI
- Compliance Close CI
- UI Visual Smoke 및 Core 5 모바일 detail smoke

Chromium 설치 자체가 hosted runner에서 취소된 경우 테스트 실패와 구분하고, 해당 job을 재실행하여 실제 테스트 성공 결과를 확보합니다.

## 9. Production smoke

`main` push의 production smoke는 **배포된 exact SHA 확인이 먼저 성공한 뒤** 보안/SEO smoke와 제품 smoke를 실행합니다.

자동 실행 순서:

```text
readiness-production-smoke
→ production-http-security-smoke
→ production-smoke
→ annual-leave-production-smoke
```

배포 직후 확인 항목:

1. `/api/health`
2. `/api/readiness`
3. `EXPECTED_COMMIT`과 배포된 build commit SHA 일치
4. `/package.json`, `/server.js`, `/lib/*`, `/db/*`, `/scripts/*`, `/tests/*` 등 private repository path가 404이고 `no-store`인지 확인
5. HSTS/CSP/COOP/X-Content-Type-Options/request ID 등 production HTTP security header 확인
6. home/article canonical, robots.txt, sitemap.xml이 실제 `SITE_URL` origin만 사용하는지 확인
7. intentional public data(`/data/nomusa.json`)가 계속 접근 가능한지 확인
8. 5개 Case domain smoke
9. annual-leave smoke
10. synthetic Case 삭제/cleanup 확인
11. Business/Advisor 페이지 HTTP 200 및 정적 asset 확인
12. 실제 magic-link 한 건 발송/로그인
13. 테스트 조직에서 Advisor 초대/철회 한 건 수행

자동 smoke는 실제 production 이메일 계정/운영 조직을 임의로 생성하거나 SaaS를 활성화하지 않습니다. 실제 magic-link 및 Advisor 초대 검증은 production 운영 설정이 완료된 뒤 별도 승인 절차로 수행합니다.

## 10. 롤백

배포 전 직전 정상 commit SHA와 DB 백업/복구 지점을 기록합니다.

애플리케이션 오류 시:

- 코드: 직전 정상 SHA로 rollback
- 신규 SaaS 노출 문제: 우선 `SAAS_ENABLED=0`으로 기능 fail-closed
- 이메일 문제: provider 설정 제거 시 production auth는 fail-closed하므로 원인 해결 전 SaaS를 함께 OFF
- DB migration 문제: destructive rollback을 즉흥적으로 수행하지 말고 migration/runbook에 따른 복구 사용
- `DOCUMENT_STORAGE_SECRET`은 롤백 과정에서도 기존 값을 유지

## 배포 승인 조건

다음 조건을 모두 만족해야 배포 승인으로 봅니다.

- `npm run release:check` 성공
- 모든 필수 CI green
- PostgreSQL migration/cutover 검증 완료
- production email 발신 도메인 검증 완료
- persistence restart/redeploy 검증 완료
- production secrets 설정 완료
- exact-SHA + HTTP security/SEO + 제품 production smoke green
- smoke/rollback 담당자와 절차 확정
