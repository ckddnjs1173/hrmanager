# 인사야 현재 구현 현황

> 기준일: 2026-08-15
> 목적: 과거 기획문서의 TODO가 아니라 현재 코드와 배포 구조를 기준으로 개발 우선순위를 판단한다.

상태: ✅ 구현 / 🟡 부분 구현·제품화 필요 / 🔴 핵심 미구현 / 🔍 재검증

## 1. 현재 제품 자산

| 영역 | 상태 | 판단 |
|---|---:|---|
| Render 배포 | ✅ | 현재 서비스 운영 구조 존재 |
| AI 상담 | ✅ | 상담 시작·스트리밍·요약 흐름 존재 |
| 상황별 해결 | ✅ | 대표 노동사건별 연결 흐름 존재 |
| 계산기 | ✅ | 배포본 27종 |
| 문서센터 | ✅ | 배포본 24종 + 문서팩 |
| 가이드/SEO | ✅ | 다수 가이드와 정적 페이지 존재 |
| 노무사 찾기 | ✅ | 검색·목록·상담 연결 기능 존재 |
| 상담 요약 | ✅ | 전문가 전달 전 요약 흐름 존재 |
| 운영자 화면 | ✅ | 운영 기능 존재 |
| SQLite | ✅ | `lib/db.js`, `lib/repo.js` 기반 저장 구조 존재 |
| 알림 구조 | ✅ | `lib/notify.js` 존재 |
| Case 데이터 모델 | ✅ | `cases`, `case_events`, Repository 구조 구현 |
| Case 접근 보호 | ✅ | 고엔트로피 접근 토큰 발급·해시 저장·검증·폐기 구현 |
| 보호 Case API | ✅ | Case 생성·조회·수정·삭제 API와 접근제어 테스트 구현 |
| 자동 테스트/CI | ✅ | Node test + build를 GitHub Actions에서 지속 검증 |
| 임금체불 Intake 도메인 | ✅ | 필수 사실·조건부 사실·질문 순서·쟁점·증거 상태 구현 |
| 임금체불 Intake API | ✅ | 사건 생성·진행·상태 재계산·부분 증거 업데이트 구현 |
| 임금체불 Case Workspace UI | ✅ | 홈 진입 → Intake → Workspace → 추가수당·증거·삭제 연결 |
| Next Best Action | 🟡 | 임금체불 서버 액션 플래너 구현 중. 다른 사건 공통화 필요 |
| 범용 Case Workspace | 🟡 | 임금체불 vertical slice는 존재하나 다른 핵심 사건으로 일반화 필요 |
| 운영 DB 영속성 | 🔴 | 현재 호스팅 환경에서 실제 운영 데이터 보존 방식 보강 필요 |
| 법률 규칙/버전 엔진 | 🔴 | 사건 발생일 기준 법령 버전·수치 단일 소스 미구현 |

## 2. 현재 첫 제품 여정

현재 임금체불 vertical slice는 다음 흐름까지 코드로 연결되어 있다.

```text
홈
→ 임금체불 사건 시작
→ 보호 Case 생성 + 접근 토큰 발급
→ 사건 구분
→ 날짜 확인
→ 금액 기준 확인
→ Core Facts 완료
→ Case Workspace
→ 추가 수당 가능성 확인
→ 증거 상태 정리
→ Next Best Action
→ 사건 수정 또는 삭제
```

이 흐름은 기존 대형 `index.html`을 전면 재작성하지 않고 별도 모듈과 전용 화면을 추가하는 방식으로 구현한다.

## 3. 프론트엔드 상태

기존 프론트는 여전히 `index.html` 중심의 대형 SPA이며 많은 UI·콘텐츠·계산 로직이 결합되어 있다.

다만 제품화 작업에서는 전면 재작성 대신 다음 방식으로 점진 분리를 시작했다.

- 기존 홈은 유지한다.
- `/` 응답에 제품 전환용 launcher module만 주입한다.
- 첫 신규 Case 화면은 `/wage-intake` 독립 페이지로 분리했다.
- 신규 화면의 CSS·클라이언트 로직도 별도 파일로 분리했다.
- 기존 `상황별 해결 > 임금체불` 진입을 새 Case 흐름으로 연결한다.

남은 제품화 문제:

- 임금체불 외 사건은 기존 SPA 흐름에 남아 있다.
- 공통 Case Workspace 컴포넌트가 아직 없다.
- 모바일·접근성·브라우저 실제 E2E 검증을 더 강화해야 한다.
- 기존 기능별 디자인 패턴과 신규 Case 디자인 시스템을 단계적으로 통합해야 한다.

## 4. Case / 보안 상태

구현 완료:

- `lib/case-db.js`
- `lib/case-repo.js`
- `lib/case-access.js`
- `lib/case-routes.js`
- `lib/wage-intake.js`
- `lib/wage-intake-service.js`
- `lib/wage-actions.js`

Case ID 자체를 접근 권한으로 사용하지 않는다.

사건 생성 시 별도 고엔트로피 접근 토큰을 발급하고, 서버에는 해시만 저장한다. 조회·수정·삭제는 토큰 검증을 통과해야 한다.

현재 임금체불 UI는 접근 토큰을 `sessionStorage`에만 보관한다. URL이나 `localStorage`에는 넣지 않는다.

향후 로그인/계정 기반 `내 사건`을 구현할 때는 현재 토큰 모델을 소유권 모델과 결합해야 한다.

## 5. AI / 법률지식 상태

현재 자산:

