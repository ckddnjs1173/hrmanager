# 인사야 Data Architecture — SQLite → PostgreSQL

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 현재 운영: Render Free Web + SQLite
> 목표: durable PostgreSQL + tenant-safe SaaS data plane

---

## 1. 결론

인사야는 현재 SQLite 단일 파일로 Worker Case, 예약, 리드, 노무사, 운영 이벤트를 저장한다.

1.0 코드 안정성은 확보됐지만 Render Free filesystem은 장기 사용자 데이터 저장소로 사용할 수 없다.

SaaS 확장에서는 결국 multi-tenant PostgreSQL이 필요하므로 다음 원칙을 채택한다.

> **유료 Persistent Disk를 중간 최종구조로 고착시키지 않고 PostgreSQL 전환을 durable storage 해결과 SaaS foundation의 공통 작업으로 사용한다.**

단, 현재 SQLite repository가 synchronous API인 반면 PostgreSQL driver는 asynchronous API이므로 production runtime을 한 PR에서 즉시 교체하지 않는다.

---

# 2. 현재 데이터 구조

현재 주요 저장소:

```text
SQLite app.db
├ bookings
├ booking_events
├ access_logs
├ leads
├ nomusa
├ events
├ notifications
├ nomusa_accounts
├ feedback
├ cases
├ case_events
└ case_access_tokens
```

특징:

- Node built-in `node:sqlite`
- WAL
- foreign_keys ON
- `repo.js`가 legacy 운영 데이터 접근을 캡슐화
- `case-repo.js`가 Worker Case 접근을 캡슐화
- Case token은 SHA-256 hash 저장
- Worker Case JSON aggregate가 여러 JSON text column에 저장

---

# 3. 목표 데이터 구조

```text
Managed PostgreSQL
├ Worker security realm
│  ├ cases
│  ├ case_events
│  └ case_access_tokens
│
├ Public / operation realm
│  ├ bookings
│  ├ leads
│  ├ nomusa
│  ├ events
│  └ ...
│
└ SaaS realm
   ├ users
   ├ auth_identities
   ├ user_sessions
   ├ organizations
   ├ organization_memberships
   ├ workplaces
   ├ compliance_scopes
   ├ employees
   ├ employments
   ├ share_grants
   └ audit_logs
```

초기에는 같은 PostgreSQL cluster/database 안에 있어도 security domain을 데이터 모델과 repository에서 분리한다.

향후 규모/보안 요구가 증가하면 schema 또는 database 물리 분리를 검토한다.

---

# 4. PostgreSQL target schema

현재 코드의 target DDL:

```text
db/postgres/001_legacy_core.sql
db/postgres/010_saas_identity.sql
```

`001_legacy_core.sql`은 현재 1.0 데이터를 손실 없이 옮기기 위한 계약이다.

`010_saas_identity.sql`은 SaaS Foundation의 신규 tenant 데이터 모델이다.

현재 production 앱은 이 SQL을 실행하지 않는다.

실제 cutover 전 별도 migration runner와 repository adapter를 추가한다.

---

# 5. Portable Export

SQLite에서 PostgreSQL로 전환하기 전에 vendor-neutral export를 만든다.

명령:

```bash
npm run db:export-portable
```

출력 format:

```text
insaya-sqlite-portable-v1
```

포함:

- storage contract version
- export timestamp
- table order
- table별 row count
- table별 SHA-256 checksum
- raw row data

목적:

1. SQLite backup과 별도로 migration artifact 확보
2. import 전후 row count 비교
3. export artifact 손상 검출
4. PostgreSQL provider 변경 시에도 동일 migration source 사용

이 export에는 실제 개인정보가 들어갈 수 있으므로 production artifact는 공개 GitHub/일반 로그에 올리지 않는다.

---

# 6. JSON / Boolean 변환

SQLite 현행:

- JSON → TEXT
- boolean → INTEGER 0/1
- timestamp/date → TEXT

