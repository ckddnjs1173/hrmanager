# 인사야 1.0 구현 현황

> **Source of Truth:** 현재 `main`의 실제 구현·CI·운영 검증 상태를 기록한다.
> **기준일:** 2026-08-16
> **Production:** https://insaya.onrender.com/
> **마지막 기능 기준 커밋:** `e9625e4f80981abd43aafb41790c2fd8079be6be`

---

## 1. 현재 결론

인사야 1.0의 **핵심 5개 Case vertical slice**는 모두 구현되어 실제 Render 운영 환경까지 검증됐다.

```text
✅ 임금체불
✅ 해고·권고사직
✅ 퇴직금·퇴직연금
✅ 근로시간·연장/야간/휴일수당
✅ 연차유급휴가·미사용수당
```

각 Case는 단순 계산기나 설명 페이지가 아니라 다음 흐름을 가진다.

```text
사건 생성
→ 필수 사실 구조화
→ 적용범위/법률 규칙
→ 금액 또는 핵심 판단
→ 증거 상태
→ 다음 행동 1개
→ 공식 근거
→ 문서 초안
→ 공식기관 절차
→ 사건 요약 내보내기
→ 사건 삭제
```

현재 개발 단계는 **핵심 Case 증설 단계에서 공통화·운영 안정화 단계로 전환**한다.

---

## 2. 검증 상태

### GitHub CI

`main`과 모든 PR은 `.github/workflows/ci.yml`을 기준으로 검증한다.

1. `check`
   - `npm ci`
   - Node 회귀 테스트
   - 정적 build
   - Release gate
2. `browser-e2e`
   - 실제 Chromium 설치
   - 임금체불·해고·퇴직급여·근로시간 전체 사용자 여정
   - 연차 전용 전체 사용자 여정
   - 390×844 모바일 overflow/주요 CTA 확인
3. `production-smoke` (`main` push만)
   - Render의 `build-info.json` 커밋 SHA가 `github.sha`와 일치하는지 확인
   - 운영 URL에서 합성 Case 생성
   - 법률/금액 결과 확인
   - 문서 생성 확인
   - Case Report 확인
   - 합성 Case 즉시 삭제

### 현재 자동 검증 기준

- Node 회귀 테스트: **92개 통과**
- Release gate: 통과
- Chromium E2E: 통과
- Render exact-commit production smoke: 통과

운영 스모크는 실제 사용자 개인정보를 사용하지 않고 PII 없는 합성 Case만 사용한다.

---

## 3. 핵심 5개 Case

| Case | 진입 경로 | 주요 서버 도메인 | 운영 검증 |
|---|---|---|---|
| 임금체불 | `/wage-intake` | `lib/wage-*`, `lib/legal-rules.js` | ✅ |
| 해고·권고사직 | `/dismissal-intake` | `lib/dismissal-*` | ✅ |
| 퇴직금·퇴직연금 | `/retirement-intake` | `lib/retirement-*` | ✅ |
| 근로시간·수당 | `/worktime-intake` | `lib/worktime-*` | ✅ |
| 연차 | `/annual-leave-intake` | `lib/annual-leave-*` | ✅ |

모든 전용 Case API는 `lib/case-routes.js`에서 보호 토큰 기반으로 노출한다.

---

## 4. Case 공통 기반

### 저장 모델

Case는 SQLite 저장소에 구조화된 상태로 저장한다.

주요 필드:

- `case_type`
- `status`
- 사건일/기간/고용기간
- `facts`
- `missing_facts`
- `issues`
- `evidence`
- `calculations`
- `legal_sources`
- `actions`
- `documents`
- `meta`

대화 로그가 없어도 현재 사건 상태를 이해할 수 있도록 한다.

### 접근 보호

- Case 생성 시 opaque access token 발급
- 토큰 원문은 DB에 저장하지 않음
- 브라우저는 `sessionStorage`에만 토큰 저장
- Case API는 `x-case-token` 또는 Bearer token 검증
- 만료 토큰 차단
- 삭제 시 token revoke
- 방치 Case 보존정책 sweep 존재

### 출력 안전

- Case 문서 preview는 서버가 만든 문서를 HTML로 주입하지 않고 plain text로 렌더링
- 사용자가 입력한 값이 문서 preview DOM에서 실행되지 않도록 유지

