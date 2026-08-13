# 인사야 Repository Refactor Plan

> 기준일: 2026-08-14
> 목표: 현재 기능을 깨뜨리지 않으면서 제품 개발에 적합한 저장소 구조로 점진적으로 정리한다.

## 1. 기본 원칙

1. `main`은 항상 배포 가능한 기준 브랜치다.
2. 현재 기능을 보존하고 구조만 단계적으로 개선한다.
3. 프레임워크 전면 교체를 첫 작업으로 하지 않는다.
4. 거대한 파일은 한 번에 쪼개지 않고 테스트를 만든 뒤 도메인별로 이동한다.
5. 생성물과 원본 데이터를 구분한다.
6. 제품 방향 문서와 과거 아이디어 문서를 구분한다.
7. 법률 데이터·계산식·문서양식은 UI 파일에 종속시키지 않는다.

---

## 2. 현재 구조의 주요 문제

### 루트 문서 과밀

루트에 제품기획·디자인·콘텐츠·벤치마크·운영·런칭 문서가 다수 존재하며 서로 작성 시점이 다르다.

### 대형 단일 프론트

`index.html`이 SPA 화면, 콘텐츠, 계산기, 다수 UI 로직의 중심이다.

### 콘텐츠 원본과 앱 결합

현재 정적 SEO 빌드는 앱 내부 콘텐츠를 추출해 페이지를 생성한다. SEO 생성 방식은 유용하지만 원본 콘텐츠가 UI와 결합돼 있다.

### 서버 집중

`server.js`가 여러 API 책임을 담당하고 `lib/docs.js`도 큰 파일이다. 기능 증설 시 영향 범위가 넓어진다.

### 테스트 기준 부족

기능별 검증 기록은 존재하지만 저장소 수준의 자동 품질 게이트가 부족하다.

---

## 3. 목표 구조

최종 목표는 아래와 같은 책임 분리다. 이름은 구현 과정에서 일부 조정할 수 있다.

```text
hrmanager/
├─ README.md
├─ package.json
├─ package-lock.json
├─ render.yaml
├─ .env.example
├─ .gitignore
│
├─ src/
│  ├─ app/
│  │  ├─ cases/
│  │  ├─ calculators/
│  │  ├─ documents/
│  │  ├─ guides/
│  │  └─ experts/
│  │
│  ├─ server/
│  │  ├─ routes/
│  │  ├─ middleware/
│  │  └─ services/
│  │
│  ├─ ai/
│  │  ├─ prompts/
│  │  ├─ classifiers/
│  │  └─ schemas/
│  │
│  ├─ legal/
│  │  ├─ constants/
│  │  ├─ rules/
│  │  ├─ calculators/
│  │  └─ sources/
│  │
│  └─ shared/
│
├─ content/
│  ├─ guides/
│  ├─ seo/
│  └─ legal/
│
├─ public/
│  └─ assets/
│
├─ data/
├─ scripts/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ regression/
│  └─ smoke/
│
└─ docs/
   ├─ PRODUCT_PLAN_1.0.md
   ├─ STATUS.md
   ├─ REPO_REFACTOR_PLAN.md
   ├─ ARCHITECTURE.md
   └─ archive/
```

이 구조를 한 번에 만들지 않는다.

---

## 4. 문서 정리

### 유지할 최상위 기준

- `README.md` — 실행·배포·프로젝트 소개
- `docs/PRODUCT_PLAN_1.0.md` — 제품 방향
- `docs/STATUS.md` — 실제 구현 현황
- `docs/REPO_REFACTOR_PLAN.md` — 구조 개선 순서
- 향후 `docs/ARCHITECTURE.md` — 실제 아키텍처

### 기존 문서

다음 문서는 바로 삭제하지 않는다.

```text
BENCHMARK.md
CLAUDE.md
CONTENT.md
DESIGN.md
HARVEST.md
LAUNCH.md
MASTERPLAN.md
OPERATIONS.md
PAGES.md
POLISH.md
PRODUCT.md
UPGRADE.md
기획-어시스턴트전환.md
```

처리 순서:

1. 유효한 내용 확인
2. 최신 제품 문서와 충돌 여부 판정
3. 필요한 세부 스펙으로 승격
4. 역할이 끝난 원문은 `docs/archive/legacy-planning/`으로 이동
5. 루트에서는 제거

---

## 5. Git 운영 규칙

### main

- Production source of truth
- 항상 실행 가능
- 직접적인 실험용 변경 금지

### 개발 브랜치

예:

```text
feat/case-foundation
feat/wage-case
refactor/frontend-shell
refactor/legal-rules
test/product-regression
fix/booking-persistence
```

작업 단위는 가능하면 하나의 명확한 목적만 가진다.

### 작업 완료 조건

- 코드 변경
- 관련 테스트
- 필요한 문서 변경
- 배포 영향 확인

이 네 가지를 한 세트로 본다.

---

## 6. Refactor Phase A — 안전망 먼저

구조를 옮기기 전 자동 검증부터 만든다.

목표 명령:

```bash
npm run check
npm test
```

최소 검사:

- 서버 시작 가능
- `/api/health`
- 핵심 API smoke
- 정적 사이트 build
- 대표 계산기 산식
- 대표 문서 생성
- SQLite 기본 CRUD
- 대표 Case flow(구현 후)

GitHub Actions에서 push/PR마다 실행되도록 한다.

---

## 7. Refactor Phase B — 프론트 분리

### 1단계

거대한 `index.html`에서 변경 위험이 낮은 부분부터 분리한다.

```text
public/assets/css/
public/assets/js/
```

대상:

- 공통 디자인 토큰
- 공통 UI 스타일
- 독립 유틸리티

### 2단계

제품 도메인별 JS 분리:

```text
src/app/calculators/
src/app/documents/
src/app/guides/
src/app/experts/
```

### 3단계

Case 제품 UI를 새 구조에 먼저 구현하고 기존 기능을 하나씩 연결한다.

### 하지 않을 것

초기 단계에서 React/Next.js로 전체 재작성하지 않는다.

프레임워크 전환은 현재 구조를 분리한 뒤 필요성이 명확할 때 별도 결정한다.

---

## 8. Refactor Phase C — Legal / Calculator 분리

가장 중요한 기술적 목표 중 하나다.

### 현재 문제

법률 수치·규칙·설명이 여러 UI/프롬프트/콘텐츠에 흩어질 가능성이 있다.

### 목표

```text
src/legal/constants/
src/legal/rules/
src/legal/calculators/
src/legal/sources/
```

예:

```text
minimumWage(year)
severance(input)
weeklyHolidayPay(input)
overtimePay(input)
annualLeave(input)
```

각 결과는 단순 숫자뿐 아니라 다음 메타데이터를 반환할 수 있어야 한다.

```text
result
formula
assumptions
legalBasis
source
validFrom
warnings
```

AI와 UI는 이 결과를 소비한다.

---

## 9. Refactor Phase D — Content Source 분리

정적 SEO 페이지 생성 시스템은 유지한다.

바꿀 것은 원본이다.

### 목표

```text
content/guides/*.json 또는 *.js
content/calculators/*.json
content/legal/*.json
        ↓
앱 UI
        +
정적 SEO build
```

같은 내용의 두 복사본을 관리하지 않는다.

콘텐츠 변경 후 build가 생성물을 갱신한다.

---

## 10. Refactor Phase E — Server 도메인 분리

한 번에 `server.js`를 재작성하지 않는다.

점진적으로 다음 책임을 이동한다.

```text
src/server/routes/chat.js
src/server/routes/cases.js
src/server/routes/documents.js
src/server/routes/experts.js
src/server/routes/admin.js

src/server/services/case-service.js
src/server/services/document-service.js
src/server/services/expert-service.js
```

기존 endpoint contract를 유지하면서 내부만 이동한다.

---

## 11. 신규 핵심 도메인 — Case

제품 기획에 맞춰 새 도메인을 추가한다.

개념 모델:

```text
Case
├ id
├ type
├ audience
├ status
├ createdAt
├ updatedAt
├ facts
├ missingFacts
├ issues
├ assessments
├ calculations
├ evidence
├ deadlines
├ actions
├ documents
├ sources
└ expertHandoff
```

Case는 단순 AI 대화 로그가 아니다.

대화 로그가 없어도 현재 사건 상태를 이해할 수 있는 구조여야 한다.

---

## 12. DB 방향

현재 SQLite 기반을 당장 교체하지 않는다.

먼저:

- Case 데이터 모델 추가
- migration 체계 정리
- 운영 데이터 영속성 확보
- 백업/복구 절차 확정

이후 실제 트래픽·운영 요구가 SQLite 범위를 넘을 때 PostgreSQL 등으로 이동한다.

저장소 레이어를 유지해 DB 교체 비용을 낮춘다.

---

## 13. 우선순위

### 지금 바로

1. 제품 기준 문서 확정
2. 현재 구현 감사
3. 문서 archive 계획
4. 테스트/CI 설계
5. Case Schema 설계

### 그 다음

6. Case Workspace 와이어프레임
7. 임금체불 Case 구현
8. Legal/Calculator 모듈 분리 시작
9. 프론트 공통 CSS/JS 분리
10. 핵심 5개 Case 확대

### 나중

11. 콘텐츠 원본 완전 분리
12. Admin 리디자인
13. 사업주 제품 고도화
14. 노무사 Portal
15. 필요 시 프론트 프레임워크 재평가

---

## 14. 완료 상태의 저장소 기준

제품화가 진행된 저장소는 다음 특징을 가져야 한다.

- 루트에서 무엇을 실행해야 하는지 즉시 이해된다.
- 최신 제품 문서가 무엇인지 명확하다.
- 콘텐츠를 수정할 위치가 명확하다.
- 계산식을 수정할 위치가 명확하다.
- 법정수치를 수정할 위치가 하나다.
- API route의 책임이 명확하다.
- 핵심 기능은 자동 테스트된다.
- 생성물과 원본이 구분된다.
- `main`은 언제든 배포할 수 있다.

이 상태를 인사야 1.0 개발 저장소의 기준으로 삼는다.
