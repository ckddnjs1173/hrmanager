# 인사야 현재 구현 현황

> 기준일: 2026-08-15
> 목적: 과거 기획문서의 TODO가 아니라 현재 `main` 코드와 배포 구조를 기준으로 개발 우선순위를 판단한다.

상태: ✅ 구현 / 🟡 부분 구현·확장 필요 / 🔴 핵심 미구현 / 🔍 재검증

## 1. 현재 제품 자산

| 영역 | 상태 | 판단 |
|---|---:|---|
| Render 배포 구조 | ✅ | Blueprint와 health check, auto deploy 구성 존재 |
| AI 상담 | ✅ | 상담 시작·스트리밍·요약 흐름 존재 |
| 상황별 해결 | ✅ | 대표 노동사건별 연결 흐름 존재 |
| 계산기 | ✅ | 배포본 27종 |
| 문서센터 | ✅ | 배포본 24종 + 문서팩 |
| 가이드/SEO | ✅ | 다수 가이드와 정적 페이지 존재 |
| 노무사 찾기 | ✅ | 검색·목록·상담 연결 기능 존재 |
| 상담 요약 | ✅ | 전문가 전달 전 요약 흐름 존재 |
| 운영자 화면 | ✅ | 운영 기능 존재 |
| SQLite | ✅ | `lib/db.js`, `lib/repo.js` 기반 저장 구조 존재 |
| Case 데이터 모델 | ✅ | `cases`, `case_events`, 계산·근거·문서 필드 구현 |
| Case 접근 보호 | ✅ | 고엔트로피 토큰, 해시 저장, 7일 기본 만료, 폐기 구현 |
| Case 보존 정책 | ✅ | 방치 Case 30일, 삭제 Case 7일 기본 자동 파기 |
| 보호 Case API | ✅ | 생성·조회·수정·삭제 및 문서·리포트 접근제어 |
| 자동 테스트/CI | ✅ | Node 테스트 + build + release gate를 PR/main에서 실행 |
| 임금체불 Intake | ✅ | 필수·조건부 사실, 질문 순서, 쟁점, 증거 상태 |
| 임금체불 Money | ✅ | 미지급 원금·최저임금 기준·가산 추정·지연이자 baseline |
| 임금체불 Legal Versioning | ✅ | 사건 기간 기준 2023~2026 최저임금 버전 및 공식 출처 baseline |
| 임금체불 Workspace | ✅ | Money·근거·증거·Next Best Action·문서·공식절차 연결 |
| 임금체불 문서 연결 | ✅ | 기존 내용증명·노동청 진정서에 Case 값 프리필 |
| 임금체불 공식절차 | ✅ | 고용노동부 노동포털 진정 경로 연결 |
| 임금체불 Case Report | ✅ | 사실·금액·증거·근거·다음 행동을 텍스트로 내보내기 |
| 임금체불 Release Gate | ✅ | 필수 모듈·출처·토큰 저장방식·문서 안전 렌더 자동 검사 |
| 범용 Legal Versioning | 🟡 | 임금체불 vertical slice baseline만 구현. 전 노동사건 확대 필요 |
| 범용 Case Workspace | 🟡 | 임금체불 패턴은 완성, 다른 사건 공통화 필요 |
| 실제 브라우저 E2E | 🔴 | Node/API/UI 정적 검증은 있으나 실제 Chromium 사용자 여정 자동화 미구현 |
| 운영 DB 영속성 | 🔴 | Render 무료 플랜의 비영구 디스크에서 Case 장기 보존 불가 |

## 2. 임금체불 Vertical Slice 현재 여정

```text
홈
→ 임금체불 사건 시작
→ 보호 Case 생성 + 접근 토큰 발급
→ 사건 구분 / 날짜 / 급여 기준 Intake
→ Case Workspace
→ 추가 수당 가능성
→ Money 계산
→ 사건 기준일 법률 규칙 선택
→ 공식 근거 표시
→ 증거 체크
→ Next Best Action
→ 내용증명 / 노동청 진정서 초안
→ 고용노동부 공식 진정 절차
→ 사건 요약 복사
→ 사건 삭제 또는 보존기간 자동 파기
```

핵심 원칙은 기존 대형 `index.html`을 Big Bang 재작성하지 않고 `wage-intake-*`, `wage-workspace.*`, Case 도메인 모듈을 별도로 추가하는 점진 분리다.

## 3. 임금체불 Money / Legal 상태

### 구현된 Money baseline

