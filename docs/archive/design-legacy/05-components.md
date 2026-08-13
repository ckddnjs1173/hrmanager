# 디자인 상세 기획 ⑤ 컴포넌트

> 시리즈 5/N. 앞선 토큰(타이포·컬러·간격·라운드/그림자)을 조합해 컴포넌트를 정의. 각 항목: **구조 → 변형 → 상태(기본/hover/focus/active/disabled/loading) → 토큰 → 비고**. 상태 누락 = 미완성으로 본다.

---

## 0. 공통 규칙
- 모든 인터랙티브 요소: `:focus-visible` 링(2px `--accent` + offset), `transition .15s var(--ease)`.
- 비활성(disabled): `opacity:.5; cursor:not-allowed; pointer-events:none`.
- 클릭 영역 최소 **40×40px**(모바일 44). 작은 아이콘 버튼도 패딩으로 확보.
- 색·라운드·간격은 토큰만.

---

## 1. 버튼 (Button)
**구조**: `[아이콘?] 라벨 [화살표?]`. 한 줄, 줄바꿈 금지(`white-space:nowrap`).

**변형**
| 변형 | 용도 | 채움/보더 |
|---|---|---|
| Primary(`btn-fill`) | 주 행동(진단·시작) | bg `--accent`, 흰 텍스트 |
| Ghost(`btn-ghost`) | 보조 행동 | 흰 bg + `--line` 보더 |
| Quiet(`btn-quiet`) | 약한 행동·리스트 내 | 투명, 텍스트 ink-700 |
| Nav CTA | 헤더 우측 | 작은 Primary |
| Danger | 삭제 등(드묾) | bg `--danger`, 흰 텍스트 |

**크기**
| 크기 | 패딩(세로/가로) | font |
|---|---|---|
| sm | 9 / 14 | 13.5 / 600 |
| md(기본) | 13 / 17 | 14 / 700 |
| xl | 15 / 26 | 15.5 / 700 |

**상태**
| 상태 | Primary | Ghost |
|---|---|---|
| hover | `filter:brightness(.95)` | 보더·텍스트 `--accent` |
| focus | + 포커스 링 | + 포커스 링 |
| active | `translateY(1px)` | 동일 |
| disabled | opacity .5 | opacity .5 |
| loading | 라벨→스피너, 너비 유지, `aria-busy` | 동일 |

radius `--r-md`, elevation e0(필요 시 e1). 아이콘-라벨 갭 `--sp-2`. 화살표(›)는 ink 보조색.

---

## 2. 인풋 / 검색 (Input / Search)
**구조**: `[아이콘?] input [버튼?]`. 라벨은 위(`.field label`).

**변형**: 기본 인풋 / 히어로 검색바(큰, e2) / 서브내비 검색(작은).

**상태**
| 상태 | 처리 |
|---|---|
| 기본 | 보더 `--line`, bg #fff, placeholder `--ink-300` |
| hover | 보더 `--ink-200` |
| focus | 보더 `--accent` + (옵션)2px 링 |
| error | 보더 `--danger` + 하단 에러텍스트(`--danger-ink`)+아이콘 |
| disabled | bg `--panel`, 텍스트 ink-300 |

radius `--r-sm`~`--r-md`, 패딩 11/12(검색 14). 히어로 검색바 = `--e2` + `--r-md`. Enter 제출, 버튼 클릭 동일 동작.

---

## 3. 세그먼트 컨트롤 (Segmented — 계산기 탭)
- 알약(pill) 버튼 그룹, 가로 스크롤(모바일). 활성 1개.
- 기본: 흰 bg + 보더, 텍스트 ink-400. **활성**: bg `--accent`, 흰 텍스트. hover(비활성): 보더 ink-200.
- `role="tablist"`, 활성 `aria-selected`. radius `--r-pill`, 패딩 9/15, 갭 `--sp-2`.

---

## 4. 칩 / 배지 / eyebrow / 태그
| 종류 | 스타일 | 용도 |
|---|---|---|
| eyebrow | caption, `--accent` 텍스트 + `--accent-soft` bg, pill | 섹션/페이지 상단 라벨 |
| 제안칩(클릭) | 흰 bg + 보더, hover accent | 홈 입력창 아래 제안 |
| 필터칩 | 흰 bg + 보더, **활성** bg `--ink-900`/accent | 노무사 필터 |
| 태그(정적) | `--ink-050` bg, ink-400 | 분야 태그 |
| 출처 배지 | accent-soft / 공공데이터·직접등록 | 노무사 카드 |
| 상태 배지 | ok-soft+ok-ink("오늘 상담가능"·"자격확인") | 상태 표시 |
규칙: 클릭형은 hover/active 상태 + 포커스 링. 정적은 상태 없음. 색만으로 의미 금지(아이콘/텍스트 병기).

