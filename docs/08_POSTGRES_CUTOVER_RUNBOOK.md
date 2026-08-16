# 08. PostgreSQL Cutover Runbook

> 상태: Bundle 7 — async runtime 지원 완료
> 원칙: 코드가 PostgreSQL runtime을 지원하더라도 실제 DB 생성·비용 발생·production 전환은 별도 운영 결정이다.

## 1. Runtime 구조

애플리케이션의 live HTTP/Case 경로는 async storage facade를 사용한다.

```text
HTTP / Case Service
        ↓
Async Runtime Repository
        ↓
┌───────────────────┬──────────────────┐
│ SQLite adapter    │ PostgreSQL       │
│ 기존 운영 기본값 │ runtime adapter  │
└───────────────────┴──────────────────┘
```

`STORAGE_DRIVER`:

- `sqlite`: SQLite primary
- `postgres-shadow`: migration/validation은 PostgreSQL을 사용하지만 live runtime primary는 SQLite
- `postgres`: live runtime primary를 PostgreSQL로 사용. `DATABASE_URL` 필수

환경변수를 변경하지 않는 한 현재 production은 계속 SQLite다.

## 2. CI 검증

Repository CI는 실제 PostgreSQL service container를 기동하여 다음 흐름을 검증한다.

```text
PostgreSQL schema migration
→ PostgreSQL runtime readiness
→ Wage Case 생성
→ Case token 조회
→ Lead 저장
→ Booking 저장
→ Admin 조회
→ Case 삭제
→ 실제 DB row 확인
```

따라서 adapter 존재 여부만 검사하지 않고 실제 Node/Express/PostgreSQL 연동을 매 PR에서 검증한다.

## 3. Production cutover 전 사전 조건

- main Release gate green
- PostgreSQL runtime CI green
- Chromium E2E green
- 현재 SQLite production smoke green
- production SQLite source backup 확보
- portable export 성공
- 장기 운영용 PostgreSQL 준비
- `DATABASE_URL` secret 설정 준비
- DB backup/restore 정책 확인
- maintenance/write-freeze 시간 확보

## 4. Portable export

```bash
npm run db:export-portable -- --output ./data/cutover.json
```

12개 기존 production table마다 다음을 기록한다.

- row count
- raw SHA-256
- semantic SHA-256

semantic checksum은 SQLite와 PostgreSQL의 표현 차이를 정규화한다.

- JSON TEXT ↔ JSONB
- INTEGER 0/1 ↔ BOOLEAN
- timestamp text ↔ TIMESTAMPTZ/Date
- numeric ID representation

## 5. PostgreSQL schema 적용

```bash
DATABASE_URL=... npm run db:pg:migrate
```

현재 migration 순서:

1. legacy Worker/booking/expert tables
2. SaaS identity/tenant
3. billing/entitlements
4. Business Risk
5. Business onboarding/action support

## 6. Shadow rehearsal

처음에는 production runtime을 변경하지 않는다.

```text
Production SQLite
      ↓ export
Shadow PostgreSQL
      ↓ import
semantic validation
```

빈 target:

```bash
DATABASE_URL=... npm run db:pg:import -- --input ./data/cutover.json --migrate
```

검증:

```bash
DATABASE_URL=... npm run db:pg:validate -- --input ./data/cutover.json
```

preflight:

```bash
STORAGE_DRIVER=postgres-shadow \
DATABASE_URL=... \
npm run db:pg:cutover-check -- --input ./data/cutover.json
```

성공 시:

```text
READY_FOR_POSTGRES_RUNTIME_CUTOVER
```

이 명령은 환경변수를 바꾸거나 production write path를 변경하지 않는다.

## 7. Staging primary rehearsal

production 전에 별도 staging 환경에서:

```text
STORAGE_DRIVER=postgres
DATABASE_URL=<staging postgres>
```

을 적용한다.

필수 검증:

- `/api/readiness` database.engine=`postgres`
- Core 5 create/read/update/report/document/delete
- booking / lead
- Admin
- Partner
- secure summary
- retention
- 개인정보 삭제
- restart survival
- redeploy survival

## 8. Production cutover

실제 전환은 아래 순서를 유지한다.

```text
1. production source SQLite backup
2. write freeze 시작
3. final portable export
4. PostgreSQL final migration
5. final import
6. semantic validation
7. cutover-check
8. DATABASE_URL production secret 확인
9. STORAGE_DRIVER=postgres
10. REQUIRE_PERSISTENT_DB=1
11. deploy/restart
12. /api/readiness 확인
13. Core 5 production smoke
14. booking/Admin smoke
15. write freeze 해제
16. restart/redeploy survival test
17. off-host backup
18. PostgreSQL restore rehearsal
19. 검증 완료 후 PERSISTENT_STORAGE=1
```

`PERSISTENT_STORAGE=1`은 DB가 있다는 이유로 미리 설정하지 않는다. 실제 survival/restore 검증 후에만 올린다.

## 9. Cutover 직후 관찰

최소 확인 항목:

- API 5xx
- DB connection errors
- pool exhaustion
- readiness latency
- Case create/read errors
- access token verify errors
- Booking/Lead insert errors
- Admin query errors
- retention errors

SQLite final backup/export는 안정화 확인 전까지 삭제하지 않는다.

## 10. Rollback

blind rollback 금지.

PostgreSQL 전환 이후 신규 write가 존재할 수 있으므로 단순히 `STORAGE_DRIVER=sqlite`로 되돌리면 데이터가 갈라질 수 있다.

문제 발생 시:

1. 신규 write 중단
2. PostgreSQL 변경분 export/확인
3. SQLite final snapshot과 차이 분석
4. 데이터 유실 없는 rollback/import 경로 결정
5. runtime switch
6. smoke 재검증

## 11. 금지사항

- source backup 없이 cutover 금지
- semantic validation 실패 상태 cutover 금지
- `DATABASE_URL` 저장소 커밋 금지
- 무료 만료형 DB를 장기 production으로 간주 금지
- write freeze 없이 final migration 금지
- production primary DB에 `--replace` 실행 금지
- restore rehearsal 없이 durable storage 완료 선언 금지