- 전액 미지급 월급: 전체 달인 경우 월 기본급에서 이미 지급된 금액 차감
- 부분월·복합 임금: 임의 일할계산하지 않고 `expectedUnpaidAmount` 추가 입력 요구
- 시급: 미지급 근로시간이 있으면 원금 계산 가능
- 최저임금: 사건 기간에 해당하는 연도 규칙 선택
- 연장·야간·휴일 가산: 상시근로자 수와 통상시급·시간이 확보된 범위에서만 추정
- 퇴직 후 지연이자: 지원하는 법률 baseline과 사건 종료일이 맞을 때만 추정

### 구현된 Legal baseline

- AI가 법률 버전을 선택하지 않음
- `unpaidPeriodEnd` 등 사건 기준일로 Rule 선택
- 2023·2024·2025·2026 최저임금 버전 분리
- 공식 출처 URL·검증일을 Case에 저장/노출
- 지원 범위 밖 과거 연도는 현재 연도 값으로 자동 폴백하지 않음
- 퇴직 금품청산·지연이자·가산임금 관련 공식 근거 연결

### 아직 범용화하지 않은 부분

- 전 노동법 조문·시행령·행정해석의 연혁 DB
- 연차·퇴직금·해고 등 다른 사건의 버전 규칙
- 법령 API 자동 수집·개정 감지
- 판례·행정해석·노동위원회 결정문 기반 규칙 보강

따라서 현재 엔진은 **임금체불 vertical slice용 법률 버전 baseline**이며 전체 노동법 엔진 완료로 보지 않는다.

## 4. Case / 보안 / 개인정보 상태

구현 모듈:

- `lib/case-db.js`
- `lib/case-repo.js`
- `lib/case-access.js`
- `lib/case-retention.js`
- `lib/case-routes.js`
- `lib/wage-intake.js`
- `lib/wage-intake-service.js`
- `lib/wage-money.js`
- `lib/legal-rules.js`
- `lib/wage-actions.js`
- `lib/wage-resources.js`
- `lib/wage-report.js`

보안 원칙:

- Case ID 자체는 접근권한이 아니다.
- 별도 32-byte 랜덤 접근 토큰을 발급한다.
- 서버에는 토큰 평문이 아니라 SHA-256 hash만 저장한다.
- 브라우저는 `sessionStorage`에만 토큰을 저장한다.
- URL·`localStorage`에는 Case 토큰을 넣지 않는다.
- 기본 토큰 TTL은 7일이다.
- 오래 방치된 Case는 기본 30일 뒤 자동 완전삭제한다.
- 사용자가 삭제한 Case는 기본 7일 뒤 완전삭제한다.
- 생성 문서 미리보기는 서버 HTML을 주입하지 않고 plain text로 표시한다.

향후 로그인/계정 기반 `내 사건`을 만들 때는 이 토큰 모델을 계정 소유권 모델과 결합한다.

## 5. 문서 / 공식 절차 연결

임금체불 Case에서 현재 연결되는 문서:

- `certmail` — 내용증명(임금·퇴직금 청구)
- `complaint` — 노동청 진정서

Case가 가진 다음 값들을 가능한 범위에서 자동 반영한다.

- 근무기간
- 미지급 기간
- 미지급 항목
- 현재 계산 가능한 금액

공식 절차는 고용노동부 노동포털 임금체불 진정 경로를 안내한다.

문서·절차를 단순 링크 모음으로 두지 않고 Case의 현재 상태에서 이어지는 리소스로 취급한다.

## 6. 프론트엔드 상태

기존 `index.html` 중심 SPA는 유지하되 신규 Case 흐름은 독립 모듈화했다.

- `/wage-intake` 독립 진입 화면
- `wage-intake-client.js` — Intake / 기본 Workspace
- `wage-workspace.js` — Money / Sources / Documents / Procedure
- `wage-report-ui.js` — Case Report 복사
- `wage-intake.css`, `wage-workspace.css` — 신규 Case UI 스타일

이 방식은 전체 SPA rewrite 리스크를 피하면서 새 Case 제품 패턴을 검증하기 위한 의도적 구조다.

남은 프론트 과제:

- 실제 Chromium E2E
- 모바일 viewport E2E
- 다른 Case type 공통 컴포넌트화
- 레거시 `index.html`의 콘텐츠·계산 로직 단계적 분리

## 7. 테스트 / 품질 상태

현재 PR과 `main`의 CI는 다음 release gate를 실행한다.