- `lib/ai.js`
- `lib/prompt.js`
- `lib/knowledge.js`
- 상담 중 계산기 연동
- Case Intake를 AI와 분리한 deterministic domain layer

핵심 위험:

현재 법률 grounding 일부는 2026 현재 기준 중심이다. 노동사건은 사건 발생일에 따라 적용 법령·수치가 달라질 수 있으므로 단순한 “현재 연도 기준”은 제품 수준에서 충분하지 않다.

제품화 필요:

- `eventDate` 기반 법률 버전 선택
- 법률 규칙/법정수치/적용일의 단일 소스
- 핵심 사건 AI 회귀 테스트
- Case Report 구조화
- AI는 사실 추출·설명에 집중하고 법률 계산·상태 판단은 deterministic engine과 분리

## 6. 계산기 상태

강점:

- 27종 계산기
- 상담 중 다수 계산기 자동 감지
- 일부 계산 결과 → 문서 자동채움
- 계산기 SEO 페이지

제품화 필요:

- 계산 로직을 UI에서 분리
- 핵심 산식 자동 회귀 테스트
- Case 데이터와 계산 결과 연결
- 법정 수치 중앙관리
- 임금체불 Workspace의 Money 영역 연결

계산기 수를 더 늘리는 것은 현재 우선순위가 아니다.

## 7. 문서 상태

강점:

- 문서센터 24종
- 문서팩
- 서버 문서 렌더 구조
- 일부 계산 결과 프리필

제품화 필요:

- Case 데이터 자동 반영
- 문서별 모듈 분리
- 공식양식 출처·개정일·버전 관리
- 사건 해결 단계에서 필요한 문서를 자동 제시

## 8. 콘텐츠 / SEO 상태

강점:

- 다수 노동 가이드
- `articles/*.html` 정적 페이지
- 계산기 SEO 페이지
- sitemap / robots / 구조화데이터
- 다양한 콘텐츠 블록

제품화 필요:

- 콘텐츠 원본을 거대한 UI 파일에서 분리
- 법률 기준일·출처 중앙관리
- 검색 유입 콘텐츠와 Case 전환 연결 강화

정적 SEO 생성 구조 자체는 유지할 자산이다.

## 9. 테스트 / 품질 상태

현재 CI는 `main` push와 PR에서 다음을 실행한다.

```text
npm ci
node --test
npm run build
```

현재 테스트 범위에는 다음이 포함된다.

- 문서 catalog smoke test
- 노동지식 분류 smoke test
- Summary schema baseline
- 실제 서버 기동 및 `/api/health`
- 실제 서버 홈 launcher 주입
- 실제 서버 `/wage-intake` 응답
- Case Repository
- Case access token 보호 API
- 임금체불 Intake domain
- 임금체불 Intake API progression
- 제품 홈 script injection
- Wage UI asset/security checks
- 임금체불 Next Best Action domain/API progression

향후 필요:

- Playwright 등 실제 브라우저 E2E
- 모바일 viewport 회귀 테스트
- 계산기 기준값 회귀 테스트
- AI fixture 기반 회귀 테스트
- production smoke test

## 10. 개발 우선순위

### P0 — 제품 기반

- [x] Case 데이터 모델 baseline
- [x] 보호 Case API
- [x] 자동 테스트/CI baseline
- [x] 첫 Case Workspace vertical slice
- [ ] 범용 Case Workspace 모듈화
- [ ] 운영 데이터 영속성
- [ ] 법률 규칙/수치 중앙관리 및 버전 엔진
- [ ] 브라우저 E2E baseline

### P1 — 인사야 1.0 핵심 사건

| 사건 | 현재 상태 | 다음 핵심 작업 |
|---|---:|---|
| 임금체불 | 🟡 | Money 계산·법률 근거·행동계획·문서·공식절차 연결 |
| 해고·권고사직 | 🔴 | Case template / Intake부터 구현 |
| 퇴직금 | 🔴 | Case template / Intake부터 구현 |
| 근로시간·수당 | 🔴 | Case template / Intake부터 구현 |
| 연차 | 🔴 | Case template / Intake부터 구현 |

각 사건은 최종적으로 `상황정리 → 판단 → 계산 → 증거 → 기한 → 문서 → 공식절차 → 전문가 연결`이 끝까지 이어져야 한다.

### P2 — 확장

- [ ] 사업주 제품 고도화
- [ ] 노무사 Portal 고도화
- [ ] 입점/구독
- [ ] 콘텐츠 관리 고도화

## 11. 다음 구현 순서

1. 임금체불 Next Best Action 서버 일원화 완료
2. 임금체불 Money 영역을 기존 계산 엔진과 연결
3. 사건 발생일 기반 Legal Versioning baseline 구현
4. 임금체불 Sources / Actions / Documents 연결
5. 실제 브라우저 E2E 추가
6. 임금체불 vertical slice release gate 통과
7. 해고·권고사직 Case로 확장

## 12. 결론

인사야는 이제 기능 모음에서 Case 기반 제품으로 이동하기 시작했다.

첫 임금체불 vertical slice를 통해 **Case 생성 → 구조화 Intake → 상태 저장 → Workspace → 증거·추가수당 → Next Best Action**이라는 공통 제품 패턴이 만들어지고 있다.

다음 단계의 핵심은 새 기능을 더 늘리는 것이 아니라 이 Case 패턴에 기존 계산·법률근거·문서·공식 절차를 연결해 실제 문제 해결 완결성을 높이는 것이다.
