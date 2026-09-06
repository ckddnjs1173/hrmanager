# 인사야 Case-first IA/UX 개편 기획서
기준일: 2026-09-06

## 0. 문서 성격

이 문서는 이번 인사야 Case-first IA/UX 개편의 제품 요구사항이다.

구현자는 이 문서의 제품 방향을 임의로 변경하지 않는다.
불명확한 세부 구현은 최신 GitHub main의 현재 구조와 테스트를 확인한 뒤,
기존 기능과 보안 경계를 가장 적게 건드리는 방식으로 결정한다.

Canonical Repository:
ckddnjs1173/hrmanager

Canonical Branch:
main

현재 확인된 main HEAD:
6a0c03ca6e032ab510278ca88ca6bfd4b3beb0a1

주의:
과거 CURRENT 문서의 SHA는 더 오래된 상태일 수 있다.
제품/코드 판단은 최신 GitHub main을 우선한다.

---

# 1. 제품 핵심 원칙

## 1.1 Case-first

인사야의 중심 객체는 Case다.

사용자의 실제 목적은 특정 허브를 탐색하는 것이 아니라,
자신이 겪는 노동문제를 이해하고 해결하는 것이다.

따라서 제품의 메인 흐름은 다음이다.

사용자 문제
→ AI 상담
→ 사실관계 구조화
→ 쟁점 파악
→ Rule / Legal / 계산 / 다음 행동
→ 직접 해결 또는 전문가 도움

근로자, 사업주, 노동생활 도구, 노무사 찾기는
Case-first 흐름을 보조하는 탐색 경로다.

---

## 1.2 AI / Rule / 전문가 역할 분리

AI:
- 자연어 상담
- 사실 수집
- 상황 구조화
- 쟁점 분류

Rule / Legal:
- 법정 숫자
- 법정 기한
- 명확한 법률 적용 판단
- 사건 발생일 기준의 법령 version 적용

전문가:
- 복잡한 사실관계
- 전략적 판단
- 분쟁 대응
- 고위험 사건
- 인간 검토가 필요한 문제

“모든 최종 판단은 전문가가 한다”는 구조로 만들지 않는다.

---

## 1.3 전문가 연결 원칙

인사야는 특정 노무사를 추천하지 않는다.

사용자는 노무사를 검색·필터·비교하고 직접 선택한다.

사용 금지 표현:
- 추천 노무사
- 가장 좋은 노무사
- AI 추천 전문가
- 최적 노무사 추천

권장 표현:
- 노무사 찾기
- 노무사 비교
- 조건에 맞는 노무사
- 상담 가능한 노무사

---

# 2. 전체 사용자 흐름

## 2.1 기본 흐름

사용자 문제 입력
→ AI 상담
→ 상황 구조화
→ 핵심 쟁점
→ 예상 금액/법적 기준/다음 행동
→ 다음 경로 선택

A. 직접 해결
- Case
- 계산
- 문서
- 가이드
- 공식 절차

B. 전문가 도움
- “상담 가능한 노무사를 찾아볼까요?”
- 검색·필터·비교
- 사용자가 직접 선택

---

## 2.2 전문가 연결 UX

사용하지 말 것:

AI
→ 전문가 필요 판정
→ 추천 노무사

권장 구조:

AI 상담
→ 상황 정리
→ Rule / Legal 결과
→ 다음 행동

전문가 상담이 도움이 되는 조건일 경우:

“이 문제는 전문가와 함께 검토하면
더 안전하게 진행할 수 있습니다.”

CTA:

[상담 가능한 노무사 찾아보기]
[먼저 직접 해결해보기]

전문가 연결은 LLM의 단독 블랙박스 판단에만 의존하지 않는다.

---

# 3. Global Navigation

## 3.1 Desktop

[인사야]
근로자
사업주
노동생활 도구
노무사 찾기
[AI 상담]

AI 상담은 Primary CTA다.

각 영역에서 다른 영역으로 직접 이동할 수 있어야 한다.
허브 전환을 위해 홈으로 강제로 돌아가게 만들지 않는다.

---

## 3.2 Mobile

