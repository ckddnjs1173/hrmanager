# 인사야 1.0 구현 현황 — Release Candidate

> **Source of Truth:** 현재 `main`의 실제 구현·CI·운영 검증 상태
> **기준일:** 2026-08-16
> **Production:** https://insaya.onrender.com/
> **코드 기준 RC 커밋:** `c3cbf0df2a2c712c1bdc64b44417f3fcaf6d3e03`

---

## 1. 현재 결론

인사야 1.0은 **코드·기능 기준 Release Candidate 상태**다.

핵심 5개 노동사건은 모두 전용 Case Workspace, 결정론 법률/계산, 보호 API, 문서·공식 절차, 실제 Chromium 회귀, Render 운영 스모크까지 닫혔다.

```text
✅ 임금체불
✅ 해고·권고사직
✅ 퇴직금·퇴직연금
✅ 근로시간·연장/야간/휴일수당
✅ 연차유급휴가·미사용수당
```

각 Case의 기본 사용자 흐름:

```text
사건 생성
→ 핵심 사실 구조화
→ 적용범위 / 법률 버전
→ 금액 또는 핵심 판단
→ 증거 상태
→ 다음 행동 1개
→ 공식 근거
→ 문서 초안
→ 공식기관 절차
→ Case Report
→ 사건 삭제
```

**현재 기능 개발의 핵심 범위는 완료했다.**

실제 장기 운영 출시를 막는 남은 P0는 하나다.

```text
🔴 영속 저장소 활성화 + 실제 backup/restore rehearsal
```

백업/복구 코드와 runbook은 이미 준비되어 있다. 비용이 발생할 수 있는 Render persistent disk 또는 외부 영속 DB 선택만 별도 운영 결정으로 남아 있다.

---

## 2. 핵심 5개 Case

| Case | 진입 경로 | 운영 검증 |
|---|---|---|
| 임금체불 | `/wage-intake` | ✅ |
| 해고·권고사직 | `/dismissal-intake` | ✅ |
| 퇴직금·퇴직연금 | `/retirement-intake` | ✅ |
| 근로시간·수당 | `/worktime-intake` | ✅ |
| 연차유급휴가·미사용수당 | `/annual-leave-intake` | ✅ |

공통 보호 API는 `lib/case-routes.js`가 `lib/case-domain-registry.js`를 기준으로 생성한다.

---

## 3. Case 공통 구조

### Case 저장 모델

주요 구조화 필드:

- `case_type`
- `status`
- 사건일 / 기간 / 고용기간
- `facts`
- `missing_facts`
- `issues`
- `evidence`
- `calculations`
- `legal_sources`
- `actions`
- `documents`
- `meta`

대화 로그 없이도 현재 사건 상태를 복원할 수 있도록 한다.

### 접근 보호

- Case 생성 시 opaque access token 발급
- 토큰 원문 DB 미저장
- 브라우저는 `sessionStorage`에만 저장
- `x-case-token` 또는 Bearer 검증
- token expiry / revoke
- Case 삭제 처리
- 방치 사건 retention sweep

### 문서 안전

Case 문서는 서버가 생성하고 browser preview는 `textContent`로 표시한다. 사용자 입력을 HTML로 실행하지 않는다.

---

## 4. Case별 완료 범위

### 임금체불 — ✅

- 재직/퇴직, 미지급 항목, 기간, 약정임금 Intake
- 전월 임금 principal 계산
- 부분월 임의 일할계산 금지
- 사건 기준일 최저임금 버전
- 5인 이상 연장·야간·휴일 가산 baseline
- 퇴직 후 금품청산/지연이자 baseline
- 증거·문서·노동포털·Case Report

### 해고·권고사직 — ✅

- 해고/권고사직 성격 분리
- 5인 이상 부당해고 구제 baseline
- 해고예고와 부당해고 구제 분리
- 계속근로 3개월 달력 경계
- 해고예고수당 계산
- 근로기준법 제23·26·27·28조 및 노동위원회 근거
- 구제신청·문서·Case Report

### 퇴직금·퇴직연금 — ✅

- 일반 퇴직금 / DB / DC / 유형 모름 분기
- 1년·주 15시간 적용범위
- 평균임금 직전 3개월 baseline
- 통상임금 하한
- 평균임금 제외기간 자동 추정 금지
- 주 15시간 미만 혼재기간 qualifying service 요구
- DC 별도 계산
- 문서·노동포털·Case Report

### 근로시간·연장/야간/휴일수당 — ✅

- 일반 고정근로시간제 baseline
- 상시근로자 수 분기
- 통상시급 + 6개 배타적 시간 bucket
- 연장·야간·휴일 가산 중복 계산
- 주 12시간 연장한도 판단
- 휴게시간 판단
- 4명 이하 제56조 가산 자동 적용 금지
- 대체 근로시간제 자동계산 차단
- 문서·노동포털·Case Report

### 연차유급휴가·미사용수당 — ✅

- 주 15시간·사업장 규모 적용범위
- 최초 1년 월 단위 발생
- 1년 이상 최신 연차 발생 cohort
- 365일 종료 / 발생일 존속 경계
- 출근율 80% 분기
- 장기근속 가산·25일 상한
- 발생일수와 실제 미사용일수 분리
- 실제 연차대장 미사용일수 기준 수당
- 사용촉진만으로 수당 0원 자동 확정 금지
- 2026-08-20 / 2027-06-10 법률 버전 경계
- 문서·노동포털·Case Report

---

## 5. 공통화 완료 상태

### Case Registry — ✅

