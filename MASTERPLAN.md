# 노무AI 제품화 마스터 기획서

> 단일 기준 문서. 흩어진 기획(`PAGES.md` 페이지 지도 · `POLISH.md` UI 진단 · `OPERATIONS.md` 연계 · `design/01~09` 디자인 시스템)을 묶어 **"무엇을 제품 수준으로 만들 것인가 + 백엔드를 어떻게 업데이트할 것인가"**를 확정한다.
> **원칙**: ① 사용자가 보기 편한 **정돈된 제품급 UI** ② 기능을 받쳐주는 **견고한 백엔드** ③ **실제 AI(Anthropic) 연결은 가장 마지막** ④ 무자본 — 외부 유료 의존 최소화.

---

## 0. 제품 한 줄 정의
근로자·사업주가 노무 문제를 **한 곳에서** 진단·계산·문서·연계까지 끝내는 플랫폼. 수익은 노무사 **입점·구독**(사건 수수료 아님). 운영자는 접수를 **검수·전달**한다.

---

## 1. 아키텍처: 현재 → 목표

| 영역 | 현재 | 목표(제품) |
|---|---|---|
| 프론트 | 단일 `index.html` SPA + 분리된 `admin.html` | SPA + 대시보드, **공통 디자인 토큰 CSS 공유** |
| 스타일 | SPA는 토큰화 / admin·보안열람·정적글은 **자체 CSS(단절)** | `assets/brand/app.css` 한 곳에서 토큰·컴포넌트 공유 |
| 저장 | `data/*.json` 플랫 파일 | **SQLite**(단일 파일·쿼리·동시성) + 저장소 추상화 레이어 |
| 인증 | admin 단일 토큰(헤더 에코) | **서명 세션 쿠키** + 토큰, 로그인 보호, 감사 로그 |
| 데이터 접근 | 전체 반환 후 클라 필터 | **서버 측 검색·필터·페이지네이션** |
| 개인정보 | 7일 만료 토큰·마스킹 | + **열람 로그·보존 정책 자동 파기·삭제요청 처리** |
| 알림 | 운영자 수동 | **알림 추상화 레이어**(콘솔/이메일 어댑터, 키는 나중) |
| AI | 데모 폴백 + 키 연결부 존재 | **마지막에** 키 연결만 |

---

## 2. UI/UX 시스템 — "제품급"의 정의
(상세 토큰은 `design/01~09`, 진단·페이지 목표는 `POLISH.md`. 여기서는 전 페이지 공통 합격선.)

- **레이아웃**: 최대폭·여백 토큰 일관. 대시보드는 좌측 사이드바 + 콘텐츠. 콘텐츠 위계(제목→서브→본문) 명확.
- **타이포**: Pretendard, rem(루트 20px). 큼직·정렬·줄간격 일관.
- **컴포넌트 표준화**: 카드 / 버튼(primary·ghost·xs) / 뱃지(상태색) / 표 / 입력·셀렉트 / 탭·세그먼트 / 빈상태 / 토스트 / 모달 — **단일 정의 재사용**.
- **상태 전수**: 로딩(스켈레톤) · 빈 상태(아이콘+안내+행동) · 에러(재시도) · 성공(토스트).
- **반응형**: 360px까지 정렬 유지(대시보드 표는 카드 폴백).
- **접근성**: 포커스링·aria-live·대비 AA·키보드.
- **마이크로카피·톤**: 친절·구체. "추천 아님"·면책·마스킹 일관.
- **콘텐츠 깊이**: 정보 글 18편 전부 **리치(탭·표·다이어그램)** 격 통일.

---

## 3. 페이지별 제품화 목표 (요약 — 상세는 POLISH.md)
| 우선 | 페이지 | 현재 | To-be 핵심 |
|---|---|---|---|
| P1 | **운영자 대시보드** `/admin` | C | 디자인시스템 적용·통계보드·상태탭/검색·빈/로딩·운영흐름 안내·인라인 편집 |
| P2 | **보안 열람** `/r/:token` | C | 브랜드 헤더·신뢰요소·인쇄친화·만료/오류 동일 톤·열람 로그 |
| P3 | **정보 가이드 6편** | B− | 리치화(탭·표·타임라인·자가진단·임베드) — 12편과 통일 |
| P4 | **진단결과·요약서** | B | 시각 리포트/문서 격식·인쇄·보안링크 |
| P5 | **정적 SEO 글 18종** | B− | 경량 비주얼(요약박스·표) + SPA 리치판 동선 |
| 상시 | SPA 메인(A) | A | 회귀 방지·소폭 다듬기 |

---

## 4. 백엔드 업데이트 (상세) — **AI 키 불필요 범위**

