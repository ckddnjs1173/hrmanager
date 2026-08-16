# 인사야 Product Plan 1.0 — FINAL

> **문서 상태:** 인사야 1.0 제품 방향의 최상위 Source of Truth
> **기준일:** 2026-08-16
> **현재 단계:** Code/Product RC — 핵심 제품 기능 완료, GA는 운영 데이터 영속성 결정 전
> **Production:** https://insaya.onrender.com/

---

## 1. 최종 제품 정의

### 한 문장 정의

**인사야는 근로자가 노동문제를 하나의 Case로 정리하고, 필요한 사실 확인부터 법률 기준·예상 금액·증거·문서·공식 절차·전문가 전달 준비까지 실제 다음 행동으로 이어가게 하는 노동문제 해결 플랫폼이다.**

### 핵심 제품 객체

인사야의 중심은 채팅, 계산기, 문서 또는 가이드가 아니다.

**중심 객체는 `Case(사건)`다.**

```text
사용자 문제
↓
Case 생성
↓
사실 구조화
↓
결정론 Legal / Calculator
↓
증거 상태
↓
다음 행동 1개
↓
공식 근거
↓
문서 초안
↓
공식기관 절차
↓
Case Report
↓
필요 시 전문가 연결 준비
```

AI·계산기·문서·가이드·전문가 검색은 모두 Case를 해결하기 위한 보조 엔진이다.

---

## 2. 인사야가 해결하는 사용자 문제

노동문제를 겪은 사용자가 실제로 궁금한 것은 법률 조문 자체가 아니다.

1. 내 상황이 어떤 사건인가?
2. 아직 어떤 사실을 확인해야 하는가?
3. 지금 확인된 사실만으로 어떤 판단이 가능한가?
4. 받을 수 있는 돈 또는 부담 가능한 금액은 얼마인가?
5. 어떤 증거를 확보해야 하는가?
6. 놓치면 안 되는 기한이나 적용범위가 있는가?
7. 지금 가장 먼저 무엇을 해야 하는가?
8. 필요한 문서는 무엇인가?
9. 어느 공식기관에서 어떤 절차를 밟아야 하는가?
10. 전문가에게 넘길 때 무엇을 정리해야 하는가?

인사야 1.0은 이 질문을 여러 메뉴에 흩어놓지 않고 **하나의 사건 Workspace에서 연결**한다.

---

## 3. 1.0 사용자 우선순위

### Primary — 근로자

1.0의 홈과 핵심 Case는 근로자를 우선한다.

사용 시점은 대체로 다음 중 하나다.

- 임금이 지급되지 않았다.
- 퇴사 또는 해고가 발생했다.
- 퇴직급여를 확인해야 한다.
- 연장·야간·휴일근로와 수당이 맞는지 확인해야 한다.
- 연차 발생·미사용수당을 확인해야 한다.

### Secondary — 사업주

기존 사업주 콘텐츠·도구는 유지하지만 근로자 Case UX와 섞어 1.0 핵심 범위를 확대하지 않는다.

향후 사업주 제품은 다음 문제를 중심으로 별도 설계한다.

```text
사업장 기본정보
→ 사전 위험진단
→ 위험 항목
→ 조치 체크리스트
→ 계약/임금/근태/해고 전 문서
→ 전문가 자문
```

### Tertiary — 공인노무사

노무사는 Case 해결의 후단 선택지다.

- 공개 프로필/분야/지역 검색
- 사용자가 직접 비교·선택
- 명시적 동의 후 상담 정보 전달
- 운영자 발급 파트너 접근
- 배정 상담 조회 및 진행 상태 관리

1.0은 사건 성사·수임료 비율 기반 중개 수수료 모델을 전제로 하지 않는다.

---

## 4. 인사야 1.0 핵심 Scope

### Core 5 Cases

아래 다섯 사건이 1.0의 제품 완성 기준이다.

