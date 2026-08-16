# 인사야 운영 Runbook

> 기준일: 2026-08-16
> 범위: SQLite 백업·복구, runtime readiness, **영속 저장(durable storage)** 전환

## 1. 현재 운영 데이터

기본 DB:

```text
data/app.db
```

`DB_PATH`가 설정되면 해당 파일을 사용한다.

DB에는 Case뿐 아니라 booking, lead, expert/partner, event 등 운영 데이터가 포함될 수 있다. DB와 backup은 민감정보를 포함할 수 있으므로 Git에 커밋하지 않는다.

현재 Render free filesystem은 **장기 영속 저장(durable storage)으로 간주하지 않는다.**

```text
서비스 실행 가능 ✅
재시작/재배포 후 사용자 데이터 영속 보장 ❌
```

---

## 2. 운영 Probe

### Liveness

```text
GET /api/health
```

프로세스 생존 확인용이다.

### Canonical Readiness

```text
GET /api/readiness
```

호환 alias:

```text
GET /api/cases/readiness
```

중요 필드:

```text
ready
readyForSensitiveCaseStorage
persistence.required
persistence.durableStorageDeclared
persistence.dbPathConfigured
persistence.requirementSatisfied
```

무료 baseline에서는:

```text
ready=true
readyForSensitiveCaseStorage=false
```

가 정상이다.

---

## 3. Durable Storage 플래그 의미

### `DB_PATH`

실제 DB 파일 경로. 영속 저장 사용 시 mount 아래의 명시적 파일을 지정한다.

### `REQUIRE_PERSISTENT_DB=1`

운영에서 durable storage가 아니면 readiness를 실패시키는 **강제 플래그**다.

### `PERSISTENT_STORAGE=1`

단순 설정값이 아니라 다음을 실제 확인했다는 **운영자 attestation**이다.

```text
restart survival ✅
redeploy survival ✅
```

따라서 `PERSISTENT_STORAGE=1`은 survival test보다 먼저 설정하지 않는다.

`DB_PATH=:memory:`나 `file::memory:*`는 어떤 플래그 조합에서도 durable storage로 인정하지 않는다.

---

## 4. Durable Storage 전환 순서

```text
1. persistent disk 또는 외부 durable DB/storage 선택
2. mount/connection 방식 확정
3. durable DB_PATH 설정
4. REQUIRE_PERSISTENT_DB=1
5. PERSISTENT_STORAGE=0 유지
6. marker record 생성
7. service restart
8. marker 유지 확인
9. redeploy
10. marker 유지 확인
11. PERSISTENT_STORAGE=1
12. /api/readiness 확인
13. ready=true 확인
14. readyForSensitiveCaseStorage=true 확인
15. verified backup 생성
16. host 밖에 backup 보관
17. restore-check
18. 실제 restore rehearsal
19. Core 5 production smoke
```

비용이 발생하는 storage 활성화는 코드 작업과 별도 운영 결정이다.

---

## 5. Backup 생성

기본:

```bash
npm run db:backup
```

기본 출력:

```text
backups/app-<ISO timestamp>.db
```

명시 경로:

```bash
node scripts/db-backup.mjs \
  --source /path/to/app.db \
  --out /secure/path/app-backup.db
```

기존 파일은 기본적으로 덮어쓰지 않는다. 특별히 필요한 경우에만 `--overwrite`를 명시한다.

---

## 6. Backup 성공 조건

`lib/sqlite-backup.js`는 단순 파일 복사 성공만으로 backup을 인정하지 않는다.

필수 검증:

1. `PRAGMA integrity_check = ok`
2. `PRAGMA foreign_key_check` 위반 0건
3. 필수 app table 존재
4. backup 파일 생성 확인

필수 table baseline:

```text
bookings
leads
nomusa
events
notifications
cases
case_events
```

검증에 실패한 새 backup은 제거되고 command는 실패한다.

---

## 7. Restore Check

운영 DB 위에 직접 덮어쓰지 않고 별도 DB로 복원해 확인한다.

```bash
npm run db:restore-check -- --source backups/app-....db
```

기본 흐름:

```text
backup.db
→ temporary restored.db
→ integrity_check
→ foreign_key_check
→ required tables
→ temporary target cleanup
```

별도 target을 남기려면:

```bash
npm run db:restore-check -- \
  --source backups/app-....db \
  --target /secure/test/restored.db
```

기존 target은 자동 덮어쓰지 않는다.

---

## 8. 실제 장애 복구

현재 tooling은 **Production `DB_PATH`를 자동 교체하지 않는다.** 운영자가 검증된 복원본을 선택해 명시적으로 전환해야 한다.

```text
1. 쓰기 트래픽 중지 또는 서비스 중지
2. 사용할 backup 선택
3. db:restore-check 통과
4. 현재 DB 별도 보관
5. durable storage의 새 경로에 복원본 배치
6. DB_PATH를 복원본으로 전환
7. 서비스 시작
8. /api/health
9. /api/readiness
10. readyForSensitiveCaseStorage 확인
11. Admin/Core read 확인
12. synthetic Core Case smoke
```

가능하면 손상 DB를 바로 덮어쓰지 말고 **검증된 새 파일 경로로 전환**한다.

---

## 9. Backup 보관 원칙

- 공개 Git 업로드 금지
- 운영 DB와 같은 단일 디스크에만 보관 금지
- 접근제어가 있는 저장소 사용
- 전송/저장 암호화 사용
- 보존기간 설정
- 개인 다운로드 폴더 장기 방치 금지
- 주기적으로 restore 가능성 확인

권장 baseline:

```text
매일        verified backup
매일/주기적  off-host copy
주 1회      restore-check
월 1회      restore rehearsal/runbook review
주요 법률 배포 시 Core Case smoke
```

---

## 10. Render Persistent Disk 선택 시 예시

예시 mount:

```text
/opt/render/project/src/data
```

환경변수 예시:

```text
DB_PATH=/opt/render/project/src/data/app.db
REQUIRE_PERSISTENT_DB=1
PERSISTENT_STORAGE=0
```

restart/redeploy survival test가 끝난 뒤:

```text
PERSISTENT_STORAGE=1
```

로 변경한다.

---

## 11. 관련 파일

```text
lib/db.js
lib/runtime-readiness.js
lib/sqlite-backup.js
scripts/db-backup.mjs
scripts/db-restore-check.mjs
scripts/readiness-production-smoke.mjs
scripts/production-smoke.mjs
render.yaml
.env.example
docs/RELEASE_CHECKLIST.md
```