### 4.1 저장소: 플랫 JSON → SQLite + 저장소 레이어
- **선택**: `better-sqlite3`(성숙·동기 API·이 규모에 최적) **권장**. *대안*: Node 22+ 내장 `node:sqlite`(무의존·실험적). → §7 결정.
- **구조**: `lib/db.js`(연결·마이그레이션) + `lib/repo/*.js`(bookings/leads/nomusa/events 등 도메인별 함수). **라우트는 repo만 호출** → 추후 저장소 교체 용이.
- **마이그레이션**: `scripts/migrate-json-to-db.mjs` — 기존 `data/*.json`을 1회 이관(idempotent).
- **영속성**: 호스트 디스크에 `data/app.db`. 무료 플랜은 비영구 → 유료 디스크 마운트 안내(`render.yaml`).

### 4.2 데이터 모델 (테이블)
```
bookings(
  id TEXT PK, created_at, status,            -- received|reviewed|sent|in_progress|done|canceled
  name, contact, nomu_requested, message,
  summary_json,                              -- 구조화 요약(마스킹 전 원본은 저장 안 함/마스킹본)
  consent INTEGER, consent_at,
  assigned_nomusa_id, memo,
  token, token_expires, deleted_at )
booking_events( id PK, booking_id FK, at, type, actor, note )   -- 상태전환·메모 이력(감사)
access_logs( id PK, booking_id FK, token, at, ip_hash, ua )     -- /r 열람 기록
leads( id PK, created_at, kind, name, contact, message, status )
nomusa( id PK, name, org, sido, gu, fields_json, tel,
        verified INTEGER, source, featured INTEGER, opted_out INTEGER, profile_json )
events( id PK, at, type, ref, meta_json )                       -- 경량 분석(개인정보 비식별)
operators( id PK, name, token_hash, created_at )                -- 다중 운영자(선택)
-- (후속) nomusa_accounts( id, nomusa_id, login_token_hash, last_login )
```

### 4.3 API 명세 (목표)
| 메서드·경로 | 인증 | 파라미터 | 반환 |
|---|---|---|---|
| `GET /api/health` | - | - | `{ai,model,version}` |
| `POST /api/chat` | - | messages | (스트리밍) — **키 연결은 최후** |
| `POST /api/summary` | - | messages | 구조화 JSON — **최후** |
| `GET /api/docs` · `POST /api/doc` | - | key,values | 목록 / 렌더 |
| `GET /api/docpacks` · `POST /api/docpack` | - | key,values | 팩 목록 / 묶음 렌더 |
| `GET /api/nomu` | - | `sido,gu,field,q,page,size` | **서버 페이지네이션** `{items,total,page}` |
| `GET /api/nomu/:id` | - | - | 프로필 상세 |
| `POST /api/lead` | rate-limit | kind,name,contact,message | `{ok,id}` |
| `POST /api/booking` | rate-limit | …,consent(필수) | `{ok,id}` (토큰·만료 생성 + 알림 트리거) |
| `GET /r/:token` | 토큰 | - | 보안 요약 HTML(+열람 로그) |
| `POST /api/privacy/delete` | 토큰/연락처 | - | 삭제요청 접수 |
| `GET /api/admin/summary` | 세션 | - | 통계(접수/처리중/완료/전환율/주간) |
| `GET /api/admin/bookings` | 세션 | `status,q,page` | 목록(필터·검색·페이지) |
| `POST /api/admin/bookings/:id` | 세션 | status/assigned/memo | 갱신(+이벤트 기록) |
| `GET /api/admin/leads` | 세션 | `kind,page` | 리드 목록 |
| `POST /api/admin/login` · `/logout` | - / 세션 | token | 세션 쿠키 발급/파기 |
| `GET /api/search` | - | `q` | 글·문서 통합 검색(서버) |

### 4.4 인증·보안
- **세션**: admin 로그인 시 **서명 쿠키**(HttpOnly·SameSite=Strict·Secure) 발급. 헤더 토큰 에코 폐기.
- **로그인 보호**: 시도 횟수 제한(지연/락아웃), `ADMIN_TOKEN` 해시 비교.
- **CSRF**: admin POST에 토큰(쿠키+헤더 더블서밋).
- **레이트리밋**: `/api/lead`·`/api/booking`·로그인에 IP 기준 제한(메모리/`express-rate-limit`).
- **헤더**: `helmet`(CSP·noSniff·frameguard 등), 캐시 정책 유지.
- **검증**: 입력 길이·형식 검증 헬퍼(현행 `clean()` 확장), 화이트리스트 상태값.
- **로깅**: 구조화 액세스/에러 로그, 예약 상태전환·열람 감사.