```text
npm ci
npm run release:check
  └─ npm test
  └─ npm run build
  └─ scripts/release-check.mjs
```

현재 자동 검증 범위:

- 서버 boot / health / 홈 / `/wage-intake`
- Case Repository / 접근 토큰 보호
- 임금체불 Intake progression
- Next Best Action progression
- Legal Rule 연도 선택 및 unsupported-date 차단
- Money 계산 회귀
- 문서 프리필 및 보호 문서 API
- Workspace의 session-only token 저장
- 문서 plain-text preview
- Case Report
- Case token expiry
- Case retention
- 정적 SEO build
- release invariant 검사

남은 품질 과제:

1. 실제 Chromium E2E
2. 모바일 viewport 사용자 여정
3. 배포된 production smoke
4. AI fixture 기반 회귀 테스트
5. 다른 Case type별 법률/계산 회귀 테스트

## 8. 운영 DB 영속성

현재 가장 중요한 운영 인프라 미완료 항목이다.

Render Blueprint는 무료 web plan을 사용하고 있고 persistent disk가 활성화되어 있지 않다. 따라서 `data/app.db`를 사용하는 SQLite Case 데이터는 재배포·인스턴스 교체 과정에서 영구 보존을 보장할 수 없다.

코드의 보존기간·삭제정책과 별개로 **production에서 사건을 지속 보관하려면 영속 저장소가 필요**하다.

가능한 방향:

- Render persistent disk 사용
- 외부 관리형 DB로 이전
- 사용자 계정/Case 소유권 설계와 함께 별도 저장 계층 도입

비용이 발생할 수 있으므로 저장 인프라 전환은 코드에서 자동 활성화하지 않는다.

## 9. 개발 우선순위

### P0 — 제품 기반

- [x] Case 데이터 모델 baseline
- [x] 보호 Case API
- [x] Case 접근 토큰 만료
- [x] Case 보존/삭제 lifecycle
- [x] 자동 테스트/CI release gate
- [x] 임금체불 vertical slice code-level 완결
- [x] 임금체불 Money / Legal Versioning baseline
- [x] 임금체불 문서 / 공식 절차 / Case Report
- [ ] 실제 브라우저 E2E baseline
- [ ] production DB 영속성
- [ ] 범용 Case Workspace 모듈화
- [ ] 범용 Legal Versioning 확대

### P1 — 인사야 1.0 핵심 사건

| 사건 | 현재 상태 | 다음 핵심 작업 |
|---|---:|---|
| 임금체불 | ✅ code-level slice | 브라우저 E2E + production persistence 후 production-ready 판정 |
| 해고·권고사직 | 🔴 | Case template / Intake / 기한 / 구제절차 |
| 퇴직금 | 🔴 | Case template / 평균임금·퇴직금 Money |
| 근로시간·수당 | 🔴 | Case template / 근로시간·가산 rule |
| 연차 | 🔴 | Case template / 발생·사용·수당 rule |

모든 핵심 사건은 최종적으로 아래 공통 여정을 가져야 한다.

```text
상황정리
→ 판단
→ 계산
→ 증거
→ 기한
→ 문서
→ 공식절차
→ 전문가 연결
→ Case Report
```

## 10. 다음 구현 순서

1. 실제 Chromium + 모바일 E2E baseline
2. 임금체불 production smoke
3. production DB 영속성 방식 결정 및 적용
4. 공통 Case Workspace / Action / Resource 구조 추출
5. 해고·권고사직 Case 구현
6. 퇴직금 Case 구현
7. 근로시간·수당 Case 구현
8. 연차 Case 구현
9. AI 상담을 Case 생성/업데이트 인터페이스로 점진 연결
10. 전체 핵심 사건 회귀 테스트와 release gate 확대

## 11. 결론

임금체불은 이제 단순 Intake 데모가 아니다.

현재 코드 기준으로 다음 사이클이 닫혔다.

**Case 생성 → 구조화 Intake → Money → 사건 기준 Legal Rule → 공식 근거 → 증거 → Next Best Action → 문서 → 공식 절차 → Case Report → 보존/삭제 lifecycle**

따라서 임금체불 vertical slice는 **code-level release gate 통과 상태**다.

다만 인사야 전체 제품 개발이 끝난 것은 아니다. production-ready 판정에는 실제 브라우저 E2E와 영속 DB가 남아 있고, 이후 이 패턴을 해고·권고사직·퇴직금·근로시간·연차 사건으로 확장해야 한다.