| Case | 사용자 진입 | 핵심 해결 목표 |
|---|---|---|
| 임금체불 | `/wage-intake` | 미지급 임금·지연 쟁점·증거·진정 준비 |
| 해고·권고사직 | `/dismissal-intake` | 종료 성격·해고예고·부당해고 구제 범위·절차 |
| 퇴직금·퇴직연금 | `/retirement-intake` | 적용요건·퇴직급여 잠정 계산·지급 요청/진정 |
| 근로시간·수당 | `/worktime-intake` | 연장·야간·휴일 가산, 한도·휴게 쟁점, 미지급액 |
| 연차 | `/annual-leave-intake` | 발생일수·경계일·미사용일수·수당·사용촉진 검토 |

각 Case의 Definition of Done은 다음과 같다.

```text
진입
✓ 필수 사실 확인
✓ 미확인 사실 표시
✓ 법률 적용범위 판단
✓ 계산 또는 핵심 assessment
✓ 증거 체크
✓ 다음 행동 제시
✓ 공식 법률/기관 근거
✓ 사건 데이터가 반영된 문서
✓ 공식기관 절차
✓ Case Report
✓ 삭제 가능
```

### Supporting Capabilities

기존 기능은 폐기하지 않고 다음 역할로 재정의한다.

| 기존 기능 | 1.0 역할 |
|---|---|
| AI 상담 | 자유 질문, 사건 분류·설명 보조 |
| 기존 계산기 | SEO/독립 도구 + 향후 Case 엔진으로 수렴 |
| 문서센터·문서팩 | Case 문서 엔진 + 독립 문서 검색 |
| 노동 가이드 | SEO·교육·사건 이해 보조 |
| 노무사 검색 | 필요 시 후단 전문가 선택 |
| 상담 요약/보안 링크 | 전문가 전달용 정보 열람 |
| Admin | 예약·리드·전문가·알림 운영 |
| Partner | 배정 상담 조회·상태/메모 관리 |

---

## 5. 1.0에서 하지 않는 것

범위를 다시 넓히지 않기 위해 아래 항목은 1.0 GA 필수범위에서 제외한다.

- Core Case 6번째 유형 추가
- React/Next.js 등으로 전체 프론트 재작성
- 사용자 계정·소셜 로그인
- 여러 기기에서 동기화되는 `내 사건` 계정 대시보드
- 자동 노무사 추천/배정 알고리즘
- 사건 수임 성공보수/소개 수수료 모델
- AI가 법정 금액·기한·법률 상수를 직접 추론해 확정하는 구조
- 사업주 SaaS 전체 제품화
- 노무사 CRM 전체 제품화
- legacy 계산기·가이드 전체를 한 번에 새 구조로 이동

이 항목들은 1.0 출시를 지연시키지 않고 이후 단계에서 별도 검토한다.

---

## 6. 1.0 사용자 모델 — 익명 Case

현재 Case는 계정 기반 보관함이 아니라 **익명·토큰 보호 사건**이다.

### 현재 동작

- 사건 생성 시 opaque access token 발급
- 서버는 token 원문을 DB에 저장하지 않음
- 브라우저는 `sessionStorage`에만 token 저장
- Case ID만으로 조회 불가
- `x-case-token` 또는 Bearer token 필요
- token 만료
- 삭제 시 접근 폐기
- 방치 Case lifecycle 정리

### 제품 의미

1.0의 `내 사건`은 **현재 브라우저 세션에서 다루는 사건 Workspace**를 의미한다.

계정형 `내 사건 목록`, 여러 기기 동기화, 장기 로그인 복구는 1.1+ 후보이며 영속 DB와 개인정보 설계를 먼저 확정한 뒤 도입한다.

---

## 7. Case 공통 UX

### Intake

- 한 번에 필요한 질문만 제시
- 모르는 사실을 강제로 추정하지 않음
- 법률 판단에 필요한 fact를 구조화
- missing fact를 명시적으로 유지

### Workspace

Workspace의 정보 우선순위는 고정한다.

```text
1. 지금 확인된 사건 상태
2. 가장 중요한 판단/금액
3. 아직 확인할 사실
4. 증거
5. 다음 행동
6. 공식 근거
7. 문서
8. 공식기관 절차
9. Case Report
```

### Primary Action

가능하면 한 화면에서 가장 중요한 다음 행동 하나를 강조한다.

예:

- 체불액 확인 정보 보완
- 해고통지 증거 저장
- 내용증명 초안 확인
- 노동위원회 구제신청 준비
- 노동포털 진정 준비

사용자를 모든 도구로 동시에 보내지 않는다.

---

## 8. 정확도 설계

### 원칙

**AI가 설명하고, 명확한 법정 규칙은 결정론 엔진이 계산한다.**

```text
Facts
↓
Case Rule / Calculator
↓
Legal Context
↓
{
  assessment,
  amount,
  assumptions,
  sources,
  warnings,
  verifiedAt
}
↓
UI / AI Explanation
```

### Legal Registry

현재 다섯 Case는 공통 `Legal Registry` adapter로 공식 source 계약을 관리한다.

중요한 원칙:

- 공식 출처 우선
- 사건 기준일 고려
- 법령 유효기간/미래 시행 경계 관리
- unsupported date를 현재 규칙으로 조용히 fallback하지 않음
- 같은 법률 source ID의 authority/article 충돌 검출
- 법정 숫자와 계산 결과를 AI 문장보다 우선

### AI 역할

AI는 다음에 집중한다.

1. 자연어 질문 이해
2. 사건 주제 분류
3. 자유 질문 설명
4. 검증된 결과를 생활 언어로 설명
5. 상담 요약 구조화

AI provider가 없어도 Core Case의 결정론 기능은 동작해야 한다.

---

## 9. Evidence / Document / Procedure

### Evidence

증거는 단순 안내 문장이 아니라 Case 상태의 일부다.

- 보유
- 확보 예정
- 없음/확인 필요

등을 사건 상태와 함께 유지한다.

### Document

Case 문서는 다음 원칙을 따른다.

```text
Case facts + calculation
→ resource prefill
→ server document template
→ JSON
→ browser plain-text preview
```

사용자 입력을 HTML로 실행하지 않는다.

### Official Procedure

Case는 가능한 범위에서 공식기관으로 연결한다.

- 고용노동부 노동포털
- 노동위원회
- 기타 공식 출처

인사야 내부 체류시간보다 사용자가 실제 해결 행동으로 이동하는 것을 우선한다.

---

## 10. Expert Handoff

전문가 연결은 다음 원칙을 유지한다.

```text
사용자가 상담 선택
↓
명시적 동의
↓
상담 요청 저장
↓
필요 정보 요약
↓
만료되는 보안 열람 링크
↓
노무사/운영자 상담 진행
```

보안 요약 링크는:

- token lookup
- 만료
- noindex
- 사용자 입력 escape
- 접근 로그
- IP 원문 대신 hash

를 적용한다.

---

## 11. 현재 기술 구조

### Frontend

```text
Legacy Home
├─ index.html
├─ product-home adapter
├─ content/home-navigation.js   ← Content Source 분리 시작
└─ Case launcher

Core Case Workspaces
├─ wage
├─ dismissal
├─ retirement
├─ worktime
└─ annual leave

Shared Case Frontend
├─ CaseAccessClient
├─ common token/API transport
├─ document/report/delete helpers
└─ case-workspace-core.css
```

### Server

`server.js`는 현재 bootstrap 역할만 담당한다.

```text
server.js
↓
lib/application.js
├─ Case routes
├─ AI routes
├─ Document routes
├─ Expert routes
├─ Public operation routes
├─ Admin routes
├─ Partner routes
├─ Secure summary route
├─ HTTP security middleware
├─ session security
└─ rate limiter
```

### Persistence

- Node built-in SQLite
- Case + 예약/리드/운영 데이터
- online SQLite backup tooling
- restore-check tooling
- runtime readiness probe

---

## 12. 개인정보·보안 원칙