---

## 5. Case별 구현 범위

### 임금체불 — ✅ Production verified

- 재직/퇴직, 미지급 항목, 기간, 약정임금 Intake
- 월 전기간 임금 principal 계산
- 부분월은 임의 일할계산 금지, 사용자 확인 금액 요구
- 사건 기준일 최저임금 버전
- 5인 이상 연장·야간·휴일 가산 baseline
- 퇴직 후 금품청산/지연이자 baseline
- 증거 체크
- 내용증명/진정서
- 노동포털 연결
- Case Report

### 해고·권고사직 — ✅ Production verified

- 해고/권고사직 성격 분리
- 상시 5명 이상 구제 baseline 분기
- 해고예고와 부당해고 구제를 별도 쟁점으로 관리
- 계속근로 3개월 경계 달력 기준 처리
- 해고예고수당 잠정 계산
- 근로기준법 제23·26·27·28조 및 노동위원회 근거
- 구제신청/문서/공식 절차/Case Report

### 퇴직금·퇴직연금 — ✅ Production verified

- 일반 퇴직금 / DB / DC / 유형 모름 분기
- 1년·주 15시간 적용범위
- 평균임금 직전 3개월 baseline
- 통상임금 하한 적용
- 평균임금 제외기간은 자동 추정 금지
- 주 15시간 미만 혼재기간은 qualifying service 요구
- DC는 평균임금식과 분리
- 문서/노동포털/Case Report

### 근로시간·연장/야간/휴일수당 — ✅ Production verified

- 일반 고정근로시간제 baseline
- 상시근로자 수 분기
- 통상시급 + 6개 배타적 시간 bucket
- 연장·야간·휴일 가산의 중복을 명시적으로 계산
- 주 12시간 연장한도 별도 판단
- 휴게시간 별도 판단
- 4명 이하에서는 제56조 가산을 자동 적용하지 않음
- 탄력·선택·재량 등 대체 근로시간제는 자동계산 차단
- 문서/노동포털/Case Report

### 연차유급휴가·미사용수당 — ✅ Production verified

- 주 15시간 및 사업장 규모 적용범위
- 최초 1년 월 단위 발생 baseline
- 1년 이상 최신 연차 발생 cohort 계산
- 365일 종료 / 다음 발생일 존속 경계 반영
- 출근율 80% 기준과 저출근율 월별 발생 분기
- 장기근속 가산 및 25일 상한 baseline
- 발생일수를 자동 미사용일수로 간주하지 않음
- 실제 연차대장 확인 미사용일수로 수당 계산
- 사용촉진 사실만으로 수당 0원 자동 확정 금지
- 2026-08-20, 2027-06-10 법률 버전 경계 관리
- 문서/노동포털/Case Report

---

## 6. 기존 제품 기능

핵심 Case 외 기존 기능은 유지되고 있다.

| 영역 | 상태 | 비고 |
|---|---|---|
| AI 노무 상담 | 🟢 유지 | Anthropic/Gemini 등 provider 구성, 키 없으면 데모 |
| 상담 요약 | 🟢 유지 | 구조화 요약 API |
| 계산기 | 🟡 Legacy + Case 연결 진행 | 기존 27종 독립 계산기와 Case 결정론 계산이 공존 |
| 문서센터 | 🟢 유지 | 문서 24종+ / 문서팩, Case prefill 사용 |
| 노동 가이드/SEO | 🟢 유지 | 정적 build 유지 |
| 노무사 정보 | 🟢 유지 | 공개 검색/프로필 데이터 |
| 상담 요청/전문가 전달 | 🟢 유지 | 동의·토큰·요약 전달 흐름 |
| Admin/운영 | 🟡 Legacy 유지 | 제품화 우선순위 후단 |

새 개발은 Legacy 도구 개수 증설보다 Case 중심 통합을 우선한다.

---

## 7. Refactor Phase 현황