[인사야] [AI 상담] [menu]

menu:
- 근로자
- 사업주
- 노동생활 도구
- 노무사 찾기

모바일에서도 AI 상담 진입은 항상 쉽게 보여야 한다.

---

# 4. Home

Home은 기능 백화점이 아니라 문제 해결 진입점으로 만든다.

권장 구조:

## Hero

인사·노무 문제,
어디서부터 해야 할지 모르겠다면

AI가 먼저 상황을 정리해 드립니다.

[내 상황 이야기하기]

보조 문구:
임금체불 · 해고 · 퇴직금 · 근로시간 · 연차 등

---

## 사용자 유형

나는...

[근로자입니다]
내 권리와 문제 해결

[사업주입니다]
회사 운영과 노무 리스크 관리

---

## 바로 필요한 도구

- 계산기
- 문서·서식
- 노동청·공식 절차
- 노동법 가이드

---

## 전문가 도움이 필요하다면

노무사 찾기·비교

---

기존 계산기, 문서, 가이드는 삭제하지 않는다.
홈에서 전부 나열하지 않을 뿐이다.

---

# 5. Worker

Worker canonical 범위는 Core 5다.

- 임금체불
- 해고·권고사직
- 퇴직금·퇴직연금
- 근로시간
- 연차

기본 흐름:

Case 생성
→ Facts
→ Legal / Rule
→ 계산 또는 핵심 판단
→ Evidence
→ Next Action
→ 공식 근거
→ Document
→ 공식기관 절차

기존 Worker Case 자산을 우선 재사용한다.

---

# 6. Business

## 6.1 중요한 구분

사업주 메뉴와 Business SaaS Workspace를 동일시하지 않는다.

상단 “사업주” 메뉴는 공개 진입 페이지다.

실제 Business Workspace는 인증 및 SaaS 상태에 따라 별도 접근한다.

---

## 6.2 공개 Business Landing

공개 페이지에서 제공:

- 사업주용 AI 상담 진입
- 사업주용 노동생활 도구 진입
- Business Workspace 소개
- 주요 기능 설명
- 로그인 또는 Workspace 진입 CTA

기능 예:
- 노동법 리스크 점검
- 해야 할 조치
- Compliance Calendar
- 직원 관리
- 외부 노무전문가 협업

활성화되지 않은 SaaS 기능을
현재 사용할 수 있는 기능처럼 오인시키지 않는다.

---

## 6.3 Business 4등급

### A. 공개
- Business 소개
- 사업주용 가이드
- AI 상담 진입
- 계산기/문서/도구 진입

### B. 로그인 후
- Dashboard
- Risk
- Action
- Calendar
- Notifications
- People
- Organization Setup

### C. SaaS 활성화 필요
- Organization 기반 실제 저장
- Production magic-link
- External Advisor Collaboration
- 실제 invitation/email flow

### D. 공개 비노출
- debug token
- 내부 개발 흐름
- admin
- 운영자 전용 기능

---

# 7. 노동생활 도구

사용자-facing 이름:

노동생활 도구

포함:

- 계산기
- 문서·서식
- 노동청/공식 절차
- 노동법 가이드

기존 기능을 중복 구현하지 않는다.
기존 기능으로 연결한다.

사용자 유형에 따라
근로자/사업주 화면에서도 관련 도구를 노출할 수 있다.

---

# 8. 노무사 찾기

## 8.1 현재 P0 문제

현재 공개 고지:
입점(광고)
→ 자격확인
→ 지역·분야

현재 코드에서는 이 기준과 실제 정렬이 일치하지 않을 수 있다.

확인된 현재 main 구조:
- SQLite: featured 우선
- PostgreSQL: featured DESC, name
- Frontend: 지역/분야는 필터 중심

따라서 고지와 구현을 반드시 일치시킨다.

---

## 8.2 권장 정렬 정책

일반 디렉터리 기준:

1. sponsored / featured
2. verified
3. selected region
4. selected field

스폰서는 반드시 명확히 표시한다.

정렬 정책은:
- SQLite
- PostgreSQL
- Frontend
- UI 고지

