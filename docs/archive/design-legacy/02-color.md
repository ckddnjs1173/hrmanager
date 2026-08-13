# 디자인 상세 기획 ② 컬러 시스템

> 시리즈 2/N. 원칙: **신뢰가 먼저**. 뉴트럴이 화면의 대부분을 차지하고, 악센트는 행동(CTA·링크·활성)에만. 색은 토큰으로만 사용하고 raw hex 직접 입력 금지.

---

## 1. 색 사용 비율 — 60 / 30 / 10
- **60%** 뉴트럴(흰 배경 + ink 텍스트)
- **30%** 보조 표면(panel 배경, 보더, 카드)
- **10%** 악센트(CTA·링크·활성·강조 1색)
- 한 화면에 **악센트는 1계열만**(근로자=블루 / 사업주=딥그린). 상태색(ok/warn/danger)은 의미가 있을 때만 점처럼.

---

## 2. 뉴트럴 램프 (Neutral / Gray)
차가운(살짝 남색 섞인) 그레이로 통일 → 악센트(블루·딥그린)와 한 가족처럼.

| 토큰 | HEX | 대비(흰 배경) | 주 용도 |
|---|---|---|---|
| `--ink-900` | `#0B0D12` | 18.7:1 | Display·H1·H2 헤드라인 |
| `--ink-800` | `#16181D` | 16.1:1 | H3·강한 제목 |
| `--ink-700` | `#2B2F36` | 12.4:1 | **기본 본문** |
| `--ink-600` | `#3D434C` | 9.3:1 | 본문 강조 |
| `--ink-500` | `#4B5563` | 7.5:1 | 본문(부드러움)·리드 |
| `--ink-400` | `#6B7280` | 4.8:1 | 보조 텍스트(sub)·메타 ※14px+ |
| `--ink-300` | `#9AA1AD` | 2.6:1 | 플레이스홀더·캡션 ※장식/대형만 |
| `--ink-200` | `#C8CDD5` | — | 강한 보더·구분선 |
| `--ink-100` (`--line`) | `#E7E9EE` | — | 기본 보더 |
| `--ink-050` | `#F1F3F6` | — | 호버 배경·얕은 분리 |
| `--panel` | `#F7F8FA` | — | 섹션/카드 배경 |
| `--bg` | `#FFFFFF` | — | 기본 배경 |

> 텍스트는 `ink-700`(본문)·`ink-900`(제목)·`ink-400`(보조)만 주로. `ink-300` 이하는 텍스트로 쓰지 않음(대비 미달).

---

## 3. 악센트 램프 (Accent)
시맨틱 토큰 3종을 `body[data-site]`로 스왑: `--accent`(채움·아이콘), `--accent-ink`(텍스트·링크용 진한값), `--accent-soft`(배경 틴트). 풀 램프는 호버/보더 계산용.

### 3-1. 블루 (기본 / 근로자) — Base `#2F6DF6`
| 토큰 | HEX | 용도 |
|---|---|---|
| `--blue-50` | `#EEF3FF` | accent-soft(칩·결과 배경) |
| `--blue-100` | `#DBE6FF` | 연한 보더·hover 배경 |
| `--blue-200` | `#B9D0FF` | 비활성 채움 |
| `--blue-300` | `#8AB0FF` | 보조 |
| `--blue-400` | `#5A8CFA` | hover(밝게) |
| **`--blue-500`** | `#2F6DF6` | **accent(버튼 채움·아이콘)** |
| `--blue-600` | `#1F54C9` | **accent-ink(링크·텍스트)**·active |
| `--blue-700` | `#1A45A6` | pressed |

### 3-2. 딥그린/틸 (사업주) — Base `#0F766E`
| 토큰 | HEX | 용도 |
|---|---|---|
| `--green-50` | `#E7F3F0` | accent-soft |
| `--green-100` | `#CFE7E1` | 연한 보더·hover 배경 |
| `--green-200` | `#9FD0C6` | 비활성 채움 |
| `--green-300` | `#5FB3A6` | 보조 |
| `--green-400` | `#2A9384` | hover |
| **`--green-500`** | `#0F766E` | **accent** |
| `--green-600` | `#0B5A53` | **accent-ink**·active |
| `--green-700` | `#084944` | pressed |