1. Core Case 계산에 불필요한 실명·회사명을 요구하지 않는다.
2. Case access token 원문을 DB에 저장하지 않는다.
3. 브라우저 token은 sessionStorage에만 둔다.
4. 문서 preview는 plain text를 기본으로 한다.
5. 관리자/파트너 세션은 HMAC signed cookie를 사용한다.
6. 쿠키는 HttpOnly, SameSite=Strict, HTTPS에서 Secure를 적용한다.
7. 관리자 token 비교는 timing-safe 방식으로 처리한다.
8. 쓰기 요청의 관리자/파트너 세션은 CSRF 검사를 유지한다.
9. AI·Case·공개 입력 API에 rate limit을 둔다.
10. 보안 헤더와 CSP를 유지한다.
11. 삭제 요청과 retention sweep을 제공한다.
12. 전문가 전달은 명시적 동의를 전제로 한다.

---

## 13. Content Strategy

### 역할

콘텐츠는 제품의 목적이 아니라 **검색 유입 → 문제 이해 → Case 시작**을 연결한다.

### 구조 원칙

```text
content source
├─ 앱 UI
└─ SEO build
```

동일 내용을 `index.html`, SEO 페이지, 별도 문서에서 각각 수동 관리하는 구조를 줄인다.

### 현재 전환 상태

- 홈 근로자/사업주 IA 데이터: `content/home-navigation.js`로 첫 분리
- legacy 가이드/법률/계산기 설명: 아직 `index.html`에 상당 부분 존재
- 전체 monolith를 한 번에 이동하지 않고 block 단위로 외부 source에 수렴

다음 content migration 우선순위:

1. `TOPICS` / guide catalog
2. `ARTICLES` / article metadata 및 본문
3. legacy legal copy
4. calculator metadata
5. SEO builder가 같은 원본을 직접 소비

이 작업은 GA 차단조건이 아니라 유지보수 P1/P2다.

---

## 14. Product Metrics

### North Star

**사건 해결 준비 완료율**

정의:

```text
Case 생성
→ 필수 정보가 의미 있게 채워짐
→ 사용자가 구체적인 다음 행동을 최소 1개 실행
```

### 핵심 퍼널

```text
방문
→ Case 시작
→ Intake 진행
→ Workspace 도달
→ 계산/판단 확인
→ 증거/문서 행동
→ 공식기관 또는 전문가 후속 행동
```

### 보조 지표

- Case 시작률
- 단계별 이탈률
- missing fact 보완율
- 문서 생성률
- Case Report 복사율
- 공식기관 CTA 클릭률
- 상담 요청률
- 오류율/429율
- AI 피드백/오답 신고

페이지뷰·체류시간 자체를 제품 성공의 최우선 지표로 두지 않는다.

---

## 15. 1.0 Release State

### Code/Product RC — 완료 기준

현재 코드에서 다음 항목은 갖춰져 있다.

- Core 5 Case vertical slice
- 공통 Case registry
- 공통 Legal registry adapter
- 결정론 계산/판단
- 증거·문서·공식 절차·Report
- token protected Case
- token expiry / retention / deletion
- 실제 Chromium desktop/mobile 회귀
- PR Release gate
- exact-SHA Render production smoke
- runtime readiness
- SQLite online backup
- restore-check
- AI/문서/전문가/공개운영/Admin/Partner router 분리
- server bootstrap 분리
- Content Source migration 시작

따라서 **제품 코드 자체는 1.0 RC 상태**로 본다.

### GA Blocker — 운영 데이터 영속성

현재 Render free filesystem은 SQLite 사용자 데이터를 장기 보존하는 운영 전제로 사용할 수 없다.

GA 전 반드시 아래를 결정한다.

```text
1. 영속 저장소 선택
2. DB_PATH를 영속 경로로 고정
3. REQUIRE_PERSISTENT_DB=1
4. restart 후 marker 데이터 유지 확인
5. redeploy 후 marker 데이터 유지 확인
6. db:backup 성공
7. backup을 서비스 호스트 밖 안전한 위치에 보관
8. db:restore-check 성공
9. 실제 복구 rehearsal
10. readiness + 5 Case production smoke 재통과
```

**비용이 발생하는 Render Persistent Disk 또는 외부 DB는 자동으로 활성화하지 않는다.**

---

## 16. GA 이후 우선순위

### P1 — 운영 안정화

- 실제 영속 저장/백업 스케줄 운영
- 에러/가용성 모니터링 연결
- 운영 알림 정책
- 관리자 운영 UX 개선
- 개인정보 보존기간 운영 점검