모두 동일해야 한다.

가능하면 regression test를 추가한다.

---

## 8.3 사용자 표현

사용 금지:
- 추천 노무사
- AI 추천
- 최적 추천

사용:
- 노무사 찾기
- 노무사 비교
- 조건에 맞는 노무사
- 상담 가능한 노무사

최종 선택은 사용자에게 있다.

---

# 9. 상담 종료 후 전문가 연결

상담 결과 화면에서
노무사 찾기를 다른 여러 CTA와 섞어 묻지 않는다.

전문가 상담이 도움이 되는 경우
분리된 다음 단계로 보여준다.

예:

이 문제는 전문가와 함께 검토하면
더 안전하게 진행할 수 있습니다.

[상담 가능한 노무사 찾아보기]
[먼저 직접 해결해보기]

직접 해결 경로에서는:
- 계산
- 문서
- 공식 절차
- Case 계속 관리

로 이어진다.

---

# 10. UI 원칙

기존 디자인 시스템을 최대한 재사용한다.

새 UI framework를 도입하지 않는다.

현재 HTML / CSS / Vanilla JS 구조를 유지한다.

확인 대상:
- Desktop
- Tablet
- Mobile
- keyboard navigation
- focus-visible
- aria
- reduced motion
- overflow
- sticky nav
- modal/dialog
- empty state
- disabled state

불필요한 장식성 애니메이션을 추가하지 않는다.

---

# 11. 기존 기능 보존

특별한 이유 없이 삭제하지 않는다.

- 계산기
- 문서
- 가이드
- Worker Case
- Business
- Advisor
- Legal
- Admin
- SEO
- analytics/events
- booking
- lead
- security boundary

기존 URL은 가능한 범위에서 유지한다.

---

# 12. 구현 우선순위

Phase 0
현재 코드 감사

Phase 1
노무사 정렬 P0

Phase 2
Global navigation / IA shell

Phase 3
Home

Phase 4
Worker entry

Phase 5
Business public landing

Phase 6
Labor tools

Phase 7
Nomusa UX

Phase 8
AI completion flow

Phase 9
Responsive / accessibility

Phase 10
Regression / test

---

# 13. 테스트 기준

package.json에 실제 존재하는 script만 실행한다.

가능하면:
- npm test
- npm run check
- npm run content:check
- npm run deployment:check
- npm run release:check

관련 E2E가 있다면 실행한다.

특히 확인:
- Worker Core 5
- Home
- Global Navigation
- Calculator
- Documents
- Nomusa
- Business disabled state
- Business login state
- Business workspace regression
- Advisor
- SEO
- mobile
- accessibility

기존 unrelated failure와
이번 변경으로 발생한 failure를 구분한다.

테스트를 통과시키기 위해
테스트나 안전장치를 삭제하거나 skip하지 않는다.

---

# 14. Git / 배포 경계

이번 작업은 별도 feature branch에서만 진행한다.

권장 branch:
feat/case-first-ia

허용:
- fetch
- branch 생성
- 로컬 수정
- 테스트
- local commit

금지:
- main 직접 commit
- main merge
- Production deploy
- Render 설정 변경
- Production DB 변경
- Production secret 변경
- SAAS_ENABLED 변경
- PERSISTENT_STORAGE 변경
- destructive migration
- force push

push는 필요 시 가능하나,
main merge는 별도 검토 후 진행한다.

---

# 15. 완료 조건

아침 시점 목표:

- feature branch 존재
- 구현 완료
- 관련 테스트 실행
- 실패 원인 기록
- local commit 완료
- main untouched
- Production untouched

최종 보고에는 반드시:

1. 시작 HEAD
2. 작업 branch
3. 변경 파일
4. 변경 내용
5. 변경 이유
6. 노무사 정렬 처리 결과
7. Business 4등급 처리 결과
8. 실행 테스트
9. 성공 테스트
10. 실패 테스트
11. 기존 실패 여부
12. commit SHA
13. git status
14. push 여부
15. merge 여부
16. Production 배포 여부
17. 남은 위험
18. 미확인 사항

을 포함한다.