### 3-3. 상태별 매핑 규칙
| 상태 | 토큰 | 블루 | 딥그린 |
|---|---|---|---|
| 기본 채움/아이콘 | `--accent` | blue-500 | green-500 |
| hover | (자동) | brightness .95 또는 blue-400 | green-400 |
| active/pressed | — | blue-700 | green-700 |
| 텍스트·링크 | `--accent-ink` | blue-600 | green-600 |
| 배경 틴트 | `--accent-soft` | blue-50 | green-50 |

> **중요**: 작은 텍스트/링크는 `--accent`(500)가 아니라 **`--accent-ink`(600)** 사용(대비 확보). 버튼처럼 흰 글자를 얹는 채움면만 500.

---

## 4. 시맨틱 상태색 (Semantic)
각 색 3종(base·soft·ink): base=아이콘/점, soft=배경, ink=그 위 텍스트.
| 의미 | base | soft | ink(텍스트) | 용도 |
|---|---|---|---|---|
| 성공/양호 `ok` | `#22A06B` | `#E7F7EF` | `#15814F` | 자격확인·완료·체크·"양호" |
| 주의 `warn` | `#E8A13A` | `#FCF3E3` | `#9A6212` | 권장·"점검"·콜아웃 warn |
| 위험 `danger` | `#E5484D` | `#FDEAEA` | `#B42318` | 금지(✕)·"위험"·에러 |
| 정보 `info` | = `--accent` | `--accent-soft` | `--accent-ink` | 법 근거 콜아웃·안내 |

> base 색은 대비가 낮으니 **텍스트엔 항상 `*-ink`**, 배경엔 `*-soft`. 색만으로 의미 전달 금지 → 아이콘(✓/⚠/✕) 병기.