`lib/case-domain-registry.js`

5개 Case의 Case id, UI/intake/report/document path와 create/get/update/report/document service를 중앙 등록한다. `case-routes.js`의 반복 route wiring을 제거했다.

### Legal Registry — ✅ 기반 구축

`lib/legal-registry.js`

- 5개 Case legal-context 진입점 등록
- 공식 source metadata 공통 조회
- shared statute source canonical dedupe
- source metadata conflict validation

기존 계산식을 한 번에 옮기지 않고 adapter registry부터 구축했다.

### Runtime Readiness — ✅

`GET /api/cases/readiness`

확인 항목:

- 실행 중 배포 commit
- SQLite query 가능 여부
- foreign keys
- 필수 앱 테이블
- 5개 Case registry
- Legal registry
- persistence requirement 상태
- AI mode

민감한 DB 경로는 반환하지 않는다.

Render 자체 liveness는 rate-limit 밖의 `/api/health`를 유지하고, 상세 readiness는 main production smoke에서 검증한다.

---

## 6. CI / Release 검증

### PR

```text
check
├─ Node 전체 회귀
├─ build
└─ Release gate

browser-e2e
├─ Chromium 실제 실행
├─ 임금체불
├─ 해고·권고사직
├─ 퇴직급여
├─ 근로시간
├─ 연차
└─ 390×844 모바일 viewport
```

### main

```text
merge
→ check
→ Chromium E2E
→ Render auto deploy
→ runtime readiness exact commit 확인
→ 5개 synthetic Case production smoke
→ 문서 / Report 확인
→ synthetic Case 삭제
```

최신 RC 기준 전체 체인이 통과했다.

---

## 7. SQLite Backup / Restore — ✅ 코드 준비

운영 도구:

```bash
npm run db:backup
npm run db:restore-check -- --source <backup.db>
```

백업 성공 조건:

- SQLite online backup
- `PRAGMA integrity_check = ok`
- foreign key violation 0건
- 필수 앱 테이블 존재
- 실패 backup 자동 제거
- 기존 backup 덮어쓰기 기본 거부

Restore check는 실제 운영 DB를 자동 덮어쓰지 않고 별도 DB로 복원해 재검증한다.

Runbook: `docs/OPERATIONS.md`

---

## 8. 기존 제품 기능

| 영역 | 상태 |
|---|---|
| AI 노무 상담 | 🟢 유지 |
| 구조화 상담 요약 | 🟢 유지 |
| 기존 계산기 | 🟡 Legacy 유지 |
| 문서센터 / 문서팩 | 🟢 유지 |
| 노동 가이드 / SEO | 🟢 유지 |
| 노무사 정보 | 🟢 유지 |
| 상담 요청 / 전문가 전달 | 🟢 유지 |
| Admin / 운영 기능 | 🟡 Legacy 유지 |

핵심 1.0 출시 판단은 Legacy 기능 개수가 아니라 5개 Case 해결 흐름을 기준으로 한다.

---

## 9. 남은 P0 — 영속 데이터 저장

현재 Production은 Render 무료 플랜의 파일 기반 SQLite를 사용한다.

코드와 backup tooling은 준비됐지만 **무료 파일시스템 자체가 장기 사용자 데이터의 영속성을 보장하는 운영 구조는 아니다.**

실제 장기 운영 전 해야 할 일:

```text
[ ] Render persistent disk 또는 외부 영속 DB 선택
[ ] DB_PATH를 영속 경로로 설정
[ ] REQUIRE_PERSISTENT_DB=1
[ ] 재시작 후 데이터 유지 확인
[ ] 재배포 후 데이터 유지 확인
[ ] db:backup 실행
[ ] backup을 별도 안전 저장소에 보관
[ ] db:restore-check 실행
[ ] 실제 restore rehearsal 1회
```

이 단계에는 비용/인프라 선택이 포함될 수 있어 코드 개발과 분리한다.

---

## 10. P1 이후 — RC 이후 리팩터링

아래는 제품 1.0 핵심 출시 차단 요소가 아니라 후속 기술부채다.

- 5개 Case client의 token/API/document/report/delete 공통 유틸 추출
- 공통 Workspace CSS 정리
- 메인 `index.html` 축소
- chat/documents/experts/bookings/admin을 `server.js`에서 점진 분리
- registry 기반 rule result contract 통일
- Legacy 계산기·가이드·프롬프트의 중복 법정 수치 제거
- `content/` source of truth 분리

대형 전면 재작성은 하지 않는다.

---

## 11. 1.0 RC 출시 기준

| 기준 | 상태 |
|---|---|
| 핵심 5개 Case 끝까지 해결 | ✅ |
| 핵심 법률/계산 결정론화 | ✅ |
| 공식 근거 / 기준일 | ✅ |
| 문서 / 공식기관 연결 | ✅ |
| Case access 보호 | ✅ |
| 실제 Chromium 회귀 | ✅ |
| exact-commit Render smoke | ✅ |
| runtime readiness | ✅ |
| Case API registry | ✅ |
| Legal registry 기반 | ✅ |
| verified DB backup tooling | ✅ |
| non-destructive restore check | ✅ |
| 영속 운영 DB | ❌ 운영 결정 필요 |
| 실제 off-host backup / restore rehearsal | ❌ 영속 저장소 결정 후 수행 |

**결론: 인사야 1.0은 코드·제품 기능 기준 RC 완료. 장기 사용자 데이터 저장을 보장하는 영속 인프라만 출시 전 운영 P0로 남아 있다.**