---

## 5. 카드 / 타일
**카드(정적 정보)**: 흰 bg, `--line` 보더, `--r-lg`, 패딩 `--sp-5`, `--e0`. 호버 없음.
**타일(클릭형: 카테고리·문서·주제)**:
- 구조: 아이콘(이모지/SVG) → 제목 → 설명 → "바로가기 →".
- 기본 e0, **hover** `translateY(-3px)+--e2`, 보더 `--accent`. focus 링. active 1px.
- `--r-lg`, 패딩 `--sp-5`. 그리드 3col.

---

## 6. 글로벌 바 (Top Portal Nav)
**구조**: `[☰(모바일)] [로고] [포털탭: AI상담·근로자·사업주·노무사] [grow] [무료진단 CTA] [배지]`
- 높이 ~56, 패딩 10/18, 하단 보더 유지. 활성 탭: bg ink/accent 강조.
- 로고: 이미지(`logo.svg`) 로드 시 표시, 실패 시 텍스트 워드마크.
- 모바일(≤860): 포털탭 숨김(로고·☰·CTA 유지), 하단 탭으로 대체.
- 스크롤 시 그대로 고정(레이아웃상 상단 고정).

## 6-1. 사이트 서브내비 (Secondary Bar)
- 글로벌 바 아래. 근로자/사업주 진입 시만 노출(`.subnav.show`).
- 구조: `[워드마크(점마크+이름)] [카테고리들] [도구] [검색]`. 활성 카테고리 `--accent-soft` 배경 + accent 텍스트.
- 색: 사이트 악센트(body[data-site]). 가로 스크롤(모바일), 검색 숨김(≤860).

## 6-2. 사이드바 / 드로어 (상담 보조)
- 데스크톱 좌측 고정(폭 248). 모바일 드로어(`--z-drawer` 50) + scrim(`--z-scrim` 40), translateX 전환.
- 항목: 새 상담 / 빠른 시작 / 상담 이력. 활성 항목 accent-soft.

## 6-3. 하단 탭 (모바일)
- 4탭(AI상담·근로자·사업주·노무사), 활성 `--accent`. 아이콘+라벨, 고정 하단.

---

## 7. 제품 목업 (Product Mock)
- **브라우저 프레임**: 점3 + URL칩(서비스명). `--r-lg`(18), `--e3`, `overflow:hidden`.
- **바디 변형**: 미니 채팅(말풍선 me/ai+금액) / 계산(라벨-값 행+결과) / 문서(칩+라인 플레이스홀더) / 리스트(체크 상태) / 노무사 카드.
- **플로팅 배지**: 우하단, 흰 bg + `--e-float` + `--r-md`. 1개만.
- 미디어 슬롯: `assets/<site>/hero-shot.png` 있으면 목업 위에 덮어 표시(없으면 CSS 목업 유지).
- 모바일: 플로팅 배지 숨김, 목업 폭 100%.

---

## 8. 콜아웃 (Callout)
- 구조: `[아이콘] 내용`. 3종: tip(ok-soft/💡) · warn(warn-soft/⚠️) · law(accent-soft/⚖️).
- `--r-lg`, 패딩 13~15, 상하 `--sp-4`. 본문 강조용, 섹션당 1–2개.
- 텍스트는 ink-700, 강조 `<b>`. 색만으로 의미 금지(아이콘 필수).

---

## 9. 표 (Table)
- 컨테이너 `--r-lg`, 셀 보더 `--line`, 헤더 `--panel` bg + 700.
- 셀 패딩 9/11, font 13.5, 상하 정렬 top. 숫자 셀 우측 정렬 + `tabular-nums`.
- 모바일: 가로 스크롤 컨테이너 또는 핵심 열만.

## 10. FAQ 아코디언
- `<details>/<summary>` 시맨틱. 항목 보더 `--line`, `--r-md`.
- summary: 600, +/− 인디케이터(accent), 패딩 13/15. 열림 시 답변 ink-500.
- 키보드 토글 기본 지원. 여러 개 동시 열림 허용.

