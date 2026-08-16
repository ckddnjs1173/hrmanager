# 인사야 1.0 Release Checklist

> **기준일:** 2026-08-16
> **현재 판정:** Code/Product RC
> **마지막 배포 검증 main:** `65c50f5de89260f8db33cf27f0e64fde0f211325`
> **CI run:** `31921056734`
> **GA blocker:** durable user-data persistence + 실제 restore rehearsal

---

## A. Code / Product RC — 완료

### Core Product

- [x] 임금체불 Case end-to-end
- [x] 해고·권고사직 Case end-to-end
- [x] 퇴직금·퇴직연금 Case end-to-end
- [x] 근로시간·연장/야간/휴일수당 Case end-to-end
- [x] 연차유급휴가·미사용수당 Case end-to-end
- [x] 증거 상태 / 다음 행동
- [x] 공식 근거 / 문서 / 공식기관 절차
- [x] Case Report / Case 삭제

### Legal / Calculation

- [x] Core Case 결정론 계산/판단
- [x] 사건 기준일/법률 경계 관리
- [x] Case Registry
- [x] Legal Registry
- [x] 공식 source contract 테스트
- [x] unknown/missing fact 임의 추정 방지

### Privacy / Security

- [x] opaque Case access token
- [x] token 원문 DB 미저장
- [x] browser `sessionStorage` only
- [x] Case token expiry / revoke / retention
- [x] Case document plain-text preview
- [x] Admin / Partner signed session
- [x] CSRF 보호
- [x] timing-safe verification
- [x] API rate limit
- [x] security headers / CSP
- [x] secure expert summary expiry / escape / noindex / access log

### Architecture

- [x] shared Case client transport
- [x] shared Case workspace CSS
- [x] Case / AI / Document / Expert / Public Operation router 분리
- [x] Admin / Partner / Secure Summary router 분리
- [x] session security / rate-limit / HTTP security 모듈
- [x] retention scheduler
- [x] `server.js` bootstrap only
- [x] `lib/application.js` application composition
- [x] Content Source 첫 migration (`content/home-navigation.js`)

### Test / Release Safety

- [x] Node regression suite
- [x] Release gate
- [x] actual Chromium desktop journey
- [x] 390×844 mobile check
- [x] annual leave dedicated browser journey
- [x] exact-SHA Render verification
- [x] synthetic production Core Cases
- [x] production document / report verification
- [x] synthetic Case cleanup
- [x] date-dependent wage assertions 제거

---

## B. Last Verified Production Baseline

```text
main SHA: 65c50f5de89260f8db33cf27f0e64fde0f211325
CI run:   31921056734

check             ✅ success
browser-e2e       ✅ success
production-smoke  ✅ success
```

`fix/1.0-rc-finalization`은 배포 전 후보 브랜치다. 이 브랜치가 PR CI를 통과해도 `main`에 병합하기 전에는 Production에 반영되지 않는다.

---

## C. Readiness Contract — RC Finalization

Canonical endpoint:

```text
GET /api/readiness
```

Compatibility alias:

```text
GET /api/cases/readiness
```

두 개념을 분리한다.

```text
ready
= 서버·DB·Case Registry·Legal Registry가 현재 요청을 처리할 수 있는가

readyForSensitiveCaseStorage
= 민감한 사용자 Case를 장기 보관할 durable storage가 검증됐는가
```

무료/ephemeral baseline에서는 정상 상태가 다음과 같다.

```text
ready = true
readyForSensitiveCaseStorage = false
```

`DB_PATH=:memory:`는 어떤 환경변수 조합에서도 durable storage로 인정하지 않는다.

---

## D. GA Required — Durable Storage

### 1. Infrastructure Decision

- [ ] durable storage 방식 선택
  - Render Persistent Disk + SQLite
  - 또는 별도 durable database/storage architecture
- [ ] 비용/운영 책임 확인
- [ ] production mount / connection 방식 확정

### 2. Initial Configuration

- [ ] durable mount 아래 `DB_PATH` 설정
- [ ] `REQUIRE_PERSISTENT_DB=1`
- [ ] `PERSISTENT_STORAGE=0` 유지
- [ ] `/api/readiness`가 아직 sensitive-storage-ready를 주장하지 않는지 확인

### 3. Survival Test

- [ ] marker record 생성
- [ ] service restart
- [ ] marker record 유지 확인
- [ ] redeploy
- [ ] marker record 유지 확인

### 4. Durable Storage Attestation

위 survival test를 통과한 **뒤에만**:

- [ ] `PERSISTENT_STORAGE=1`
- [ ] `/api/readiness` → `ready=true`
- [ ] `/api/readiness` → `readyForSensitiveCaseStorage=true`
- [ ] persistence requirement satisfied 확인

### 5. Backup

- [ ] `npm run db:backup` 성공
- [ ] `integrity_check` 성공
- [ ] `foreign_key_check` 성공
- [ ] required tables 검증
- [ ] backup을 application host 외부 안전 저장소로 복사
- [ ] backup 접근권한/암호화 확인

### 6. Restore

- [ ] `npm run db:restore-check -- --source <backup.db>` 성공
- [ ] 별도 target DB 생성 확인
- [ ] 실제 restore rehearsal 1회
- [ ] 복원 후 admin/core read 확인

### 7. Final GA Verification

- [ ] `/api/health` green
- [ ] `/api/readiness` green
- [ ] `readyForSensitiveCaseStorage=true`
- [ ] exact deployed SHA 확인
- [ ] Core 5 production synthetic flow green
- [ ] synthetic data cleanup green
- [ ] backup/restore runbook 최신화

위 항목이 끝나면 `1.0 GA`로 판정할 수 있다.

---

## E. GA를 막지 않는 후속 작업

- [ ] `TOPICS` external content source 이동
- [ ] `ARTICLES` external content source 이동
- [ ] Legacy legal copy → Legal Registry single-source
- [ ] legacy calculator metadata/source 정리
- [ ] SEO builder와 UI source 통일
- [ ] `index.html` 추가 축소
- [ ] 전체 키보드 접근성 audit
- [ ] WCAG 대비 audit
- [ ] 장기 운영 error/uptime alert
- [ ] account-based My Cases
- [ ] multi-device Case recovery
- [ ] Core Case 6번째 유형
- [ ] employer SaaS
- [ ] labor-consultant SaaS/CRM
- [ ] frontend framework rewrite

---

## F. 1.0 Scope Freeze

GA 직전에는 아래를 새 필수범위로 추가하지 않는다.

```text
새 Core Case
계정 시스템
대규모 UI 재작성
새 프레임워크 도입
자동 전문가 추천/배정
새 수익화 시스템
대규모 Content migration
```

버그·보안·법률 정확도·운영 안정성 문제는 예외다.

---

## G. Infrastructure Safety Rule

**비용이 발생할 수 있는 Render Persistent Disk, 외부 DB 또는 기타 유료 서비스는 자동 활성화하지 않는다.**

코드와 runbook은 준비하되 실제 구매/활성화/플랜 변경은 운영자의 명시적 선택 후 수행한다.

---

## H. Release Decision

```text
Product scope                 ✅
Core implementation           ✅
Architecture                  ✅
Security baseline             ✅
Automated PR/browser release  ✅
Production smoke baseline     ✅
Backup tooling                ✅
Durable persistence           ❌
Real restore rehearsal        ❌

=> Insaya 1.0 Code/Product RC
```

**다음 GA 작업은 기능 개발이 아니라 durable storage 결정·생존 검증·복구 검증이다.**
