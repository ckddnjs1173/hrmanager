# 08. PostgreSQL Cutover Runbook

> 상태: Bundle 6 — shadow migration / validation 준비 완료용 운영 런북
> 원칙: 유료 DB 생성이나 production cutover는 별도 운영 결정이다. 코드만 병합되었다고 PostgreSQL이 primary가 되지 않는다.

## 1. 현재 상태

현재 production request path는 계속 SQLite다.

```text
HTTP Route
→ existing sync service/repository
→ SQLite
```

Bundle 6가 추가하는 경로는 별도 migration/shadow path다.

```text
SQLite
→ portable export
→ PostgreSQL migrations
→ import
→ semantic validation
→ cutover preflight
```

`STORAGE_DRIVER=postgres`는 아직 허용하지 않는다. 기존 repository/service가 동기 API이므로 PostgreSQL을 primary로 바꾸려면 다음 Bundle에서 async repository cutover가 먼저 완료되어야 한다.

## 2. 사전 조건

- 현재 main Release gate green
- Core 5 production smoke green
- SQLite source DB의 portable export 성공
- PostgreSQL database 준비
- `DATABASE_URL`은 secret 환경변수로만 설정
- source DB backup 별도 보관

## 3. Portable export

```bash
npm run db:export-portable -- --output ./data/cutover.json
```

export에는 각 테이블별 다음 검증값이 포함된다.

- row count
- 원본 SHA-256
- DB 표현 차이를 제거한 semantic SHA-256

semantic checksum은 SQLite의 JSON TEXT / 0·1 boolean과 PostgreSQL의 JSONB / BOOLEAN 차이를 정규화한다.

## 4. PostgreSQL schema 적용

```bash
DATABASE_URL=... npm run db:pg:migrate
```

`db/postgres/*.sql`을 파일명 순서대로 적용한다.

현재 순서:

1. legacy Worker/booking/expert tables
2. SaaS identity/tenant
3. billing/entitlements
4. Business Risk
5. Business onboarding/action support

DDL은 idempotent `CREATE TABLE IF NOT EXISTS` 기반이다.

## 5. 최초 import

빈 target DB:

```bash
DATABASE_URL=... npm run db:pg:import -- --input ./data/cutover.json
```

schema까지 같이 적용:

```bash
DATABASE_URL=... npm run db:pg:import -- --input ./data/cutover.json --migrate
```

이미 데이터가 있으면 기본적으로 import를 거부한다.

검증된 shadow DB를 source export로 완전히 다시 채우는 경우에만:

```bash
DATABASE_URL=... npm run db:pg:import -- --input ./data/cutover.json --replace
```

`--replace`는 destructive operation이므로 production primary DB에서는 사용하지 않는다.

## 6. 데이터 동등성 검증

```bash
DATABASE_URL=... npm run db:pg:validate -- --input ./data/cutover.json
```

12개 기존 production table 전체에 대해:

- source count == target count
- source semantic checksum == target semantic checksum

을 모두 요구한다.

단순 row count만 맞는 것은 migration 성공으로 간주하지 않는다.

## 7. Cutover preflight

```bash
STORAGE_DRIVER=postgres-shadow \
DATABASE_URL=... \
npm run db:pg:cutover-check -- --input ./data/cutover.json
```

성공 조건:

- PostgreSQL 연결 성공
- 12개 legacy table 존재
- 모든 count 동일
- 모든 semantic checksum 동일
- current runtime이 `sqlite` 또는 `postgres-shadow`

성공 메시지:

```text
READY_FOR_ASYNC_REPOSITORY_CUTOVER
```

이는 **PostgreSQL을 production primary로 켜도 된다는 뜻이 아니다.** 다음 async repository Bundle을 시작할 수 있다는 의미다.

## 8. 다음 Bundle의 실제 cutover 순서

다음 Bundle에서 repository/service를 async로 전환한 후에만 다음 절차를 연다.

```text
1. Staging PostgreSQL primary
2. full E2E
3. write/read parity
4. migration rehearsal
5. production write freeze
6. final SQLite export
7. final PostgreSQL import
8. semantic validation
9. STORAGE_DRIVER=postgres
10. restart/redeploy survival
11. production smoke
12. off-host backup + restore rehearsal
```

## 9. Rollback 원칙

PostgreSQL primary 전환 직후 문제가 발생하면:

- 새 write를 즉시 중단
- 원본 SQLite final export와 backup 보존
- cutover 이후 PostgreSQL write가 존재하면 별도 export 후 유실 여부를 먼저 판단
- 무조건 환경변수만 SQLite로 되돌리는 방식은 금지

데이터가 양쪽에 갈라진 상태에서 blind rollback하지 않는다.

## 10. 금지사항

- semantic validation 실패 상태에서 cutover 금지
- `DATABASE_URL` 커밋 금지
- 무료 30일 DB를 장기 production으로 간주 금지
- `STORAGE_DRIVER=postgres`를 async repository 구현 전에 설정 금지
- source backup 없이 destructive `--replace` 실행 금지
