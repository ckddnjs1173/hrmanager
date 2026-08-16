# 인사야 Business — Compliance Action State Machine

> 상태: 구현 기준안
> 기준일: 2026-08-16
> 관련 코드: `lib/compliance-action-contract.js`
> 관련 DB: `compliance_actions`, `compliance_action_events`, `compliance_action_dependencies`

---

## 1. Action의 역할

Risk Finding은 위험을 설명한다.

Compliance Action은 그 위험을 실제 업무로 바꾼다.

```text
Risk Finding
→ Action
→ 담당자
→ 기한
→ 필요한 자료/문서/Case
→ 완료
→ 재평가
```

Business SaaS의 반복 사용 이유는 Risk를 보여주는 것보다 Action을 끝내도록 관리하는 데 있다.

North Star인 `Monthly Resolved Compliance Actions per Active Company`도 Action을 기준으로 측정한다.

---

# 2. 상태

```text
OPEN
IN_PROGRESS
BLOCKED
DONE
DISMISSED
```

## OPEN

해야 할 일이 생성됐지만 아직 착수하지 않은 상태.

## IN_PROGRESS

담당자가 실제 조치를 진행 중인 상태.

## BLOCKED

외부 답변, 사실관계, 문서, 승인 등이 부족해 현재 진행할 수 없는 상태.

`blocked_reason` 필수.

## DONE

요구된 완료 조건을 충족한 상태.

단순 버튼 클릭만으로 법적 리스크가 해소됐다고 간주하지 않는다. Action 유형별 completion check가 있으면 충족 여부를 검증한다.

## DISMISSED

해당 Action을 수행하지 않기로 명시적으로 결정한 상태.

`dismissed_reason` 필수이며 Risk Finding 자체를 삭제하지 않는다.

---

# 3. 허용 전환

```text
OPEN
├ IN_PROGRESS
├ BLOCKED
├ DONE
└ DISMISSED

IN_PROGRESS
├ OPEN
├ BLOCKED
├ DONE
└ DISMISSED

BLOCKED
├ OPEN
├ IN_PROGRESS
└ DISMISSED

DONE
└ OPEN   # reopen

DISMISSED
└ OPEN   # reopen
```

BLOCKED에서 DONE 직행은 금지한다. 먼저 blocker를 해제하고 진행 상태를 복구해야 한다.

DONE/DISMISSED에서 reopen은 history를 지우지 않고 `REOPENED` event를 남긴다.

---

# 4. Action 생성 출처

```text
RISK_FINDING
BUSINESS_CASE
ONBOARDING
MANUAL
LEGAL_CHANGE
MONTHLY_CLOSE
```

동일한 Action이라도 출처를 기록한다.

예:

```text
근로계약서 보완
origin = RISK_FINDING
risk_finding_id = ...
```

또는:

```text
취업규칙 재검토
origin = LEGAL_CHANGE
```

---

# 5. 담당자

Action은 Organization Membership에 배정한다.

```text
owner_membership_id
```

User ID가 아닌 Membership을 사용하는 이유는:

- 회사별 역할이 다름
- Membership 제거 시 담당관계 처리 가능
- tenant 경계 명확

Membership 제거 시 Action을 삭제하지 않는다.

담당자를 unassign하고 관리자에게 재배정 필요 상태를 표시한다.

---

# 6. 기한

`due_at`은 가능한 경우 Rule/법정 기한에서 자동 계산한다.

우선순위:

```text
법정 기한
> 계약/근로관계에서 계산된 기한
> 운영자가 지정한 내부 기한
> 없음
```

AI가 법정 기한을 임의 생성하지 않는다.

기한 변경은 event/audit에 남긴다.

---

# 7. Priority

Risk에서 생성된 Action은 기본적으로 Finding severity를 이어받는다.

```text
CRITICAL
HIGH
MEDIUM
INFO
```

Manager가 화면 표시를 위해 임의로 법률 severity 자체를 바꾸는 기능은 초기에는 제공하지 않는다.

Action 운영 우선순위를 별도로 조정하는 기능이 필요하면 향후 `operational_priority`를 추가한다.

---

# 8. Completion Requirement

Action 유형에 따라 완료 조건을 정의할 수 있다.

예:

```text
contract.review
- 계약서 검토 완료
- 필요한 경우 새 문서 version 생성
```

```text
worktime.fact_check
- 누락 근로시간 fact 입력
- Risk 재평가 완료
```

```text
termination.precheck
- Business Case 완료
- 필수 절차 결과 확인
```

