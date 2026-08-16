# 인사야 SaaS — Audit Policy

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 관련 코드: `lib/access-control-contract.js`
> 관련 DB: `audit_logs` in `db/postgres/010_saas_identity.sql`

---

## 1. 목적

Audit Log는 일반 analytics/event log와 다르다.

목적은 다음 질문에 답하는 것이다.

- 누가 어떤 고객 데이터에 접근했는가
- 누가 권한을 바꿨는가
- 누가 Case/문서를 생성·수정·공유·삭제했는가
- 어떤 법률 rule version이 결과에 적용됐는가
- 결제/구독 상태가 누가/무엇에 의해 바뀌었는가
- 운영자가 break-glass 접근을 사용했는가

Audit는 고객 신뢰, 보안사고 조사, Enterprise 요구, 내부 운영 통제의 기반이다.

---

# 2. Audit와 Event Analytics 분리

`events` 테이블은 제품 이용 통계용이다.

예:

- calc 사용
- article view
- booking start

`audit_logs`는 보안/업무 변경 기록이다.

예:

- employee.salary.view
- member.role.change
- case.share
- document.approve

Analytics 이벤트는 보존/집계/샘플링될 수 있지만 Audit는 append-only 원칙을 따른다.

---

# 3. 필수 필드

```text
id
organization_id
actor_user_id
actor_type
action
resource_type
resource_id
result
request_id
ip_hash
metadata
created_at
```

원칙:

- raw access token 금지
- password/session secret 금지
- request body 전체 저장 금지
- 개인정보 원문을 metadata에 복제하지 않음
- IP는 필요 시 hash/축약 저장
- User-Agent 전체가 필요하지 않으면 category 수준으로 축소

---

# 4. 초기 필수 Action

인증:

- auth.login
- auth.logout
- auth.mfa.challenge
- auth.session.revoke

Membership:

- member.invite
- member.invite.revoke
- member.role.change
- member.remove

Employee:

- employee.view
- employee.update
- employee.salary.view
- employee.export

Compliance:

- compliance.action.status
- compliance.action.due_date
- risk.scan

Case:

- case.create
- case.view
- case.update
- case.delete
- case.share
- case.share.revoke

Document:

- document.generate
- document.review
- document.approve
- document.download

Billing:

- billing.account.update
- subscription.create
- subscription.change
- subscription.cancel

Organization:

- organization.delete.request
- organization.delete.cancel
- organization.delete.execute

System:

- retention.delete
- legal.rule.applied
- operator.break_glass.start
- operator.break_glass.end

---

# 5. Read Audit 범위

모든 read를 Audit하면 비용/노이즈가 급증한다.

초기 기준:

항상 기록:

- 급여 열람
- Employee export
- Case 상세 열람
- Document download
- Advisor shared resource access
- Audit export

일반 목록 조회는 민감도와 규모를 보고 단계적으로 조정한다.

---

# 6. Append-only 원칙

Application에서 Audit row 수정/삭제 API를 제공하지 않는다.

고객 Admin도 수정할 수 없다.

정정이 필요하면 기존 로그를 수정하지 않고 별도 correction event를 남긴다.

PostgreSQL RLS/trigger 또는 별도 write-only role은 Enterprise hardening 단계에서 검토한다.

초기에도 repository interface는 insert/read만 노출한다.

---

# 7. Tenant 경계

Audit 조회는 항상 organization scope를 요구한다.

```text
getAudit(orgId, filter)
```

금지:

```text
getAuditById(id)
```

Owner/HR Admin이 자기 Organization Audit만 볼 수 있다.

INTERNAL break-glass Audit는 고객 tenant Audit와 별도 actor_type/reason으로 식별한다.

---

# 8. Retention

초기 가설:

- Free/Starter: 90일
- Standard: 180일
- Pro: 365일
- Enterprise: 계약

실제 값은 Entitlement `audit.retention_days`로 관리한다.

법적/보안사고 hold가 있으면 일반 retention worker가 삭제하지 않는다.

---

# 9. Export

Audit export는 고위험 action이다.

기본 허용:

- Owner
- Enterprise custom role 향후 가능

HR Admin 기본값은 read만, export는 false.

Export 자체도 Audit에 남긴다.

형식:

- CSV
- JSONL

Enterprise 장기적으로 SIEM/API 연동을 검토한다.

---

# 10. 법률 Rule Audit

인사야의 차별점 때문에 `legal.rule.applied`가 중요하다.

Case/Risk 판단에는 최소 다음을 결과 metadata에 연결한다.

```text
rule id
rule version
effective date
reference date
source id
result
```

LLM explanation과 결정론 rule 적용을 구분한다.

금액/기한/법 적용 결과가 어떤 버전으로 계산됐는지 나중에 재현할 수 있어야 한다.

---

# 11. Break-glass Audit

필수 metadata:

```text
reason
support_reference
expires_at
approved_by(optional)
```

break-glass 시작 전에 event를 기록하고, 종료/만료 시 종료 event를 기록한다.

break-glass session에서 수행한 모든 sensitive action은 일반 User action보다 더 강하게 기록한다.

---

# 12. 완료 조건

- sensitive action 전부 action key 보유
- tenant scoped Audit repository
- Audit 수정/삭제 API 없음
- salary/case/document/download/export log
- role change/member removal log
- share grant create/revoke/access log
- subscription change log
- legal rule version log
- break-glass start/end log
- retention entitlement 적용
- Audit export 자체 Audit 기록
