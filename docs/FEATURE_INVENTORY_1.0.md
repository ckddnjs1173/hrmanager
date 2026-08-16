# 인사야 1.0 기능 자산 Inventory — Bundle 1 Freeze

> 기준일: 2026-08-16
> 목적: SaaS 확장 전에 현재 인사야가 이미 보유한 기능을 제품 자산으로 고정하고, 새 Worker/Business/Pro 기능이 이를 중복 개발하거나 삭제하지 않도록 한다.

## 1. 원칙

인사야는 Core 5 Case만 있는 서비스가 아니다. 현재 운영 코드에 이미 AI, 계산, 문서, 가이드, 공식 절차, 전문가 연결, Admin, Partner 기능이 존재한다.

Bundle 1 이후 개발은 다음 원칙을 따른다.

1. 기존 기능을 삭제하고 같은 기능을 새 이름으로 다시 만들지 않는다.
2. 기존 기능은 공통 Engine/Registry로 승격한 뒤 Worker, Business, Pro에서 재사용한다.
3. Legacy UI를 한 번에 재작성하지 않는다. Registry + 무결성 테스트 → consumer migration 순서로 이동한다.
4. 법정 숫자·기한·적용범위는 AI와 UI에 각각 복사하지 않고 canonical contract와 parity test로 관리한다.
5. 기존 사용자 경로와 SEO 자산은 명시적 migration plan 없이 제거하지 않는다.

## 2. 핵심 제품 자산

### Core 5 Case → Case Engine

- 임금체불
- 해고·권고사직
- 퇴직금·퇴직연금
- 근로시간·수당
- 연차유급휴가·미사용수당

현재 Case는 facts, missing facts, legal/calculation result, evidence, next action, official sources, documents, procedures, report, deletion lifecycle을 가진다.

향후 Business Case와 Pro Matter는 이 패턴을 재사용한다.

### 27 계산기 → Calculation Engine

현재 27개 계산기 ID는 `lib/calculation-registry.js`에서 보존 계약으로 관리한다.

Bundle 1에서는 기존 `index.html` 계산식을 재작성하지 않는다. `CALC_META`와 Registry가 정확히 일치하는지 release test로 검증하고, 이후 계산기별로 공통 Calculation Engine으로 이전한다.

특히 다음 자산은 Business에서 재사용 가치가 높다.

- 상시근로자 수
- 최저임금
- 통상임금
- 평균임금
- 연장·야간·휴일수당
- 연차/미사용수당
- 퇴직금
- 해고예고수당
- 포괄임금 검증
- 인건비 총비용

### 24 문서 + 7 문서팩 → Document Engine

현재 `lib/docs.js`가 서버 canonical template source다.

`lib/document-registry.js`는 기존 템플릿을 복제하지 않고 이 source를 platform registry로 승격한다.

향후 방향:

```text
Case / Company / Employee Facts
→ TemplateVersion
→ LegalVersion
→ Prefill
→ Draft
→ Review
→ Approval
→ Delivery
→ Audit
```

### AI 상담 / 상담요약 → Case Copilot + Secure Handoff

현재 AI 상담은 질문 분류와 Knowledge 주입을 사용하며 상담요약도 별도 구조로 생성한다.

향후 AI는 별도 섬이 아니라 Case/Calculation/Document/Legal 기능을 연결하는 자연어 인터페이스로 발전한다.

### 노동 가이드 / SEO → Acquisition Engine

근로자·사업주 가이드와 정적 SEO 페이지는 신규 SaaS 때문에 폐기하지 않는다.

향후 흐름:

```text
검색/가이드
→ 무료 진단/계산
→ Case 또는 Business Risk
→ Action
```

### 노무사 검색 / Booking / 보안 요약 → Expert Directory + Secure Handoff

현재 전문가 검색, 상담 신청, 보안 요약 링크는 Pro 제품의 전단 자산으로 본다.

향후 명시적 ShareGrant 기반으로 Case/문서/증거를 선택적으로 공유한다.

### Admin → Operations Console

현재 Admin의 예약·리드·알림·피드백·전문가·배정·접근기록 기능을 유지한다.

향후 User/Organization/Subscription/Legal Update/Risk/Privacy/Security 운영 기능을 이 Console에 확장한다.

### Partner → Insaya Pro Seed

현재 Partner의 로그인, 배정 상담, 상태, 메모 기능을 폐기하지 않는다.

향후 Client → Matter → Intake → Evidence → Deadline → Task → Document → Portal 구조로 확장한다.

## 3. 현재 보존 계약

Release Gate는 최소 다음을 보존한다.

- Core Case: 5종
- Calculator: 27종
- Document Template: 24종
- Document Pack: 7종
- AI chat / summary
- Worker / Employer guide families
- Expert directory / booking / secure summary
- Admin operations
- Partner workspace

기능 수 변화가 항상 금지되는 것은 아니다. 다만 변경 시 이 Inventory와 migration plan을 의도적으로 함께 수정해야 한다.

## 4. 법정 수치 Single-Source 전환

현재 서버 AI Knowledge, deterministic Legal Rule, Legacy Calculator에 일부 동일 수치가 중복돼 있다.

Bundle 1에서는 `lib/statutory-facts.js`를 canonical contract로 만들고 기존 consumer와의 parity를 release test로 강제한다.

이후 단계에서 consumer를 직접 해당 module/Legal Registry로 이전한다.

전환 순서:

1. canonical contract + parity tests — Bundle 1
2. AI Knowledge consumer 전환
3. Legacy calculator consumer 전환
4. Calculator metadata/source 전환
5. SEO builder와 runtime source 통일

## 5. Bundle 1 완료 정의

Bundle 1은 다음이 모두 충족되면 코드 범위 완료다.

- #43~#53 운영/보안 안정화가 main에 반영됨
- Product Inventory tests green
- Calculator registry parity green
- Document registry integrity green
- statutory fact drift tests green
- Core 5 Release Gate green
- Chromium E2E green
- Production smoke green

운영 GA는 별도 외부 조건이 추가된다.

- durable storage 선택/활성화
- restart/redeploy survival test
- off-host verified backup
- real restore rehearsal
- production readiness green

유료 Persistent Disk나 외부 DB는 운영자 선택 없이 활성화하지 않는다.
