# 인사야 운영 Runbook

> 기준일: 2026-08-16
> 범위: 현재 SQLite 운영 구조의 백업·복구 검증과 영속 저장 전환 준비

## 1. 현재 운영 데이터 구조

인사야는 기본적으로 다음 SQLite 파일을 사용한다.

```text
data/app.db
```

환경변수 `DB_PATH`가 설정되면 해당 경로를 사용한다.

이 DB에는 Case뿐 아니라 예약·리드·노무사·운영 이벤트 등 서비스 데이터가 함께 저장될 수 있다. 따라서 DB 백업 파일도 개인정보·민감한 노동사건 정보를 포함할 수 있으며 소스 저장소에 커밋하면 안 된다.

`.gitignore`는 `backups/`와 런타임 DB 파일을 제외한다.

---

## 2. 가장 중요한 운영 제약

현재 Render 무료 파일시스템은 장기 영속 저장을 전제로 사용할 수 없다.

즉 아래 두 상태는 다르다.

```text
서비스 코드와 배포 동작 ✅
재배포/재시작 후 사용자 DB 영속 보장 ❌
```

이 문서와 backup tooling은 **복구 가능한 백업 절차를 준비하는 것**이지 무료 Render 디스크를 영속 스토리지로 바꾸는 것이 아니다.

실제 장기 운영 전에는 persistent disk 또는 외부 영속 DB를 선택해야 한다.

---

## 3. 백업 생성

기본 DB를 백업한다.

```bash
npm run db:backup
```

기본 출력 위치:

```text
backups/app-<ISO timestamp>.db
```

다른 DB 경로를 지정할 수 있다.

```bash
node scripts/db-backup.mjs --source /path/to/app.db --out /secure/path/app-backup.db
```

기존 파일을 덮어써야 하는 특별한 경우에만 명시적으로 사용한다.

```bash
node scripts/db-backup.mjs --source /path/to/app.db --out /secure/path/app-backup.db --overwrite
```

기본값은 기존 backup 파일 덮어쓰기를 거부한다.

---

## 4. 백업 성공 조건

단순 파일 생성만으로 성공 처리하지 않는다.

`lib/sqlite-backup.js`는 Node `node:sqlite`의 `backup()` API를 사용한 뒤 다음 검증을 수행한다.

1. SQLite `PRAGMA integrity_check` 결과가 `ok`
2. `PRAGMA foreign_key_check` 위반 0건
3. 필수 앱 테이블 존재
4. backup 파일 실제 생성 확인

기본 필수 테이블:

```text
bookings
leads
nomusa
events
notifications
cases
case_events
```

검증에 실패하면 새로 만든 backup 파일은 제거되고 명령은 실패한다.

---

## 5. 복구 가능성 확인

백업 파일을 실제 운영 DB 위에 덮어쓰지 않고 **별도 임시 DB로 복원하여 검사**한다.

```bash
npm run db:restore-check -- --source backups/app-....db
```

기본 동작:

```text
backup.db
→ OS 임시 폴더의 restored.db
→ integrity_check
→ foreign_key_check
→ 필수 테이블 확인
→ 임시 restored.db 삭제
```

복원 결과 파일을 직접 확인하고 싶으면 별도 target을 지정한다.

```bash
npm run db:restore-check -- \
  --source backups/app-....db \
  --target /secure/test/restored.db
```

`--target`을 지정하면 결과 파일을 남긴다.

기존 target 파일은 자동 덮어쓰지 않는다.

---

## 6. 실제 장애 복구 절차

현재 tooling은 의도적으로 Production `DB_PATH`를 자동 교체하지 않는다.

실제 장애 복구는 다음 순서로 수행한다.

```text
1. 쓰기 트래픽 중지 또는 서비스 중지
2. 사용할 backup 선택
3. db:restore-check 통과 확인
4. 현재 손상/기존 DB 별도 보관
5. 영속 스토리지 내 새 DB 경로에 복원본 배치
6. DB_PATH를 복원본 경로로 지정
7. 서비스 시작
8. /api/health 확인
9. 관리자/Case 핵심 read 확인
10. 합성 Case smoke 확인
```

운영 DB를 삭제한 뒤 backup을 덮어쓰는 방식보다 **새 경로에 검증된 복원본을 만들고 `DB_PATH`를 전환**하는 방식을 우선한다.

---

## 7. 권장 백업 보관 원칙

백업 파일 자체가 민감정보이므로 다음 원칙을 적용한다.

- 공개 Git 저장소 업로드 금지
- 개인 PC 다운로드 폴더 장기 방치 금지
- 접근권한이 통제되는 저장소 사용
- 전송 및 저장 시 암호화가 제공되는 저장소 사용
- 보존기간을 정하고 오래된 backup 자동/수동 삭제
- 운영 DB와 같은 단일 디스크에만 backup을 두지 않음

---

## 8. Persistent storage 전환 시 체크리스트

Render persistent disk 또는 다른 영속 저장소를 선택하면 다음을 확인한다.

```text
[ ] 영속 mount 경로 확정
[ ] DB_PATH를 mount 아래 파일로 설정
[ ] REQUIRE_PERSISTENT_DB=1 활성화
[ ] 최초 배포 후 DB 생성 위치 확인
[ ] 재시작 후 데이터 유지 확인
[ ] 재배포 후 데이터 유지 확인
[ ] db:backup 실행
[ ] backup을 원격 안전 저장소로 복사
[ ] db:restore-check 통과
[ ] 실제 복구 rehearsal 1회
```

비용이 발생하는 인프라 활성화는 코드 배포와 별도 운영 결정으로 한다.

---

## 9. 정기 운영 권장안

장기 운영 시 권장 baseline:

```text
매일        verified DB backup 생성
매일/주기적  backup을 별도 영속 저장소로 이동
주 1회      최신 backup restore-check
월 1회      실제 복구 rehearsal 또는 runbook 검토
법률 배포 시 Case production smoke 확인
```

스케줄 자동화는 실제 영속 저장소가 결정된 뒤 연결한다. 현재 무료 ephemeral disk 안에서 backup만 반복 생성하는 것은 장애 대비 효과가 제한적이다.

---

## 10. 관련 파일

```text
lib/db.js
lib/sqlite-backup.js
scripts/db-backup.mjs
scripts/db-restore-check.mjs
scripts/production-smoke.mjs
docs/STATUS.md
docs/ARCHITECTURE.md
render.yaml
```