### 콜아웃 3종 (글 본문)
| 종류 | 배경 | 보더 | 아이콘 |
|---|---|---|---|
| tip | ok-soft `#E7F7EF`(또는 #EEF7F1) | #CFE9D9 | 💡 |
| warn | warn-soft `#FCF3E3` | #F3E0BF | ⚠️ |
| law | accent-soft | accent-100 | ⚖️ |

---

## 5. 표면 & 오버레이 (Surface / Overlay)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | #FFFFFF | 기본 |
| `--panel` | #F7F8FA | 섹션 교차 배경·카드 안쪽 |
| `--surface-card` | #FFFFFF | 카드(보더로 구분) |
| `--surface-raised` | #FFFFFF + e2/e3 | 목업·드롭다운 |
| `--scrim` | rgba(11,13,18,.45) | 모달·드로어 뒷배경 |
| `--hero-scrim` | rgba(255,255,255,.45) | 히어로 영상 위 가독 레이어 |
| 히어로 그라데이션(근로자) | `linear-gradient(180deg,#F1F6FF,#FFF)` | |
| 히어로 그라데이션(사업주) | `linear-gradient(180deg,#EAF4EF,#FFF)` | |

> 그라데이션은 **히어로/CTA 밴드에만**. 카드·본문 배경에 그라데이션 금지(신뢰 톤 유지).

---

## 6. 텍스트·링크·포커스 색 규칙
| 역할 | 토큰 |
|---|---|
| 제목 | `--ink-900` |
| 본문 | `--ink-700` |
| 보조/메타 | `--ink-400` |
| 링크(인라인) | `--accent-ink` + hover 밑줄 |
| 버튼 텍스트(채움) | `#FFFFFF` |
| 비활성 텍스트 | `--ink-300` |
| **포커스 링** | `0 0 0 3px <accent> @ 35%` 또는 2px solid `--accent` + 2px offset |
| 선택영역(`::selection`) | accent-soft 배경 + ink-900 |

---

## 7. 대비 검증 (WCAG)
AA 기준: 본문 ≥ 4.5:1, 큰 글씨(18.66px+ 또는 14px+700) ≥ 3:1, UI 컴포넌트 ≥ 3:1.

| 조합 | 대비(≈) | 판정 |
|---|---|---|
| ink-700 / white | 12.4:1 | ✅ AAA |
| ink-400 / white | 4.8:1 | ✅ AA(본문) |
| ink-300 / white | 2.6:1 | ❌ 텍스트 불가(장식만) |
| white / blue-500(버튼) | ~4.5:1 | ✅ 버튼(굵은/큰) |
| blue-500 / white(작은 텍스트) | ~3.8:1 | ⚠️ 텍스트는 blue-600 사용 |
| blue-600 / white | ~6.0:1 | ✅ AA 링크 |
| white / green-500(버튼) | ~5.0:1 | ✅ |
| green-600 / white | ~6.4:1 | ✅ AA |
| ok-ink / white | ~4.7:1 | ✅ |
| danger-ink / white | ~5.9:1 | ✅ |
| warn base / white | ~1.9:1 | ❌ 텍스트는 warn-ink |

규칙으로 고정: **채움면=500, 텍스트=600/-ink, 보조텍스트=ink-400까지만.**

---

## 8. 다크 모드 (v2 — 토큰만 미리 정의)
뉴트럴 반전 + 악센트는 한 단계 밝게(채도 유지). `:root[data-theme="dark"]`.
| 토큰 | 라이트 | 다크 |
|---|---|---|
| --bg | #FFFFFF | `#0E1116` |
| --panel | #F7F8FA | `#151A21` |
| --surface-card | #FFFFFF | `#1A2029` |
| --line | #E7E9EE | `#2A313B` |
| --ink-900(제목) | #0B0D12 | `#F3F5F8` |
| --ink-700(본문) | #2B2F36 | `#C4CAD3` |
| --ink-400(보조) | #6B7280 | `#8A929D` |
| --accent(블루) | #2F6DF6 | `#5A8CFA` |
| --accent-ink(블루) | #1F54C9 | `#8AB0FF` |
| 그림자 | navy alpha | 강도↑·검정 alpha |

> 다크는 v2. 지금 토큰을 시맨틱하게 잡아두면 전환은 변수 교체만으로 가능.

---

## 9. 구현 — CSS 토큰

```css
:root{
  /* neutral */
  --ink-900:#0B0D12; --ink-800:#16181D; --ink-700:#2B2F36; --ink-600:#3D434C;
  --ink-500:#4B5563; --ink-400:#6B7280; --ink-300:#9AA1AD; --ink-200:#C8CDD5;
  --line:#E7E9EE; --ink-050:#F1F3F6; --panel:#F7F8FA; --bg:#FFFFFF;
  /* blue ramp */
  --blue-50:#EEF3FF; --blue-100:#DBE6FF; --blue-200:#B9D0FF; --blue-300:#8AB0FF;
  --blue-400:#5A8CFA; --blue-500:#2F6DF6; --blue-600:#1F54C9; --blue-700:#1A45A6;
  /* green ramp */
  --green-50:#E7F3F0; --green-100:#CFE7E1; --green-200:#9FD0C6; --green-300:#5FB3A6;
  --green-400:#2A9384; --green-500:#0F766E; --green-600:#0B5A53; --green-700:#084944;
  /* state */
  --ok:#22A06B; --ok-soft:#E7F7EF; --ok-ink:#15814F;
  --warn:#E8A13A; --warn-soft:#FCF3E3; --warn-ink:#9A6212;
  --danger:#E5484D; --danger-soft:#FDEAEA; --danger-ink:#B42318;
  /* semantic accent (default=blue) */
  --accent:var(--blue-500); --accent-ink:var(--blue-600); --accent-soft:var(--blue-50);
  --accent-hover:var(--blue-400); --accent-active:var(--blue-700);
  /* surface */
  --scrim:rgba(11,13,18,.45); --hero-scrim:rgba(255,255,255,.45);
}
body[data-site="employer"]{
  --accent:var(--green-500); --accent-ink:var(--green-600); --accent-soft:var(--green-50);
  --accent-hover:var(--green-400); --accent-active:var(--green-700);
}
/* (data-site 미설정/근로자 = 기본 블루) */

a{color:var(--accent-ink)} a:hover{text-decoration:underline}
::selection{background:var(--accent-soft);color:var(--ink-900)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
```

> 기존 `--brand/--brand-soft/--accent`를 위 체계로 흡수. `--accent-ink` 도입이 핵심(텍스트/링크 대비 해결).

---

## 10. Do / Don't
- ✅ 채움=`--accent`(500), 텍스트·링크=`--accent-ink`(600)
- ✅ 한 화면 악센트 1계열, 상태색은 점처럼
- ✅ 색+아이콘 병기(✓/⚠/✕)
- ✅ 그라데이션은 히어로·CTA 밴드만
- ❌ ink-300 이하로 텍스트
- ❌ 카드/본문 배경 그라데이션·다색
- ❌ raw hex 직접 사용(토큰만)
- ❌ accent-500을 작은 텍스트 색으로

---

### 다음 편(③) 예고 — 간격 · 레이아웃
4/8 스페이싱 스케일 토큰, 컨테이너·거터·섹션 패딩 규격, 그리드(랜딩/그리드/읽기), 브레이크포인트, 카드 내부 패딩 규칙, 세로 리듬 결합.