완료조건이 정의된 Action은 `completionSatisfied=true` 없이 DONE으로 전환하지 않는다.

초기 단순 Action은 completion requirement가 없을 수 있다.

---

# 9. Action Event

모든 주요 변경은 append history로 남긴다.

초기 event:

- CREATED
- ASSIGNED
- UNASSIGNED
- STARTED
- BLOCKED
- UNBLOCKED
- COMPLETED
- REOPENED
- DISMISSED
- DUE_DATE_CHANGED
- NOTE_ADDED
- DOCUMENT_LINKED
- CASE_LINKED
- EVIDENCE_LINKED

현재 상태는 `compliance_actions`에서 빠르게 읽고, history는 `compliance_action_events`에 보관한다.

---

# 10. Action Dependency

일부 조치는 선행 업무가 필요하다.

예:

```text
근로시간 사실확인
→ 미지급 수당 재계산
→ 임금 정산 문서 생성
```

`compliance_action_dependencies`로 연결한다.

자기 자신을 dependency로 둘 수 없다.

초기에는 복잡한 DAG scheduler를 만들지 않는다.

UI에서 선행 Action 미완료 시 BLOCKED 안내만 제공해도 충분하다.

---

# 11. Risk 재평가

Action DONE이 곧 Risk RESOLVED를 의미하지 않는다.

정상 흐름:

```text
Action DONE
→ 관련 Facts/Document 상태 반영
→ RiskRule 재평가
→ NOT_APPLIES이면 Finding RESOLVED
→ 여전히 APPLIES면 Finding OPEN 유지/새 Action 검토
```

이 분리가 매우 중요하다.

사용자가 '완료' 버튼을 눌렀다는 이유만으로 법률위험이 사라졌다고 표시하면 안 된다.

---

# 12. Dismiss

DISMISSED는 다음 상황용이다.

- 실제로 해당 조치를 하지 않기로 결정
- 외부 전문가 의견에 따라 다른 방식으로 대응
- 잘못된 사실관계 수정 예정

필수:

- reason
- actor
- event
- audit

Risk Finding은 자동 삭제하지 않는다.

Rule 재평가 결과가 바뀌면 별도로 RESOLVED 처리한다.

---

# 13. Overdue

Action은 다음 조건일 때 overdue다.

```text
status ∈ OPEN, IN_PROGRESS, BLOCKED
AND due_at < now
```

DONE/DISMISSED는 overdue로 계산하지 않는다.

Dashboard에서 Critical/High overdue를 최상단에 노출한다.

---

# 14. Notification 연결

초기 알림 trigger:

- due 7일 전
- due 3일 전
- due 1일 전
- overdue
- blocker 장기화
- 담당자 변경

중복 알림을 막기 위해 향후 notification idempotency/event key를 사용한다.

MVP에서는 이메일/인앱부터 시작하고 문자/카카오 등은 필요 시 추가한다.

---

# 15. Audit

반드시 Audit에 남길 Action:

- 생성
- 담당자 변경
- due date 변경
- BLOCKED/DISMISSED reason
- 완료
- reopen
- linked Case/Document

일반 note는 업무 history에는 남기되 보안 Audit 필요 수준은 정책에 따라 구분할 수 있다.

---

# 16. 권한

초기:

- Owner: 전체 Action
- HR Admin: 전체 Action
- Manager: assigned scope Action
- Employee: 본인에게 노출하도록 설계된 Action만 향후 가능
- External Advisor: ShareGrant에 포함된 Case/Document 검토만, 회사 Action 전체 목록은 기본 비공개
- Billing Admin: 접근 불가

Action 권한은 기존 RBAC + tenant scope를 따른다.

---

# 17. KPI

- Action created
- started rate
- completion rate
- median time to start
- median time to resolve
- overdue rate
- Critical/High overdue count
- reopen rate
- Action 완료 후 Finding resolved rate

---

# 18. 구현 순서

```text
Action repository
→ transition service
→ action event history
→ assignee
→ due date
→ dependency
→ Risk re-evaluation hook
→ notification hook
→ dashboard/list UI
```

---

# 19. 완료 조건

- invalid transition 차단
- BLOCKED reason 필수
- DISMISSED reason 필수
- completion requirement 검사
- DONE/DISMISSED reopen 가능 + history 보존
- Membership 제거 시 Action 보존
- cross-tenant Action 접근 차단
- Action DONE 후 Risk 재평가
- overdue 계산 일관성
- 모든 민감 변경 event/audit 기록
