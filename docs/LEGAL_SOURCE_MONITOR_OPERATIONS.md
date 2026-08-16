# Legal Source Monitor 운영 계약

> 목적: 공식 법령·행정 출처의 내용 변경을 저빈도로 감지해 **검토용 DRAFT 후보**만 적재한다.
>
> 이 기능은 법률 변경을 자동 확정하거나 Rule을 자동 수정·활성화하지 않는다.

## 기본 상태

Scheduler는 배포만으로 실행되지 않는다.

- `LEGAL_SOURCE_MONITOR_ENABLED` 기본값: OFF
- `LEGAL_SOURCE_MONITOR_INTERVAL_MS` 기본값: 21,600,000ms (6시간)
- 최소 허용 간격: 3,600,000ms (1시간)
- `DATABASE_URL`이 없으면 활성화 요청이 있어도 Scheduler는 시작하지 않는다.
- 서버 부팅 직후 즉시 점검하지 않는다. 첫 자동 점검은 설정된 interval 이후 실행된다.

## 환경변수

```text
LEGAL_SOURCE_MONITOR_ENABLED=1
LEGAL_SOURCE_MONITOR_INTERVAL_MS=21600000
DATABASE_URL=postgresql://...
```

`LEGAL_SOURCE_MONITOR_INTERVAL_MS`에 1시간보다 작은 값을 넣으면 1시간으로 강제 상향한다.

## 자동 점검 범위

Scheduler는 `legal_source_watches.enabled=true`인 Watch만 최대 100개까지 읽고 순차 실행한다.

```text
Scheduler tick
→ enabled Watch 조회
→ Watch 1 점검
→ Watch 2 점검
→ ...
→ 실행별 결과는 legal_source_monitor_runs에 저장
```

Watch 하나가 실패해도 다음 Watch 점검은 계속한다. 이전 tick이 아직 실행 중이면 새 tick은 건너뛴다.

## 변경 감지 후 처리

첫 성공 실행:

```text
공식 출처 조회
→ normalized content hash 생성
→ BASELINED
→ 후보 생성 없음
```

이후 동일 hash:

```text
UNCHANGED
→ 후보 생성 없음
```

이후 다른 hash:

```text
CHANGE_DETECTED
→ legal_change_candidates DRAFT 생성
→ 사람이 공식 원문 검토
```

자동으로 수행하지 않는 작업:

- Candidate `VERIFIED` 전환
- Rule Proposal 생성
- Fixture 생성 또는 검증
- `READY_FOR_IMPLEMENTATION` 전환
- 실제 JS Rule 변경
- 운영 Rule 활성화
- 고객/기업에 법률 변경 확정 알림

## 장애 원칙

- HTTP 실패 시 마지막 정상 `last_content_hash`를 유지한다.
- 실패한 점검은 `FAILED` run으로 저장한다.
- Scheduler 자체의 Watch별 예외는 다른 Watch 실행을 중단시키지 않는다.
- graceful shutdown 시 Scheduler timer를 먼저 중지한 뒤 runtime storage/PostgreSQL을 닫는다.

## 활성화 절차

운영 활성화 전 다음 순서를 지킨다.

1. `/admin-legal.html`의 공식 출처 모니터에서 Watch를 수동 등록한다.
2. 각 Watch를 수동 실행해 baseline을 확보한다.
3. 반복 수동 실행으로 false-positive/noise가 허용 가능한지 확인한다.
4. 운영 환경에 `LEGAL_SOURCE_MONITOR_ENABLED=1`을 설정한다.
5. 초기에는 기본 6시간 주기를 유지한다.
6. `legal_source_monitor_runs`와 DRAFT 후보 발생량을 관찰한다.
7. 이상 시 환경변수를 OFF하거나 개별 Watch를 중지한다.

자동화의 목적은 **변경 가능성을 놓치지 않는 것**이며, 법적 의미를 자동 확정하는 것이 아니다.
