# 디자인 상세 기획 ③ 간격 · 레이아웃

> 시리즈 3/N. 원칙: **4px 베이스 · 8px 리듬**. 모든 여백·크기는 스페이싱 토큰에서만. 여백이 위계를 만든다 — 관계가 가까운 요소는 좁게, 먼 요소는 넓게.

---

## 1. 스페이싱 스케일 (Spacing Scale)
4px 베이스. 곱하기 리듬(주로 8의 배수, 작은 단위만 4).

| 토큰 | px | rem | 주 용도 |
|---|---|---|---|
| `--sp-0` | 0 | 0 | 리셋 |
| `--sp-1` | 4 | .25 | 아이콘-텍스트 간격, hairline 간격 |
| `--sp-2` | 8 | .5 | 칩/배지 내부, 인접 요소 |
| `--sp-3` | 12 | .75 | 버튼 그룹, 인풋 내부 세로 |
| `--sp-4` | 16 | 1 | 카드 내부 기본, 요소 간 표준 |
| `--sp-5` | 20 | 1.25 | 카드 패딩(여유), 거터 |
| `--sp-6` | 24 | 1.5 | 블록 간, 카드 패딩(큰) |
| `--sp-7` | 32 | 2 | 그룹 간 |
| `--sp-8` | 48 | 3 | 섹션 내 큰 분할, 기능행 좌우 갭 |
| `--sp-9` | 64 | 4 | 섹션 세로 패딩(데스크톱) |
| `--sp-10` | 96 | 6 | 큰 섹션·랜딩 호흡 |

규칙: **임의 px 금지**(토큰만). 1px·2px(보더/hairline)는 예외. 홀수·소수 패딩 지양.

---

## 2. 컨테이너 폭 (Container)
콘텐츠 종류별 최대폭을 토큰으로 고정. 가운데 정렬 + 좌우 거터.

| 토큰 | 폭 | 용도 |
|---|---|---|
| `--container-read` | **800px** | 글 본문·계산기·요약서·노동청 (읽기 폭, 줄길이 제한) |
| `--container-chat` | **760px** | AI 상담 채팅 |
| `--container-wide` | **1080px** | 랜딩·요금제·문서·노무사(그리드) |
| `--container-band` | 1000px | CTA 밴드·기능행 묶음 |
| full-bleed | 100% | 히어로/섹션 배경(안쪽은 위 컨테이너로) |

**거터(좌우 패딩)**: 데스크톱 `--sp-6`(24) · 모바일 `--sp-4`(16).
풀블리드 패턴: 배경 밴드는 100%, 내부 `.inner{max-width; margin:0 auto; padding:0 gutter}`.

---

## 3. 섹션 세로 리듬 (Section Padding)
| 토큰 | 데스크톱 | 모바일(≤860) | 용도 |
|---|---|---|---|
| `--section-y` | 64 (`--sp-9`) | 44 | 일반 섹션 |
| `--section-y-lg` | 96 (`--sp-10`) | 56 | 랜딩 히어로·강조 섹션 |
| `--section-y-sm` | 40 | 28 | 좁은 보조 섹션 |

- 인접 섹션 배경이 다르면(흰↔panel) 패딩으로 호흡. 같은 배경 연속이면 구분선 또는 패딩↑.
- 섹션 제목(H2)과 첫 콘텐츠 사이: `--sp-7`(32)~`--sp-9`. 부제(sub)는 제목 바로 아래 `--sp-2`.

---

## 4. 그리드 (Grid Systems)
| 패턴 | 데스크톱 | 갭 | 모바일 |
|---|---|---|---|
| 랜딩 히어로 split | 2col `1.04fr / .96fr` | `--sp-8`(48~50) | 1col, 갭 `--sp-7` |
| 기능 교차행(fr) | 2col `1fr/1fr` | `--sp-8`(56) | 1col |
| 카테고리·문서 타일 | 3col | `--sp-4`(14~16) | 1col |
| 페인포인트 | 3col | `--sp-4` | 1col |
| 요금제 | 4col | `--sp-4` | 1col |
| 관련글/푸터 링크 | 2~4col | `--sp-4` | 2→1col(≤560) |

규칙: 카드 그리드는 `repeat(N,1fr)` + `gap`. 모바일 단일 분기(860)에서 대부분 1col, 요금제/관련글만 보조 분기(560)로 2→1.

---

## 5. 컴포넌트 내부 간격 (Component Padding)
| 컴포넌트 | 패딩 |
|---|---|
| 카드(기본) | `--sp-5`(20) |
| 카드(큰/문서) | `--sp-6`(24) |
| 타일(클릭형) | `--sp-5`(20) |
| 버튼(기본) | 세로 12~15 / 가로 17 |
| 버튼 XL | 세로 15 / 가로 26 |
| 칩·필터 | 세로 7 / 가로 12, pill |
| eyebrow 칩 | 세로 5~6 / 가로 12~13 |
| 인풋 | 세로 11 / 가로 12(검색 14) |
| 콜아웃 | 13~15 |
| 표 셀 | 9 / 11 |
| 서브내비 | 세로 8 / 가로 18(모바일 6/12) |
| 글로벌 바 | 세로 10 / 가로 18, 높이 ~56 |
| 푸터 | 세로 26 / 가로 20 |

