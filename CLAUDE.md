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