### 4.5 개인정보·보존·감사 (법적 필수)
- **열람 로그**: `/r/:token` 접근 시 `access_logs` 기록(IP 해시·시각·UA) — 분쟁 대비.
- **자동 파기**: 만료 토큰·1년 경과·미수락 건을 주기 정리(`scripts/retention.mjs` 또는 서버 기동 시 sweep).
- **삭제요청**: `POST /api/privacy/delete`(토큰/연락처 확인) → 소프트 삭제 후 파기. 처리방침과 정합.
- **최소수집·마스킹**: 회사명·실명 마스킹본만 전달, 원문 비저장 원칙.

### 4.6 검색·필터·페이지네이션
- 노무사: 서버 쿼리(`sido,gu,field,q`) + 페이지네이션 → 데이터 7,113건 확장 대비. featured·verified 우선 정렬, opted_out 제외.
- 통합 검색 `/api/search`: 글·문서 제목/요약 인덱스(메모리). 클라 단독 검색 의존 축소.

### 4.7 알림 추상화 (키 없이 지금 구축)
- `lib/notify.js` — `notify({channel, to, template, data})` 인터페이스 + **어댑터**: `console`(기본)·`email(SMTP)`·`kakao(알림톡)`. 키 없으면 콘솔/대기열에 적재, 대시보드에서 **수동 전달**(현행) 유지.
- 예약 접수 시 트리거(운영자 알림). 키 확보 시 어댑터만 교체 → 자동화.

### 4.8 이벤트·분석 (경량·비식별)
- `events` 테이블에 페이지뷰·계산기 사용·예약 퍼널 단계 기록(개인정보 제외). 대시보드에 전환 지표 노출. 외부 추적기 불필요(무자본).

### 4.9 노무사 대시보드 백엔드 (후속 단계)
- `nomusa_accounts` + **매직링크/초대 토큰** 로그인(비밀번호리스). 배정된 예약만 스코프 조회·수락·메모. 알림 트리거와 연동. (입점사 늘면 착수)

### 4.10 마이그레이션·롤아웃
- `migrate-json-to-db.mjs`로 기존 데이터 이관 → 라우트를 repo로 교체 → JSON 경로 제거. 단계별 배포·롤백 가능.

---

## 5. 의존성·비용 (무자본 점검)
- 저장소: **Node 내장 `node:sqlite`** 채택(better-sqlite3 대신 — **무의존·네이티브 빌드 불필요**, Node 22.5+). 추가 패키지 0.
- 남은 후보 의존: `helmet`·`express-rate-limit`(또는 자체 구현), 쿠키 서명(내장 `crypto`). **전부 무료.** 외부 SaaS 0.
- 알림(SMTP/카카오)·실제 AI 키만 **유료/외부** → 가장 마지막 단계.

---

## 6. 로드맵 (단계 · 각 단계 후 확인)
1. ✅ **공통 디자인 토큰 CSS 추출** (`assets/brand/app.css`)
2. ✅ **운영자 대시보드 UI 전면 재설계** — 사이드바·통계보드·상태탭/검색·빈/로딩·운영흐름·인라인편집·**노무사 관리(노출/추천 토글)**. 백엔드 `GET/POST /api/admin/nomu` + 공개 목록 옵트아웃 제외·featured 정렬 추가.
3. ✅ **백엔드 저장소 SQLite 전환** — Node 내장 `node:sqlite`(무의존). `lib/db.js`(스키마: bookings·booking_events·access_logs·leads·nomusa·events) + `lib/repo.js`(도메인 함수) + `scripts/migrate-json-to-db.mjs`. 라우트 전부 repo 사용. 노무사 DB 자동 시드. **감사 이벤트·열람 로그·통계·페이지네이션 API** 추가(`/api/admin/summary`·`/api/admin/bookings`).
4. ✅ **admin API 고도화 + 인증 강화** — 통계·검색·필터·감사·열람로그 + **서명 세션 쿠키(HttpOnly·SameSite=Strict)·CSRF(더블서밋)·레이트리밋·보안헤더(CSP 등)**. 전부 Node 내장만 사용(무의존). 헤더 토큰 호환 유지.
5. ✅ **보안 열람 페이지 리디자인** — `app.css` 브랜드 헤더 + 요약 카드·전화/인쇄 액션·신뢰 안내·브랜드 오류화면. 열람 로그 포함.
6. ✅ **개인정보 보존·삭제 자동화** — 기동 시+1일 주기 `retentionSweep`(1년 경과 완전삭제·미수락 30일 소프트삭제·로그 정리) + `POST /api/privacy/delete`(토큰/연락처) + 개인정보처리방침 내 셀프 삭제 폼. 삭제 건은 `/r`·대시보드에서 즉시 비노출.
7. ✅ **정보 가이드 6편 리치화** — unemployment·payslip·smallbiz·probation·emp_annual·emp_minor를 탭형(요약·숫자·표·비교·자가진단·체크리스트·타임라인·다이어그램·계산기 임베드·FAQ)으로. **전 18편 리치 통일.** (정적 글 비주얼 정합은 후속 선택)
8. ✅ **진단결과·요약서 강화** — 진단결과(result)를 큰 금액 카드 + 쟁점 콜아웃 + 확인사항 + 준비물 칩의 **AI 리포트**로. 상담요약서(summary)를 헤더(제목·작성일·마스킹 뱃지)+섹션의 **문서 격식**으로 통일(AI/데모 공용 렌더) + **복사·인쇄/PDF**.
9. ✅ **알림 추상화(틀)·이벤트 분석** — `lib/notify.js`(console 어댑터 + email/kakao 스텁, 발송함 outbox 기록) + 예약 접수 트리거. 경량 이벤트(`/api/event` 화이트리스트·비식별) 수집 → 대시보드 "활동·유입(30일)" 패널 + 알림 채널/대기 표시.
10. ✅ **노무사 대시보드** `/partner` — 운영자가 노무사별 **접속 토큰/링크 발급**(`/api/admin/nomu/:id/token`) → 노무사 토큰 로그인(세션 쿠키+CSRF, `nomu_partner`) → **배정된 상담만** 조회·진행·완료·메모. 운영자는 예약을 **노무사 select로 배정**(`assigned_nomusa_id`). 스코프 격리·보안 검증 완료.
11. **(최후) 실제 AI 키 연결**·결제