리스트/그룹 간격: 리스트 항목 5~6, 버튼 그룹 8~10, 태그 간 5.

---

## 6. 수직 리듬 결합 (with Type)
타이포(①)와 통합. margin은 **아래로만**(상단 마진 일원화), `:first-child` 0.

| 관계 | 간격 |
|---|---|
| H1/H2 → sub | `--sp-2`(8) |
| 제목 → 본문 | `--sp-2`~`--sp-3` |
| 문단 ↔ 문단 | 9~12 |
| 본문 → 리스트 | `--sp-2` |
| 콜아웃/표 상하 | `--sp-4`(16) |
| 카드 내 제목 → 본문 | `--sp-2` |

---

## 7. Z-index 스케일
충돌 방지용 고정 레이어.
| 토큰 | 값 | 레이어 |
|---|---|---|
| `--z-base` | 0 | 일반 |
| `--z-sticky` | 18 | 사이트 서브내비 |
| `--z-header` | 20 | 글로벌 바 |
| `--z-scrim` | 40 | 드로어/모달 뒷배경 |
| `--z-drawer` | 50 | 모바일 사이드바 |
| `--z-modal` | 60 | 모달/다이얼로그 |
| `--z-toast` | 70 | 토스트·알림 |

규칙: 임의 z-index 금지. 위 토큰만.

---

## 8. 브레이크포인트 (Breakpoints)
| 토큰 | 폭 | 용도 |
|---|---|---|
| `--bp-sm` | 560px | 보조(요금제·관련글 2→1col) |
| `--bp-md` | **860px** | 주 분기(데스크톱↔모바일: 하단탭·드로어·1col·서브내비 검색 숨김) |
| `--bp-lg` | 1120px | 컨테이너 최대폭 여유(거터 유지) |

- 모바일 우선 아님(데스크톱 기준 작성 후 860에서 재배치) — 현 코드와 일치.
- 860 분기에서: 헤더 탭 숨김+로고/CTA 유지, 하단탭 노출, 사이드바 드로어화, 그리드 1col, 섹션 패딩↓, 서브내비 검색 숨김.

---

## 9. 정렬 · 광학 보정
- 콘텐츠는 좌측 정렬 기본. 히어로·섹션 헤더(eyebrow+제목+부제)·CTA 밴드만 중앙 정렬.
- 아이콘+텍스트는 `align-items:center` + `--sp-1~2` 갭.
- 숫자/금액 우측 정렬(표). 라벨-값 행은 양끝 정렬(`space-between`).
- 큰 라운드 카드 안의 콘텐츠는 패딩으로 광학 균형(상하 동일 패딩).

---

## 10. 구현 — CSS 토큰 & 유틸

```css
:root{
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
  --sp-6:24px; --sp-7:32px; --sp-8:48px; --sp-9:64px; --sp-10:96px;
  --container-read:800px; --container-chat:760px; --container-wide:1080px; --container-band:1000px;
  --gutter:24px;
  --section-y:64px; --section-y-lg:96px; --section-y-sm:40px;
  --z-sticky:18; --z-header:20; --z-scrim:40; --z-drawer:50; --z-modal:60; --z-toast:70;
}
@media(max-width:860px){
  :root{ --gutter:16px; --section-y:44px; --section-y-lg:56px; --section-y-sm:28px; }
}
.container{max-width:var(--container-wide);margin:0 auto;padding-inline:var(--gutter)}
.container.read{max-width:var(--container-read)}
.container.band{max-width:var(--container-band)}
.section{padding-block:var(--section-y)}
.section.lg{padding-block:var(--section-y-lg)}
/* 그리드 유틸 */
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-4)}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4)}
.split{display:grid;grid-template-columns:1.04fr .96fr;gap:var(--sp-8);align-items:center}
@media(max-width:860px){ .grid-3,.grid-4,.split{grid-template-columns:1fr} }
@media(max-width:560px){ /* 4col만 쓰던 곳도 여기서 1col 유지 */ }
/* margin은 아래로만 */
* + h2{margin-top:0} /* 섹션 패딩이 담당 */
.stack > * + *{margin-top:var(--sp-3)}
```

> 기존 ad-hoc `padding:42px 18px` 등을 `--section-y`/`--gutter`로, `max-width:760/1040`을 컨테이너 토큰으로 치환.

---

## 11. Do / Don't
- ✅ 토큰(`--sp-*`)만, 8px 리듬
- ✅ 관계 가까우면 좁게/멀면 넓게(여백=위계)
- ✅ margin-top 일원화
- ✅ 컨테이너 폭으로 줄길이 제한(읽기 800)
- ❌ 임의 px·홀수 패딩
- ❌ 같은 컴포넌트마다 다른 패딩
- ❌ 임의 z-index
- ❌ 본문 컨테이너를 와이드로(줄 너무 길어짐)

---

### 다음 편(④) 예고 — 라운드 · 그림자(Elevation)
radius 스케일 토큰, elevation e0–e3 그림자 정의(차가운 남색 알파), 컴포넌트별 라운드/그림자 매핑, 호버 상승 규칙, 보더 vs 그림자 사용 기준.
