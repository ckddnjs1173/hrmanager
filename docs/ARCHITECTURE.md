# 인사야 1.0 Architecture

> **기준일:** 2026-08-16
> **목적:** 목표 구조가 아니라 현재 Production에서 실제로 동작하는 구조와 안전 경계를 설명한다.

---

## 1. 시스템 개요

```text
Browser
│
├─ Main SPA (`index.html`)
│   ├─ AI 상담
│   ├─ Legacy 계산기/문서/가이드/전문가 UI
│   └─ Case launcher (`wage-intake-launcher.js`)
│
├─ Dedicated Case Workspaces
│   ├─ /wage-intake
│   ├─ /dismissal-intake
│   ├─ /retirement-intake
│   ├─ /worktime-intake
│   └─ /annual-leave-intake
│
└─ Express (`server.js`)
    ├─ /api/cases → `lib/case-routes.js`
    ├─ /api/chat, /api/summary
    ├─ /api/docs, /api/docpack
    ├─ /api/nomu
    ├─ booking / lead / admin APIs
    └─ static files + generated SEO

SQLite
├─ legacy operational data
└─ structured Case repository
```

---

## 2. Case Architecture

### 공통 흐름

모든 핵심 Case는 동일한 개념 흐름을 따른다.

```text
Client Intake
↓
Protected Case API
↓
Intake Normalizer
↓
Legal / Money Rules
↓
Next Action Planner
↓
Case Repository
↓
Workspace Result
├─ facts
├─ legal
├─ calculations
├─ evidence
├─ documents
├─ procedures
└─ nextAction
```

### Case 모듈 구성

각 사건은 현재 `lib/` 아래 다음 책임을 분리한다.

```text
<case>-intake.js      사실 정규화 / missing facts / issue detection
<case>-rules.js       결정론 법률 규칙 / 계산 / official sources
<case>-actions.js     다음 행동 하나 결정
<case>-resources.js   문서/공식 절차 연결
<case>-report.js      결정론 Case Report
<case>-service.js     repository와 위 모듈 orchestration
```

임금체불은 초기 구현 역사 때문에 이름이 일부 다르다.

```text
wage-intake-service.js
wage-money.js
legal-rules.js
wage-resources.js
wage-report.js
```

이 차이는 다음 공통화 단계에서 adapter/registry로 흡수한다.

---

## 3. 핵심 Case 목록

| Case type | UI | Service |
|---|---|---|
| `wage` 계열 | `wage-intake.html` | `wage-intake-service.js` |
| dismissal | `dismissal-intake.html` | `dismissal-service.js` |
| retirement benefit | `retirement-intake.html` | `retirement-service.js` |
| working time pay | `worktime-intake.html` | `worktime-service.js` |
| annual leave | `annual-leave-intake.html` | `annual-leave-service.js` |

UI는 각 Case별 HTML/CSS/JS로 분리돼 있고, `index.html`을 직접 수정하지 않고도 Case를 발전시킬 수 있다.

---

## 4. Case API Contract

Case router base:

```text
/api/cases
```

각 vertical slice의 기본 패턴:

```text
POST   /<case>-intake
GET    /:id/<case>-intake
PATCH  /:id/<case>-intake
GET    /:id/<case>-report
POST   /:id/<case>-document/:templateKey
DELETE /:id
```

### Access Token

Case 생성 응답:

```json
{
  "case": { "id": "..." },
  "accessToken": "opaque-token"
}
```

후속 요청:

```text
x-case-token: <opaque-token>
```

또는:

```text
Authorization: Bearer <opaque-token>
```

서버는 token을 검증한 뒤에만 Case를 읽거나 수정한다.

---

## 5. 브라우저 보안 경계

### 토큰 저장

전용 Case client는 access token을 `sessionStorage`에만 저장한다.

하지 않는 것:

- `localStorage` 영구 저장
- URL query에 token 노출
- Case ID만으로 조회 허용

### 문서 preview

문서 endpoint 결과는 브라우저에서 `textContent`로 렌더링한다.

```text
Server template output
→ JSON
→ <pre>.textContent
```

사용자 입력값이 HTML/script로 실행되는 경로를 만들지 않는다.

### 삭제

사용자 삭제:

```text
DELETE Case
→ repository archive/delete policy
→ access token revoke
```

---

## 6. Legal / Calculator Architecture

핵심 5개 Case의 중요한 수치·판단은 AI가 계산하지 않는다.

```text
Facts
↓
Deterministic Rules
↓
{
  status,
  amount / assessment,
  assumptions,
  sources,
  warnings,
  verifiedAt
}
↓
AI/UI는 결과를 설명·표시
```

### 현재 장점

- 사건일 기준 법률 버전 선택 가능
- unsupported date를 현재 법으로 조용히 fallback하지 않음
- 모르는 사실을 임의 추정하지 않음
- 공식 출처와 검증일을 결과에 포함