PostgreSQL 목표:

- JSON → JSONB
- boolean → BOOLEAN
- timestamp → TIMESTAMPTZ
- date-only → DATE

변환 대상은 `lib/storage-contract.js`에서 관리한다.

Case JSON 필드:

```text
facts
missing_facts
issues
calculations
evidence
actions
documents
legal_sources
meta
```

migration importer는 JSON parse 실패 시 해당 row를 조용히 저장하지 않고 전체 migration을 실패시켜야 한다.

---

# 7. Migration 단계

## Stage A — Contract Freeze

완료 범위:

- 현재 table inventory 고정
- PostgreSQL target DDL
- portable export format
- SaaS tenant DDL
- schema contract tests

이 단계에서는 production SQLite 사용을 유지한다.

## Stage B — Async Repository Boundary

현재:

```text
route/service
→ sync repo
→ node:sqlite
```

목표:

```text
route/service (async)
→ repository interface
├ SQLite adapter
└ PostgreSQL adapter
```

PostgreSQL 지원을 위해 route/service 호출부를 Promise 기반으로 전환한다.

원칙:

- 한 도메인씩 전환
- Core 5 전체를 동시에 rewrite하지 않음
- repository contract test를 SQLite/Postgres adapter 양쪽에 동일 적용

권장 순서:

1. Case read/write
2. Case access token
3. booking/lead
4. expert/partner
5. event/admin statistics

## Stage C — Shadow Validation

PostgreSQL staging DB에서:

```text
portable export
→ import
→ row count validation
→ checksum/logical parity
→ Core 5 API integration test
```

사용자 write를 production PostgreSQL로 보내기 전 read-only 검증을 먼저 한다.

## Stage D — Cutover

권장 절차:

```text
1. maintenance/write freeze
2. SQLite final backup
3. portable final export
4. PostgreSQL import
5. validation
6. DATABASE_URL enable
7. readiness green
8. Core 5 smoke
9. booking/privacy/admin smoke
10. write reopen
```

초기에는 복잡한 dual-write를 하지 않는다.

서비스 규모가 아직 작을 때 짧은 write freeze가 dual-write consistency 문제보다 안전하다.

## Stage E — Post-cutover

- SQLite는 read/write source에서 제거
- migration artifact는 encrypted off-host 보관
- rollback window 이후 폐기 정책 적용
- production backup/restore rehearsal

---

# 8. Rollback

cutover 직후 오류 발생 시:

```text
write freeze 유지
→ PostgreSQL write 중지
→ 문제가 데이터 변환인지 코드인지 판정
```

데이터 write가 PostgreSQL에 이미 발생한 뒤 SQLite로 자동 역복제하지 않는다.

rollback이 필요하면 PostgreSQL에서 portable reverse export 또는 변경분 reconciliation 절차를 사용한다.

따라서 cutover 전에 staging rehearsal이 필수다.

---

# 9. Durable Storage 완료 조건

다음이 끝나야 1.0 GA durable storage blocker를 닫는다.

- managed PostgreSQL production instance
- production repository adapter 사용
- restart/redeploy 후 데이터 유지
- off-host backup 확인
- 실제 restore rehearsal
- restore DB에서 Core 5 read 가능
- readiness가 durable storage를 확인
- production smoke green

단순히 `DATABASE_URL`을 입력했다고 완료로 보지 않는다.

---

# 10. Backup 정책

초기 권장 목표:

```text
RPO: 24시간 이하
RTO: 4시간 이하
```

유료 Business 고객이 생기면:

```text
RPO: 1시간 이하 검토
RTO: 1~2시간 목표
```

백업은 database provider의 snapshot만 믿지 않는다.

최소 두 계층:

1. provider backup / PITR 가능한 tier
2. 정기 logical export를 off-host storage에 저장

복구 테스트 없는 backup은 backup 완료로 보지 않는다.

---

# 11. Object Storage