### P1 — Content / Legacy Single Source

- `TOPICS` / `ARTICLES` 외부 source 이동
- legacy 법률 숫자를 Legal Registry로 수렴
- 계산기 설명/법률 copy 중복 제거
- SEO builder와 UI의 source 통일

### P1 — UX 접근성/완성도

- 키보드 흐름 전체 점검
- focus state
- 명도 대비
- 오류/재시도/만료 상태 표준화
- 모바일 소형 화면 추가 검증

### P2 — Account-based My Cases

영속 저장과 개인정보 정책이 안정된 뒤 검토한다.

- 계정
- 사건 목록
- 여러 기기 복구
- 사건 상태 알림
- 장기 보관/삭제정책

### P2 — 사업주 제품

- 사업장 진단
- 계약/근태/연차/해고 전 체크
- 법정 일정
- 문서관리
- 전문가 자문

### P2 — 노무사 제품

- 입점 관리
- 프로필 강화
- 상담 CRM
- 예약/진행관리
- 구독/SaaS

---

## 17. 수익모델 방향

### 근로자

Core 문제 해결 경험은 무료 접근을 기본으로 한다.

### 공인노무사

후보 모델:

- 입점 구독
- 프로필 강화
- 스폰서 노출
- 지역/분야 광고
- 예약관리 SaaS
- 상담 CRM

### 사업주

후보 모델:

- 고급 리스크 진단
- 사업장 문서관리
- 노무 일정/리마인더
- 템플릿/워크플로
- 전문가 자문 구독 연결

### 사용하지 않는 방향

- 사건 성사 수수료
- 수임료 비율
- 승소/성공보수 연동

---

## 18. 제품 의사결정 동결 항목

1. **1.0 Core Case는 현재 5개로 동결한다.**
2. **새 기능 개수보다 기존 Case 완결성과 운영 안정성을 우선한다.**
3. **AI는 명확한 법정 계산의 Source of Truth가 아니다.**
4. **법률/계산 결과는 결정론 모듈과 공식 source를 우선한다.**
5. **전체 프론트 프레임워크 재작성은 1.0 과제가 아니다.**
6. **`server.js`에 도메인 endpoint를 다시 집중시키지 않는다.**
7. **Content Source는 대형 rewrite가 아니라 block 단위로 이동한다.**
8. **계정형 내 사건은 영속성 확보 전 도입하지 않는다.**
9. **사업주·노무사 확장은 근로자 Core Case와 화면을 섞어 범위를 흐리지 않는다.**
10. **유료 인프라 변경은 별도 운영 의사결정으로 남긴다.**

---

## 19. 최종 실행 순서

```text
[완료] 제품 기준 확정
[완료] 테스트/CI/배포 검증 기반
[완료] Case 데이터/Workspace 기반
[완료] Core 5 Cases
[완료] Case / Legal registry
[완료] Case frontend 공통 transport/CSS
[완료] server domain router 분리
[완료] server bootstrap/보안 infra 분리
[시작] Content Source 점진 분리

→ [GA 필수] 운영 DB 영속성 선택·검증
→ [GA 필수] backup 외부보관 + restore rehearsal
→ 1.0 GA

→ Content/Legal legacy single-source 지속
→ 운영/접근성 고도화
→ Account My Cases 검토
→ 사업주 제품
→ 노무사 SaaS/수익화
```

---

## 20. 최종 제품 판단 기준

새 아이디어가 나올 때는 아래 순서로 판단한다.

1. Core 5 Case 사용자가 문제를 더 잘 해결하게 만드는가?
2. 법률 정확도 또는 증거/행동 실행 가능성을 높이는가?
3. 운영 안정성·개인정보 안전성을 높이는가?
4. 기존 엔진을 재사용할 수 있는가?
5. GA를 불필요하게 늦추지는 않는가?

위 질문에 해당하지 않는 기능은 1.0에 추가하지 않는다.

**인사야 1.0의 목표는 더 많은 메뉴를 만드는 것이 아니라, 사용자가 노동문제 하나를 실제 해결 단계까지 가져갈 수 있게 하는 것이다.**