# 인사야 1.0 Release Checklist

> **기준일:** 2026-08-16
> **현재 판정:** Code/Product RC
> **GA blocker:** durable user-data persistence + 실제 restore rehearsal

---

## A. Code / Product RC — 완료

### Core Product

- [x] 임금체불 Case end-to-end
- [x] 해고·권고사직 Case end-to-end
- [x] 퇴직금·퇴직연금 Case end-to-end
- [x] 근로시간·연장/야간/휴일수당 Case end-to-end
- [x] 연차유급휴가·미사용수당 Case end-to-end
- [x] 증거 상태
- [x] 다음 행동
- [x] 공식 근거
- [x] 사건 문서
- [x] 공식기관 절차
- [x] Case Report
- [x] Case 삭제

### Legal / Calculation

- [x] Core Case 결정론 계산/판단
- [x] Case 기준일/법률 경계 관리
- [x] Case Registry
- [x] Legal Registry
- [x] 공식 source contract 테스트
- [x] unknown/missing fact를 임의 추정하지 않는 구조

### Privacy / Security

- [x] opaque Case access token
- [x] token 원문 DB 미저장
- [x] browser sessionStorage only
- [x] Case token expiry
- [x] delete/revoke lifecycle
- [x] retention sweep
- [x] Case document plain-text preview
- [x] Admin signed session
- [x] Partner signed session
- [x] CSRF 보호
- [x] timing-safe token/session verification
- [x] API rate limit
- [x] security headers / CSP
- [x] secure expert summary expiry / escape / noindex / access log

### Architecture

- [x] shared Case client transport
- [x] shared Case workspace CSS
- [x] document router 분리
- [x] AI router 분리
- [x] expert router 분리
- [x] public operation router 분리
- [x] admin router 분리
- [x] partner router 분리
- [x] secure summary router 분리
- [x] session security module
- [x] rate-limit module
- [x] HTTP security middleware
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
- [x] exact-SHA Render deployment verification
- [x] runtime readiness
- [x] synthetic production Cases
- [x] production document / report verification
- [x] synthetic Case cleanup
- [x] date-dependent wage-interest assertions 제거

---

## B. Latest Verified Code Baseline

Code baseline before final documentation:

```text
main SHA: 2de40069dea23c8d33d28f632aec7676e98ff132
CI run:   31920757600
```

Result:

```text
check             ✅ success
browser-e2e       ✅ success
production-smoke  ✅ success
```

Final documentation merge must also pass the same main chain before the RC documentation is considered fully synchronized.

---

## C. GA Required — Durable Storage

이 섹션은 코드만으로 완료할 수 없다. 실제 운영 storage 선택이 필요하다.

### Infrastructure Decision

- [ ] durable storage 방식 선택
  - Render Persistent Disk + SQLite
  - 또는 별도 durable database/storage architecture
- [ ] 비용/운영 책임 확인
- [ ] production mount / connection 방식 확정

### Persistence Configuration

- [ ] durable `DB_PATH` 설정
- [ ] `REQUIRE_PERSISTENT_DB=1`
- [ ] readiness가 persistence requirement를 통과하는지 확인

### Survival Test

- [ ] marker record 생성
- [ ] service restart
- [ ] marker record 유지 확인
- [ ] redeploy
- [ ] marker record 유지 확인

### Backup

- [ ] `npm run db:backup` 성공
- [ ] `integrity_check` 성공
- [ ] `foreign_key_check` 성공
- [ ] required tables 검증
- [ ] backup을 application host 외부 안전 저장소로 복사
- [ ] backup 접근권한/암호화 확인

### Restore

- [ ] `npm run db:restore-check -- --source <backup.db>` 성공
- [ ] 별도 target DB 생성 확인
- [ ] 실제 restore rehearsal 1회
- [ ] 복원 후 admin/core read 확인

### Final GA Verification

- [ ] `/api/health` green
- [ ] `/api/cases/readiness` green
- [ ] exact deployed SHA 확인
- [ ] Core 5 production synthetic flow green
- [ ] synthetic data cleanup green
- [ ] backup/restore runbook 최신화

위 항목이 끝나면 `1.0 GA`로 판정할 수 있다.

---

## D. GA를 막지 않는 후속 작업

아래는 중요하지만 1.0 GA 직접 blocker로 사용하지 않는다.

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

## E. 1.0 Scope Freeze

GA 직전에는 아래 변경을 새 필수범위로 추가하지 않는다.

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

## F. Infrastructure Safety Rule

**비용이 발생할 수 있는 Render Persistent Disk, 외부 DB 또는 기타 유료 서비스는 자동으로 활성화하지 않는다.**

코드와 runbook은 준비해 두되 실제 구매/활성화/플랜 변경은 운영자의 명시적 선택 후 수행한다.

---

## G. Release Decision

현재 판단:

```text
Product scope        ✅
Core implementation  ✅
Architecture          ✅
Security baseline     ✅
Automated release     ✅
Production smoke      ✅
Backup tooling        ✅
Durable persistence   ❌
Real restore rehearsal❌

=> Insaya 1.0 Code/Product RC
```

**다음 출시 작업은 기능 개발이 아니라 durable storage 결정과 복구 검증이다.**