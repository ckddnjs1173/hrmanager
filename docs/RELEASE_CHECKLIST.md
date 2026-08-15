# 인사야 1.0 Release Checklist

> **상태:** Code / Product Release Candidate
> **기준일:** 2026-08-16
> **GA 차단 조건:** 영속 저장소 활성화 및 실제 backup/restore rehearsal

---

## 1. RC 판정

현재 인사야 1.0은 아래 코드·제품 조건을 충족한다.

```text
✅ 핵심 5개 Case 구현
✅ 결정론 법률/계산
✅ 공식 근거와 사건 기준일
✅ 보호 Case API
✅ 증거 / Next Action / 문서 / 공식 절차 / Case Report
✅ Chromium 실제 사용자 여정
✅ 모바일 viewport 회귀
✅ exact-commit Render production smoke
✅ runtime readiness
✅ Case domain registry
✅ Legal domain registry
✅ verified SQLite backup tooling
✅ non-destructive restore check
```

따라서 **코드·제품 기능 기준 RC**로 본다.

아직 GA로 보지 않는 이유:

```text
❌ 현재 무료 Render 파일시스템은 장기 사용자 DB 영속 운영을 보장하는 구성으로 확정되지 않음
❌ off-host backup 보관과 실제 restore rehearsal 미완료
```

---

## 2. 핵심 Case 출시 확인

### 임금체불

- [x] `/wage-intake`
- [x] Intake
- [x] 임금 principal
- [x] 최저임금 legal version
- [x] 가산수당 baseline
- [x] 퇴직 후 금품청산 / 지연이자 baseline
- [x] 증거
- [x] 문서
- [x] 노동포털
- [x] Case Report
- [x] Chromium E2E
- [x] Production synthetic smoke

### 해고·권고사직

- [x] `/dismissal-intake`
- [x] 해고 / 권고사직 성격 분리
- [x] 사업장 규모 분기
- [x] 해고예고
- [x] 부당해고 구제 baseline
- [x] 3개월 경계
- [x] 해고예고수당
- [x] 노동위원회 / 노동포털
- [x] 문서 / Report
- [x] Chromium / Production smoke

### 퇴직금·퇴직연금

- [x] `/retirement-intake`
- [x] 퇴직금 / DB / DC 분기
- [x] 1년 / 주 15시간 scope
- [x] 평균임금
- [x] 통상임금 하한
- [x] 제외기간 안전 차단
- [x] DC 별도 계산
- [x] 문서 / Report
- [x] Chromium / Production smoke

### 근로시간·수당

- [x] `/worktime-intake`
- [x] 일반 고정근로시간제 baseline
- [x] 5인 이상 / 4인 이하 분기
- [x] 6개 배타적 시간 bucket
- [x] 연장 / 야간 / 휴일 가산
- [x] 주 12시간 한도
- [x] 휴게시간
- [x] 대체근로시간제 자동계산 차단
- [x] 문서 / Report
- [x] Chromium / Production smoke

### 연차

- [x] `/annual-leave-intake`
- [x] 주 15시간 / 사업장 scope
- [x] 최초 1년 월별 발생
- [x] 최신 연차 cohort
- [x] 365일 경계 판례 baseline
- [x] 출근율 80% 분기
- [x] 장기근속 가산
- [x] 미사용일수와 발생일수 분리
- [x] 사용촉진 자동 면제 금지
- [x] 법률 version boundary
- [x] 문서 / Report
- [x] Chromium / Production smoke

---

## 3. Security / Privacy

- [x] Case access token 없이는 사건 조회 불가
- [x] token 원문 DB 저장 금지
- [x] browser token은 `sessionStorage` only
- [x] token expiry / revoke
- [x] 문서 preview `textContent`
- [x] Case 삭제
- [x] 오래 방치된 사건 retention sweep
- [x] Production smoke는 PII 없는 synthetic Case만 사용
- [x] readiness는 raw DB 경로를 노출하지 않음

---

## 4. Legal / Calculation

- [x] 핵심 계산을 AI에 맡기지 않음
- [x] Case별 deterministic rule module
- [x] 사건 기준일 legal version
- [x] 공식 source metadata
- [x] `verifiedAt`
- [x] unsupported / unknown 사실을 임의 추정하지 않음
- [x] Case Legal registry
- [x] shared source canonical validation
- [ ] Legacy 계산기·가이드·프롬프트의 모든 중복 수치를 완전 제거