| Phase | 상태 | 현재 판단 |
|---|---|---|
| A. 테스트/CI 안전망 | 🟢 완료 | Node + Release gate + Chromium + Production smoke |
| B. 프론트 분리 | 🟡 진행 | Case별 전용 HTML/CSS/JS 분리. 메인 `index.html`은 여전히 큼 |
| C. Legal / Calculator 분리 | 🟡 진행 | Case별 결정론 규칙 모듈은 존재하나 공통 registry/source 구조 필요 |
| D. Content Source 분리 | 🔴 미착수 | Legacy 콘텐츠가 `index.html`과 강결합 |
| E. Server 도메인 분리 | 🟡 진행 | Case router는 분리됨. `server.js`의 기타 API 책임은 여전히 큼 |

---

## 8. 지금부터의 개발 우선순위

### P0 — 운영 데이터 영속성

현재 운영 저장소는 SQLite이고 Render 무료 파일시스템은 영속 저장을 보장하지 않는다.

남은 결정:

1. Render persistent disk 등 영속 스토리지 사용 여부
2. `DB_PATH`를 영속 경로로 고정
3. 백업/복구 runbook
4. 복구 테스트

**비용이 발생할 수 있는 인프라는 자동 활성화하지 않는다.** 코드에서는 `REQUIRE_PERSISTENT_DB=1` release guard를 사용할 수 있다.

### P1 — Case / Legal 공통화

1. Case descriptor/registry 도입
2. 반복되는 Case route 연결을 공통 router contract로 축소
3. 법률 source metadata 공통 registry
4. rule version/result contract 통일
5. 계산 결과의 `result/formula/assumptions/legalBasis/validFrom/warnings` 형태 정리

### P1 — 프론트 공통화

1. 5개 Case Workspace 공통 shell/token/api/document/report 유틸 추출
2. 공통 CSS를 별도 파일로 이동
3. 메인 launcher를 data-driven registry로 전환하되 회귀 contract 유지
4. 메인 `index.html` 책임 축소

### P1 — Server 책임 분리

Case router 패턴을 기준으로 다음을 점진 분리한다.

- chat
- documents
- experts
- bookings/leads
- admin

endpoint contract는 유지한다.

### P2 — Content Source 분리

- 가이드/계산기/법률 원본을 `content/`로 이동
- UI와 SEO build가 같은 원본을 사용
- 생성물과 원본을 명확히 구분

---

## 9. 운영상 남은 리스크

### 영속 DB — 🔴

무료 Render 인스턴스 재시작/재배포 시 SQLite 파일 유실 가능성이 있다. 실제 사용자 사건을 장기간 보관하려면 반드시 해결해야 한다.

### 메인 SPA 크기 — 🟡

`index.html`과 `server.js`에 Legacy 책임이 많이 남아 있다. 현재 테스트 안전망이 있으므로 이후 작은 PR 단위로 분리한다.

### 법률 데이터 중복 — 🟡

핵심 5개 Case의 법률 규칙은 결정론 모듈로 분리됐지만 Legacy 계산기·프롬프트·가이드에는 동일 숫자/설명이 남아 있을 수 있다. 공통 Legal registry가 다음 핵심 작업이다.

### 법률 버전 유지보수 — 🟡

Case별 `verifiedAt`과 유효일을 관리하고 있으나, 전체 법률 source registry와 정기 검증 프로세스는 아직 공통화되지 않았다.

---

## 10. 인사야 1.0 출시 기준 현황

| 출시 기준 | 상태 |
|---|---|
| 핵심 5개 Case가 끝까지 해결 흐름을 제공 | ✅ |
| 계산/법률 판단의 핵심 부분이 결정론적 | ✅ |
| 공식 근거와 기준일 표시 | ✅ 핵심 Case |
| 문서/공식기관 경로 연결 | ✅ |
| Case access 보호 | ✅ |
| 실제 브라우저 회귀 | ✅ |
| 실제 운영 배포 smoke | ✅ |
| 영속 데이터 저장 | ❌ 인프라 결정 필요 |
| 백업/복구 검증 | ❌ |
| Legal/Calculator single source | 🟡 부분 완료 |
| Legacy SPA/Server 책임 축소 | 🟡 부분 완료 |

**제품 기능 기준으로 핵심 5개 사건은 1.0 vertical slice 완료. 실제 장기 운영 출시의 가장 큰 차단 요소는 영속 DB/백업과 공통 모듈 정리다.**