## 11. 아바타
- `--r-full`, 사진 있으면 이미지(중앙 크롭), 없으면 **이니셜**(accent-soft bg + accent 텍스트, 800). 크기 40/46.

## 12. 리스트 행 (Guide row / 라벨-값)
- 가이드 행: `[아이콘] [제목+메타] [›]`, hover `--panel`, 항목 보더 구분. 클릭 전체 영역.
- 라벨-값 행: 양끝 정렬(`space-between`), 값 강조(accent/700).

## 13. 요금제 카드 (Pricing)
- `--r-xl`, 패딩 `--sp-6`, 인기=accent 보더+`--e2`+"인기" 배지(우상단, accent).
- 구조: 플랜명 → 대상 → 가격(accent, 큰) → 기능 리스트(✓) → CTA. 동일 높이 정렬(flex column, 리스트 flex:1).

## 14. CTA 밴드
- 다크 그라데이션(`#0B0D12→#1C2433`), `--r-2xl`, 패딩 `--sp-10`/30, 중앙 정렬.
- 제목(흰, 800) + 부제(ink-300급 밝은회색) + 버튼(흰 bg/ink 텍스트 = 반전).

## 15. 푸터
- `--panel` bg, 4컬럼 링크맵 + 법적 고지 + 카피. 링크 ink-400→hover accent. 콘텐츠 끝에서 스크롤(고정 아님).

---

## 16. 상태 패턴 (State Patterns)
| 패턴 | 처리 |
|---|---|
| 로딩 | 스켈레톤(panel 블록, shimmer) 또는 "…생성 중" 텍스트, `aria-busy` |
| 빈 상태 | 아이콘 + 한 줄 안내 + 행동 버튼(예: "관련 가이드가 곧 추가됩니다") |
| 에러 | 인라인 메시지(danger-ink) + 재시도 버튼. 토스트는 비차단 알림만 |
| 스트리밍(채팅) | 타이핑 인디케이터 → 토큰 누적 렌더 |
| 503 데모 | 데모 배지 + 목업 응답 폴백(차단 없음) |
| 토스트 | 우하단/상단, `--z-toast`, 3~4초, 색=상태 |

---

## 17. 구현 — 핵심 컴포넌트 CSS(발췌)
```css
/* button */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2);
  white-space:nowrap;border-radius:var(--r-md);font-weight:var(--fw-bold);
  padding:13px 17px;transition:.15s var(--ease);cursor:pointer}
.btn-fill{background:var(--accent);color:#fff;border:1.5px solid var(--accent)}
.btn-fill:hover{filter:brightness(.95)} .btn:active{transform:translateY(1px)}
.btn-ghost{background:#fff;border:1.5px solid var(--line);color:var(--ink-700)}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.btn[disabled]{opacity:.5;pointer-events:none}
.btn-xl{padding:15px 26px;font-size:var(--fs-button)}
/* input */
.input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r-md);
  font-size:var(--fs-body);outline:none}
.input:hover{border-color:var(--ink-200)} .input:focus{border-color:var(--accent)}
/* tile */
.tile{border:1px solid var(--line);border-radius:var(--r-lg);padding:var(--sp-5);background:#fff;
  transition:transform .15s var(--ease),box-shadow .15s var(--ease),border-color .15s;cursor:pointer}
.tile:hover{transform:translateY(-3px);box-shadow:var(--e2);border-color:var(--accent)}
/* chip */
.chip{display:inline-flex;align-items:center;border-radius:var(--r-pill);padding:7px 12px;
  font-size:var(--fs-caption);background:#fff;border:1px solid var(--line)}
.chip.eyebrow{color:var(--accent);background:var(--accent-soft);border:none;font-weight:var(--fw-semi)}
.chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
:where(a,button,input,summary,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
```

---

## 18. Do / Don't
- ✅ 모든 컴포넌트 5상태 정의 + 포커스 링
- ✅ 클릭영역 ≥40px
- ✅ 색+아이콘 병기
- ✅ 토큰만(색·라운드·간격·그림자)
- ❌ 상태 누락(hover만 있고 focus 없음 등)
- ❌ 정적 카드에 호버 깊이
- ❌ 버튼 라벨 줄바꿈
- ❌ 색만으로 상태 표현

---

### 다음 편(⑥) 예고 — 모션 & 인터랙션
듀레이션/이징 토큰, 트랜지션 카탈로그(호버·전환·아코디언·드로어·스트리밍), 스크롤 진입 애니메이션(IO), prefers-reduced-motion 가드, 마이크로 인터랙션 원칙.