### 현재 한계

Case별 source object와 rule metadata가 각 파일에 존재한다.

다음 목표:

```text
src/legal/
├─ registry.js
├─ sources/
├─ rules/
└─ calculators/
```

단, 기존 모듈을 한 번에 이동하지 않고 adapter를 먼저 두어 endpoint contract를 보존한다.

---

## 7. Persistence

### 현재

- Node built-in SQLite 기반 repository
- 기본 운영 DB: 파일 기반
- Case와 legacy 예약/리드/운영 데이터가 SQLite를 사용

### 중요한 운영 제약

Render 무료 파일시스템은 장기 영속성을 보장하지 않는다.

따라서 현재 구조에서 다음 둘은 구분한다.

```text
코드/배포 동작 가능 ✅
장기 사용자 데이터 영속 보장 ❌
```

### 운영 전 필요한 것

- persistent disk 또는 외부 영속 DB 선택
- `DB_PATH` 영속 경로 고정
- backup/restore runbook
- 실제 복구 연습

유료 인프라 변경은 별도 운영 결정으로 취급한다.

---

## 8. Retention / Privacy

Case는 노동분쟁 관련 민감 사실을 포함할 수 있다.

현재 원칙:

- 필요한 사실만 구조화
- 이름/회사명 등 불필요한 PII를 Case 계산에 요구하지 않음
- access token 만료
- 오래 방치된 Case 정리 sweep
- 삭제된 Case 후속 정리
- 전문가 전달은 별도 동의 기반 흐름

향후 인증 계정형 `내 사건`을 도입하더라도 이 최소수집 원칙을 유지한다.

---

## 9. AI Architecture

`lib/ai.js`, `lib/prompt.js`, `lib/knowledge.js`가 기존 AI 상담을 담당한다.

현재 원칙:

```text
키워드 분류 가능
→ AI 분류 호출 생략

키워드 미적중
→ AI 의미 분류

법정 계산/기한/명시 규칙
→ Case Legal/Calculator 결과 우선

AI
→ 사용자 설명과 구조화 보조
```

AI provider가 없어도 서버 자체와 결정론 Case 기능은 실행 가능하다.

---

## 10. Document Architecture

공통 템플릿 엔진:

```text
lib/docs.js
```

Case resource module이 사건 사실과 계산 결과를 `prefill`로 만든다.

```text
Case Result
↓
<case>-resources.js
↓
prefill values
↓
renderDoc(templateKey, values)
↓
plain-text preview
```

이 구조는 문서 템플릿 자체와 Case 판단을 분리한다.

---

## 11. Release Architecture

### PR

```text
PR
↓
check
├─ npm test
├─ npm run build
└─ release-check
↓
browser-e2e
├─ Chromium
├─ 핵심 Case 사용자 여정
└─ mobile viewport
```

PR에서는 Production 데이터를 건드리지 않는다.

### main

```text
main merge
↓
check
↓
browser-e2e
↓
Render auto deploy
↓
production-smoke
├─ build-info commit == github.sha
├─ synthetic Case 생성
├─ result/document/report 검증
└─ synthetic Case 삭제
```

배포 성공 여부는 단순 HTTP 200이 아니라 **정확한 커밋 + 실제 핵심 Case 동작**으로 확인한다.

---

## 12. Build Metadata

`npm run build` 과정에서 `scripts/write-build-info.mjs`가 배포 메타데이터를 만든다.

Render가 제공하는 `RENDER_GIT_COMMIT`을 사용해 실제 배포된 SHA를 확인한다.

Production smoke는 이 값이 GitHub Actions의 `github.sha`와 일치하기 전에는 합성 Case 검증을 진행하지 않는다.

---

## 13. 현재 기술 부채

### 메인 SPA

`index.html`이 여전히 많은 Legacy UI/콘텐츠를 포함한다.

### Server

`server.js`에 AI, 문서, 전문가, 리드/예약, Admin 등 여러 API가 남아 있다.

### Legal

핵심 Case별 결정론 모듈은 존재하지만 source/metadata registry가 공통화되지 않았다.

### Frontend

5개 Case client에 token/API/문서 preview/report/delete 코드가 반복된다.

### Content

가이드·계산기·SEO 원본이 앱 UI와 강하게 결합된 부분이 남아 있다.

---

## 14. 다음 구조 변경 원칙

1. endpoint URL과 response contract를 먼저 고정한다.
2. 회귀 테스트 없이 대형 파일을 이동하지 않는다.
3. 공통 abstraction은 **두 번째 구현이 아니라 5개 실제 구현에서 반복이 확인된 뒤** 추출한다.
4. Legal source와 법정 수치는 한 곳으로 수렴시킨다.
5. UI 공통화가 Case별 법적 차이를 숨기지 않게 한다.
6. `main`은 항상 Render에 배포 가능한 상태를 유지한다.