마지막 미체크 항목은 RC 이후 기술부채이며 핵심 5개 Case 실행을 막지 않는다.

---

## 5. CI / Deployment

### PR Gate

- [x] `npm ci`
- [x] Node 전체 회귀
- [x] static build
- [x] Release gate
- [x] 실제 Chromium
- [x] 5개 Case 사용자 여정
- [x] 모바일 viewport

### Main Gate

- [x] Render auto deploy
- [x] exact commit 확인
- [x] runtime readiness
- [x] 5개 synthetic Case 생성
- [x] legal / money 검증
- [x] 문서 생성
- [x] Case Report
- [x] synthetic Case 삭제

---

## 6. Runtime Readiness

`GET /api/cases/readiness`

- [x] 배포 commit
- [x] SQLite query
- [x] foreign keys
- [x] 필수 앱 테이블
- [x] 5개 Case registry
- [x] Legal registry validation
- [x] persistence requirement
- [x] AI mode
- [x] raw DB path 비노출

Render liveness는 rate-limit 바깥의 `/api/health`를 계속 사용한다.

---

## 7. Backup / Restore

### Code readiness

- [x] `npm run db:backup`
- [x] SQLite online backup
- [x] integrity check
- [x] foreign-key check
- [x] required-table check
- [x] overwrite refusal
- [x] failed backup cleanup
- [x] `npm run db:restore-check -- --source <backup.db>`
- [x] 별도 DB로 non-destructive restore
- [x] 실제 앱 schema backup test
- [x] `docs/OPERATIONS.md`

### GA 전 운영 수행

- [ ] 영속 스토리지 선택
- [ ] `DB_PATH` 영속 경로 설정
- [ ] `REQUIRE_PERSISTENT_DB=1`
- [ ] 재시작 데이터 유지 확인
- [ ] 재배포 데이터 유지 확인
- [ ] 운영 backup 생성
- [ ] backup을 앱 서버와 분리된 안전 저장소로 복사
- [ ] restore-check 통과
- [ ] 실제 복구 rehearsal 1회

---

## 8. GA 전 수동 운영 결정

다음 중 하나를 선택한다.

### Option A — Render Persistent Disk + SQLite

장점:

- 현재 구조 변경 최소
- migration 비용 낮음
- 기존 backup tooling 그대로 사용

필요 작업:

```text
persistent disk 활성화
→ DB_PATH=<mount>/app.db
→ REQUIRE_PERSISTENT_DB=1
→ 배포
→ restart/redeploy persistence 검증
→ backup / restore rehearsal
```

### Option B — 외부 영속 DB

장점:

- 장기 확장성과 다중 인스턴스 대응에 유리

단점:

- 현재 SQLite repository adapter 변경 필요
- migration / rollback / backup 운영이 더 커짐

**1.0 GA만 목표라면 현재 코드 구조에서는 Option A가 가장 작은 변경이다.** 실제 비용·운영 정책을 확인한 뒤 결정한다.

---

## 9. RC 이후로 미루는 항목

아래는 GA 차단 요소가 아니다.

- [ ] 메인 `index.html` 대형 구조 추가 분리
- [ ] `server.js` API 도메인 추가 분리
- [ ] 5개 Case client 공통 frontend utility 추출
- [ ] content source 분리
- [ ] Legacy 법률 수치 single-source 완전 통합
- [ ] 사업주 전용 제품 고도화
- [ ] 노무사 전용 제품 고도화

큰 리팩터링으로 RC 안정성을 다시 흔들지 않는다.

---

## 10. 출시 의사결정

### 현재 가능한 상태

```text
개발/QA/데모/제한 베타 ✅
코드 Release Candidate ✅
장기 사용자 사건 데이터가 필요한 정식 GA ❌ (영속 저장 전환 전)
```

### GA 승인 조건

아래 5개를 모두 만족하면 GA 승인 가능 상태로 본다.

```text
1. 영속 DB 활성화
2. restart/redeploy persistence 검증
3. off-host backup 생성
4. restore rehearsal 성공
5. 해당 배포의 readiness + 5개 Case production smoke 성공
```