> UI(1·2·5·7·8)와 백엔드(3·4·6·9)는 병행 가능. **결정 확정**: 저장소 SQLite · 시작순서 토큰→대시보드 · 대시보드 전부 · 알림 틀만.

---

## 6-1. 컴플라이언스 (검토 반영 — 코드 완료)
- **공인노무사법**: 문서센터 "완성"→"참고용 초안", 생성 문서마다 *"공인노무사 서류작성·확인/대리 대체 안 함"* 면책 자동 삽입.
- **개인정보**: 동의 **분리**(수집·이용 / 제3자 제공), 민감정보 입력 금지 안내(채팅·모달), 마스킹 시점 명시, 처리방침·삭제요청·자동파기.
- **노무사 입점약관**(`#legal=partner`): 과금(입점·구독·노출, 수임료 비연동)·노출 순서·정정/삭제·환불·책임.
- **노출 투명성**: featured=유료 노출 → 목록·프로필에 **"스폰서"** 표시 + 노출 기준 공개.
- **감사**: 예약별 동의·상태전환·노무사 열람 **이력 열람**(`/api/admin/booking/:id/events`).
- 👤 코드 밖(사장님): 사업자등록·통신판매업·상표(KIPRIS)·특허 상담·결제PG/환불 실계약·사업자정보 기입.

## 6-2. 신뢰도 (3순위 — 코드 완료)
- **계산기 산식 공개**: 결과마다 "산식" 표기 + 공통 면책(사업장 규모·근속·소정근로시간·4대보험·근로자성에 따라 달라짐) + **최저임금위원회 출처 링크**.
- **AI 답변 라벨링**: 판단마다 `[확정]/[가능성]/[추가 확인 필요]` + 근거 법조항 표기(프롬프트 규칙 6·7), 데모 응답도 라벨 시연.
- **오답 신고**: AI 답변에 🚩 신고 버튼 → `POST /api/feedback` → 운영자 대시보드에 신고 건수·목록 노출(`/api/admin/feedback`).

## 7. 결정 필요사항 (사장님 확인)
1. **저장소**: SQLite(`better-sqlite3`) 권장 vs 현행 JSON 유지(가장 단순) vs Node 내장 `node:sqlite`. → 권장: **better-sqlite3**.
2. **대시보드 범위**: 1차에 통계+예약관리만 vs 리드/노무사 관리까지.
3. **알림**: 지금은 콘솔/수동만 구축(키는 나중) — OK?
4. **시작 지점**: 위 로드맵 1번(토큰)부터 vs 대시보드 UI부터.

---

## 8. "제품 수준" 합격 체크리스트 (전 페이지·전 기능)
- [ ] 디자인 토큰 공유·일관 / 빈·로딩·에러 상태 전수
- [ ] 모바일 360px 정렬 / 접근성(포커스·aria·대비)
- [ ] 입력 검증·레이트리밋·세션 인증·감사 로그
- [ ] 개인정보 마스킹·열람로그·보존파기·삭제요청
- [ ] 정보 콘텐츠 18편 리치 통일 / 마이크로카피 정돈
- [ ] AI 키 연결은 **모든 것의 마지막**
