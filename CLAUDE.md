# 인사야 (hrmanager) — 프로젝트 컨텍스트

## 기본 정보
- Canonical repo: ckddnjs1173/hrmanager, branch: main
- Production: https://insaya.onrender.com/ (Render, free tier)
- 현재 단계: 공개 베타 병행 중인 Predeploy Release Candidate
- 마지막 검증 SHA: 3265b581cd3873760c00bb9c72ce19c5b1e47d07 (2026-08-25)
- 마지막 검증 기준 Production: SQLite / SaaS OFF (단, 이후 변경 여부 미확인)

## 제품 구조
Worker / Business / Advisor / Legal Governance 4개 영역이 공통 Case 객체로 연결됨.
- Worker: 소스 구현 완료 (Core 5: 임금체불/해고·권고사직/퇴직금/근로시간수당/연차휴가)
- Business: 소스 구현 완료 / Production SaaS 활성화 미완료
- Advisor: 소스 구현 완료 / SaaS 활성화에 종속, Case 단위 ShareGrant 기반
- Legal Governance: 자동 승인/ACTIVE 처리 금지, human review 필수

## 기술 스택
- Backend: Node.js, Express 5, server.js(bootstrap), lib/application.js(composition)
- Frontend: HTML/CSS/Vanilla JS (SPA 아님, Express static)
- DB: sqlite / postgres-shadow / postgres 지원. PostgreSQL runtime 지원 ≠ Production 전환 완료
- AI: Anthropic/Gemini/Groq 지원 (provider key 없어도 core 기능 동작)

## 불변원칙 (중요)
- 코드 구현 완료 ≠ Production 활성화 완료
- Repository 상태만으로 현재 Production 상태 추측 금지 (직접 검증 우선)
- Worker/Business tenant 데이터 자동 연결 금지
- External Advisor를 Organization Membership으로 자동 승격 금지
- Legal Rule을 AI/scheduler가 자동 승인·ACTIVE 처리 금지
- PERSISTENT_STORAGE=1은 실제 검증 완료 선언, 단순 flag 아님
- Production secret 값은 코드/문서/대화에 기록 금지
- PostgreSQL cutover 후 단순 SQLite로 되돌리기 금지

## 남은 P0 작업
- PostgreSQL Production cutover (migration, semantic validation, cutover-check)
- Persistence 검증 (restart/redeploy survival, backup, restore rehearsal)
- Production email (Resend, SPF/DKIM, magic-link/invitation 검증)
- 배포 검증: main HEAD = 배포 SHA = /api/readiness build.commit 일치 확인
- rollback SHA 및 DB 복구 지점 확보

## 배포 기준
npm ci → npm run check → npm run content:check → npm run deployment:check → npm run release:check
release:check 실패 SHA는 Production 후보 불가.

## 제품 고도화 로드맵 (내부 품질 부채)
2026-09-03 코드 감사 기준. Predeploy RC의 "새 기능 금지" 원칙과 별개인 기존 코드 정리 트랙 — PostgreSQL cutover 등 P0 운영 작업을 막지 않는 선에서 병행 가능.

**API 응답 표준화**
- 성공 응답 포맷을 하나로 통일 (현재 ok-wrapper / bare-object / key-wrapper 5종 혼재)
- 에러 응답에 requestId를 도메인 라우터까지 일괄 포함 (현재 중앙 바운더리만 포함)
- [완료 2026-09-03] saas-*-routes.js 5개 파일의 errorCode() 중복 제거 → lib/error-utils.js. errorStatus()는 구조(if-체인)만 createErrorStatusResolver(rules)로 공용화하고, 각 파일의 매핑표는 그대로 유지(동작 100% 보존, npm test 통과 확인)
- "반환값 검사형"과 "throw/catch형" 중 하나를 표준 관용구로 문서화
- **발견된 버그 후보**: external-advisor-collaboration 서비스가 이메일 설정 여부(saas-email-routes vs saas-advisor-collaboration-routes 라우팅 분기)에 따라 동일 에러 코드에 다른 HTTP status를 반환함 — 별도 버그 수정 작업 필요

**입력 검증 계층**
- 이메일 검증처럼 3곳 이상 중복된 취약 로직부터 단일 validator 모듈로 통합
- business-case-contract.js의 normalize 패턴을 Worker Core 5 facts / public-operation 자유 텍스트로 확장
- 스키마 검증 라이브러리 도입 여부는 별도 결정 사항으로 남김 (현재 미도입)

**디자인 시스템 통합**
- app.css / case-ui.css / saas-ui.css / product-ui.css 4개 독립 토큰 세트를 단일 계약으로 통합
- 동일 토큰명(--ink-700 등)의 값 드리프트부터 우선 정리
- @font-face 중복 3곳 → 1곳
- app.css의 테이블→카드 반응형 규칙을 공용 컴포넌트로 승격

**접근성 커버리지 확장**
- admin.html / partner.html / business-close.html에 *-detail.js급 접근성 레이어 추가
- 탭·모달이 있는 페이지의 키보드 포커스 순서를 명시적으로 검증

**보안 — 정적 파일 노출**
- **발견된 버그 후보**: CLAUDE.md(및 잠재적으로 다른 루트 마크다운 파일)가 public-static 블랙리스트 방식 때문에 Production에서 공개 다운로드 가능 — 노출 방식을 화이트리스트로 전환하거나 민감 문서를 .claude/ 하위로 이동 검토 필요

**착수 조건**
- PostgreSQL cutover, production email, exact-SHA smoke 등 기존 P0 항목을 선행
- 이 트랙은 신규 기능이 아니라 기존 동작의 표면적 정리이므로 Core Case/Legal 로직 자체는 변경하지 않는다
