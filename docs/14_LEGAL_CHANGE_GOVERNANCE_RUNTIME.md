# Insaya Legal Change Governance Runtime — Bundle 15

> 기준: 2026-08-17
> 상태: Foundation
> 목적: 공식 법령·고시·행정절차 등의 변경 후보를 사람이 검증하고, 테스트 가능한 Rule 변경 제안으로 승격시키는 내부 control plane을 만든다.

## 이 Bundle이 하지 않는 것

- 외부 웹사이트 자동 크롤링
- AI 요약을 법적 원문으로 취급
- AI가 Rule 값을 자동 승인
- `legal-rules.js`, `saas-risk-rules.js` 등 현재 runtime Rule 자동 수정
- 검토 완료 제안을 자동으로 `ACTIVE` 처리
- 고객에게 법령변경 영향을 자동 확정 통지

이번 단계의 최종 상태는 `READY_FOR_IMPLEMENTATION`이다. 실제 runtime Rule 변경은 별도 코드 변경, fixture 회귀, 코드리뷰, 배포 게이트를 거쳐야 한다.

## 기존 구조와의 관계

현재 `lib/legal-registry.js`는 Worker/Core Case의 canonical source metadata를 정적으로 관리한다. `lib/legal-rules.js`와 각 도메인 rule module은 사건 기준일에 따라 deterministic Rule을 선택한다.

Bundle 15는 이 구조를 대체하지 않는다.

```text
현재 Runtime
Legal Registry + deterministic JS Rules
            ↑
            │ 별도 구현 PR에서만 반영
            │
READY_FOR_IMPLEMENTATION
            ↑
Rule Change Proposal + Fixtures
            ↑
Human Verification
            ↑
Official-source Change Candidate
```

## 공식 출처 등급

저장 가능한 source type은 다음과 같다.

1. `STATUTE` — 법률
2. `DECREE` — 시행령·시행규칙
3. `REGULATION_NOTICE` — 고시·공고 등
4. `AGENCY_PROCEDURE` — 공식 행정절차
5. `ADMIN_INTERPRETATION` — 공식 행정해석
6. `PRECEDENT_DECISION` — 판례·위원회 결정
7. `GOVERNMENT_GUIDE` — 정부 공식 안내

Foundation 단계에서 URL은 인사야가 이미 신뢰 경계로 사용하는 공식 도메인으로 제한한다. 새로운 기관을 추가할 때는 contract 수정 + 검토가 필요하다.

## Candidate lifecycle

```text
DRAFT
  ↓ submit
IN_REVIEW
  ├─ REQUEST_CHANGES → DRAFT
  ├─ REJECT → REJECTED
  └─ VERIFY → VERIFIED
                 ↓
            SUPERSEDED
```

`DRAFT → VERIFIED` 직접 전환은 금지한다.

Candidate에는 공식 URL뿐 아니라 `source_snapshot`과 그 내용에 기반한 SHA-256 `content_hash`가 저장된다. 같은 snapshot의 중복 후보는 거부한다.

## Rule Proposal lifecycle

```text
DRAFT
  ↓ fixture 등록
READY_FOR_TEST
  ↓ 사람 검증
VERIFIED
  ↓ 구현 승인
READY_FOR_IMPLEMENTATION
```

`READY_FOR_IMPLEMENTATION`은 runtime 활성화를 의미하지 않는다.

`ACTIVE` 상태는 이 control-plane schema에 존재하지 않는다. 따라서 DB 조작만으로 현재 노동법 판단이 바뀌지 않는다.

## Fixture gate

Rule Proposal을 `VERIFIED` 이상으로 올리려면 최소 1개의 fixture가 필요하다. 실제 운영 규칙에서는 최소 다음 경계를 권장한다.

- 시행일 전날
- 시행일 당일
- 시행일 다음날
- 사업장 인원수 등 법적 경계값 바로 아래/경계/바로 위
- 누락 사실값
- 금액/시간 기준값 바로 아래/동일/바로 위

Fixture는 최소 `name`과 `expected`를 포함해야 하며 전체 evidence에 SHA-256 hash가 저장된다.

## PostgreSQL tables

### `legal_change_candidates`
공식 출처 변경 후보와 source snapshot을 저장한다.

### `legal_change_reviews`
사람의 VERIFY / REJECT / REQUEST_CHANGES 결정을 append-only로 저장한다.

### `legal_rule_change_proposals`
특정 `rule_key`의 다음 버전 제안을 저장한다. 실제 runtime Rule과 분리되어 있다.

### `legal_governance_events`
Candidate/Proposal 상태 전환을 append-only event로 기록한다.

## Security / exposure

Bundle 15에서는 고객 API와 public route를 만들지 않는다. repository는 PostgreSQL 내부 control plane으로만 존재한다. 관리 UI/API는 이후 Bundle에서 기존 Admin authentication/CSRF 경계 안에 별도로 노출한다.

## 다음 Bundle 연결

후속 단계는 다음 순서로 진행한다.

1. Internal Admin Legal Change queue
2. official-source adapter의 `candidate only` 수집
3. Rule proposal diff viewer
4. fixture runner와 실제 deterministic Rule test 연동
5. approved proposal → code change generator/PR 보조
6. 배포된 RuleVersion과 Proposal 연결
7. 영향받는 Organization 계산
8. `NEEDS_REVIEW` Legal Impact 생성
9. 검토 후 Business Risk/Action/Notification 연결

어떤 단계에서도 `공식 출처 발견 → AI 요약 → 자동 Rule 활성화` 경로는 허용하지 않는다.
