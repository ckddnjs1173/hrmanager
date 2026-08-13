# 인사야 — AI 노동문제 해결 서비스

**Production:** https://insaya.onrender.com/

인사야는 근로자·사업주가 노동문제를 설명하면 상황을 정리하고, 필요한 계산·증거·문서·공식 절차·전문가 상담까지 이어주는 서비스입니다.

현재 기능을 계속 증설하기보다 **인사야 1.0 제품화**를 진행하고 있습니다. 제품의 중심은 독립 도구 모음이 아니라 하나의 노동문제를 끝까지 관리하는 **Case(내 사건)** 입니다.

## 현재 주요 기능

- AI 노무 상담
- 상황별 해결 흐름
- 계산기 27종
- 노무 문서 24종 + 문서팩
- 노동 가이드 및 정적 SEO 페이지
- 노무사 정보 검색
- 상담 요약 및 전문가 전달 흐름
- 운영자 화면
- SQLite 기반 예약·리드·운영 데이터

## 제품 기준 문서

새 개발은 아래 문서를 기준으로 판단합니다.

| 문서 | 역할 |
|---|---|
| [`docs/PRODUCT_PLAN_1.0.md`](./docs/PRODUCT_PLAN_1.0.md) | 인사야 1.0 제품 정의·사용자 여정·출시 기준 |
| [`docs/STATUS.md`](./docs/STATUS.md) | 현재 실제 구현 상태와 제품화 과제 |
| [`docs/REPO_REFACTOR_PLAN.md`](./docs/REPO_REFACTOR_PLAN.md) | 저장소·코드 구조의 점진적 개편 계획 |

루트의 기존 `PRODUCT.md`, `MASTERPLAN.md`, `UPGRADE.md`, `PAGES.md`, `POLISH.md` 등은 과거 단계의 상세 기획을 담고 있습니다. 유효 내용을 새 기준 문서에 흡수한 뒤 `docs/archive/`로 정리할 예정입니다.

## 개발 원칙

1. `main`은 항상 배포 가능한 기준 브랜치로 유지합니다.
2. 신규 기능 개수보다 핵심 노동사건의 **끝까지 해결되는 경험**을 우선합니다.
3. 현재 기능을 버리고 전면 재작성하지 않습니다.
4. 자동 테스트를 만든 뒤 거대한 프론트·서버 파일을 단계적으로 분리합니다.
5. 법정 수치·계산식·법률 근거는 점진적으로 단일 소스로 통합합니다.
6. 생성된 SEO 페이지와 원본 콘텐츠의 책임을 분리합니다.

## 빠른 시작

```bash
npm install
cp .env.example .env
npm start
```

기본 주소:

```text
http://localhost:3000
```

API 키가 없어도 서버는 실행되며 AI 상담은 데모 모드로 동작할 수 있습니다.

## 현재 구조

| 영역 | 위치 |
|---|---|
| 메인 SPA | `index.html` |
| 서버 | `server.js` |
| AI | `lib/ai.js`, `lib/prompt.js`, `lib/knowledge.js` |
| DB | `lib/db.js`, `lib/repo.js` |
| 문서 | `lib/docs.js` |
| 알림 | `lib/notify.js` |
| 정적 SEO 빌드 | `scripts/build-site.mjs` |
| 노무사 데이터 수집 | `scripts/ingest-nomusa.mjs` |

이 구조는 현재 동작 기준입니다. 목표 구조는 [`docs/REPO_REFACTOR_PLAN.md`](./docs/REPO_REFACTOR_PLAN.md)를 참고하세요.

## 주요 API

- `POST /api/chat` — AI 상담
- `POST /api/summary` — 상담 요약
- `GET /api/docs`, `POST /api/doc` — 문서
- `GET /api/docpacks`, `POST /api/docpack` — 문서팩
- `GET /api/nomu` — 노무사 정보
- `POST /api/lead`, `POST /api/booking` — 문의·상담 접수
- `GET /r/:token` — 보안 요약 열람
- `GET /api/health` — 서비스 상태

## 빌드

```bash
npm run build
```

정적 SEO 페이지, sitemap, robots 파일 등을 생성합니다.

현재 콘텐츠 원본이 `index.html`과 강하게 결합되어 있어 제품화 과정에서 별도 `content/` 구조로 점진적으로 분리할 예정입니다.

## 데이터 저장 주의

현재 운영 데이터는 SQLite(`data/app.db`) 기반입니다.

Render 무료 파일시스템은 영속 저장을 보장하지 않으므로 **실제 제품 운영 전 영속 저장소와 백업/복구 방식을 확정하는 것이 P0 과제**입니다.

## 제품화 우선순위

```text
제품 기준 확정
→ 테스트/CI 안전망
→ Case 데이터 모델 + Case Workspace
→ 임금체불 핵심 사건 완결
→ 해고 / 퇴직금 / 근로시간·수당 / 연차 확대
→ Legal·Calculator·Content 모듈 분리
→ 운영 안정화
→ 사업주·노무사 제품 확장
```

자세한 기준은 [`docs/PRODUCT_PLAN_1.0.md`](./docs/PRODUCT_PLAN_1.0.md)를 따릅니다.

## 안전 원칙

- AI 답변·계산·문서는 정보 제공을 목적으로 합니다.
- 민감정보 수집을 최소화합니다.
- 전문가 연결은 이용자가 정보를 비교·선택하는 구조를 유지합니다.
- 구체적인 사건 판단이 필요한 경우 공인노무사 및 공식기관 절차로 연결합니다.