초기 Employee Lite에는 파일 저장이 필수가 아니다.

Evidence, signed document, attachment 기능이 생기는 시점에 object storage를 추가한다.

DB에는 파일 자체 대신:

```text
object_id
storage_key
content_type
size
sha256
owner_organization_id
classification
created_at
retention_policy
```

를 저장한다.

원칙:

- public bucket 금지
- signed URL short TTL
- tenant prefix만 믿지 않고 DB authorization 재검증
- upload 시 malware/file-type 검증 고려
- 주민등록번호/건강정보 등 고위험 문서는 초기 scope에서 제외

---

# 12. Encryption

## In transit

- TLS 필수
- database external connection도 TLS

## At rest

- managed database/storage encryption 사용
- application secret는 environment/secret manager
- access token 원문 DB 저장 금지

고객 데이터 필드별 application encryption은 위협모델과 검색 요구를 보고 추가한다.

무분별한 field encryption으로 운영/검색을 깨뜨리지 않는다.

---

# 13. Tenant isolation

PostgreSQL 전환 자체가 tenant isolation을 보장하지 않는다.

초기 application-level 기본 규칙:

```text
repository method
(orgContext, resourceId)
```

금지:

```text
repository.get(resourceId)
```

Business tenant resource의 모든 repository는 organization context를 요구한다.

DB Row Level Security는 후속 hardening 후보지만 초기 correctness를 RLS 하나에만 의존하지 않는다.

권장:

```text
Application policy
+ repository scoped query
+ integration IDOR tests
+ 필요 시 PostgreSQL RLS
```

---

# 14. Worker Privacy Boundary

PostgreSQL migration 과정에서 기존 Worker `cases`에 다음 필드를 추가하지 않는다.

```text
organization_id
employer_id
employee_id
```

Worker Case와 Business Employee record 연결은 사용자 명시적 행동 없는 한 존재하지 않는다.

이 원칙은 DB migration 편의를 위해 완화하지 않는다.

---

# 15. Data Retention

기존 Worker/booking retention 정책은 migration 중 유지한다.

SaaS에는 별도 정책이 필요하다.

구분:

- User identity deletion
- Membership removal
- Employee soft deletion
- Organization closure
- audit retention
- billing/legal retention
- legal hold
- backup expiry

Organization deletion은 즉시 cascade hard delete로 구현하지 않는다.

`DELETION_PENDING` grace를 거친 후 별도 deletion worker가 처리한다.

---

# 16. Migration Validation Matrix

| 대상 | 검증 |
|---|---|
| cases | count + JSON parse + Case read/report |
| case_events | count + FK |
| case_access_tokens | hash/expiry + token flow |
| bookings | count + privacy delete flow |
| leads | count + retention flow |
| nomusa | JSON parse + public list |
| partner accounts | token hash verify |
| events | aggregate stats |
| feedback | admin count/list |
| notifications | count/fields |

추가로 empty DB와 real snapshot 모두 테스트한다.

---

# 17. 비용 발생 전 할 수 있는 작업

유료 PostgreSQL 생성 전에 완료 가능:

- DDL 확정
- portable exporter
- repository interface 설계
- SQLite adapter contract test
- PostgreSQL adapter code
- importer code
- Docker/local PostgreSQL integration test
- migration rehearsal fixture
- tenant schema/RBAC/billing schema

실제 비용 발생 단계:

```text
production managed PostgreSQL 생성
→ secret 연결
→ staging/final migration
→ backup 설정
```

---

# 18. 다음 개발 작업

1. `Repository` async contract 정의
2. Case SQLite adapter를 해당 contract로 감싸기
3. PostgreSQL connection/transaction layer
4. PostgreSQL Case adapter
5. adapter parity test
6. portable import command
7. booking/lead adapter 전환
8. staging migration rehearsal
9. production DB 생성
10. cutover

그 다음 Auth / Organization API 개발로 이어간다.
