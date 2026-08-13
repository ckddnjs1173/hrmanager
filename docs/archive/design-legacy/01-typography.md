# 디자인 상세 기획 ① 타이포그래피

> 시리즈 1/N. 루트 폰트 크기 = **16px**(1rem=16px) 기준. 모든 크기는 rem로 정의해 사용자 확대를 존중한다.

---

## 1. 서체 선택 (Typeface)

### 1-1. 본문/UI — **Pretendard Variable**
- **이유**: 한글·라틴·숫자가 한 가족으로 조화롭게 설계된 현대적 산세리프. 가변 폰트(100–900), 무료(OFL), 국내 SaaS(토스·flex 등) 사실상 표준이라 사용자에게 익숙하고 신뢰감.
- **가변(Variable)** 채택: 단일 파일로 모든 굵기 → 요청 수↓, 굵기 자유도↑. `font-weight` 임의값 사용 가능하나 **토큰화된 5단계만 사용**(아래 §3).

### 1-2. 폴백 스택
```css
font-family:
  "Pretendard Variable", Pretendard,
  -apple-system, BlinkMacSystemFont,
  "Apple SD Gothic Neo",      /* macOS/iOS 한글 */
  "Malgun Gothic",            /* Windows 한글 */
  system-ui, "Segoe UI", Roboto, sans-serif;
```
- Pretendard 로드 전/실패 시에도 한글이 시스템 고딕으로 자연스럽게 보이도록 OS별 한글 폰트를 명시.

### 1-3. 숫자 — **금액·계산기는 tabular(고정폭) 숫자**
- 금액·표·계산 결과는 자릿수 정렬이 중요 → `font-feature-settings: "tnum" 1;` (Pretendard 지원).
- 본문 속 숫자는 비례폭 기본값 유지.

### 1-4. (선택) 강조 디스플레이
- 별도 영문 디스플레이 서체는 **도입하지 않음**(브랜드 일관성·로딩 비용·한글 혼용 부조화 방지). Display는 Pretendard 800으로 충분.

---

## 2. 폰트 로딩 전략 (Performance)

| 항목 | 결정 |
|---|---|
| 배포 방식 | **자가 호스팅** woff2 (`assets/brand/fonts/`) 권장. CDN(jsDelivr `pretendard`)도 가능하나 3rd-party 의존·프라이버시 고려 시 self-host |
| 포맷 | woff2 단일(전 브라우저 충분) |
| `font-display` | **swap** (FOIT 방지, 폴백 먼저 → 교체) |
| preload | 가장 많이 쓰는 1개 굵기 우선 preload (`<link rel="preload" as="font" type="font/woff2" crossorigin>`) |
| 서브셋 | 한글 전체는 무거움. **동적 서브셋(woff2) + unicode-range 분할**(한글/라틴/숫자) 권장. 1차 운영은 Pretendard 표준 woff2로 시작, 트래픽 늘면 서브셋 최적화 |
| CLS 방지 | 폴백과 메트릭 유사(시스템 고딕) → swap 시 점프 최소. 필요 시 `size-adjust` 조정 |

```css
@font-face{
  font-family:"Pretendard Variable";
  src:url("/assets/brand/fonts/PretendardVariable.woff2") format("woff2-variations");
  font-weight:100 900;       /* 가변 범위 */
  font-display:swap;
  font-style:normal;
}
```
> 1차(에셋 준비 전): 현재처럼 시스템 폰트 스택만으로도 동작. 폰트 파일을 위 경로에 넣으면 자동 적용.

---

## 3. 굵기 (Weights) — 5단계만 사용
| 토큰 | weight | 용도 |
|---|---|---|
| Regular | 400 | 본문, 캡션 |
| Medium | 500 | 살짝 강조된 본문·칩 |
| SemiBold | 600 | 라벨, 카드 제목 보조, 버튼(작은) |
| Bold | 700 | 카드 제목, 버튼, 강조 |
| ExtraBold | 800 | Display·H1·H2·H3 (헤드라인) |

규칙: **faux bold 금지**(가변 폰트라 불필요). 900은 사용 안 함(한글에서 뭉개짐). 강조는 700↑로만.

---

## 4. 타입 스케일 (Type Scale)

루트 16px. 1.2–1.25 모듈러에 가까운 실용 스케일. **fluid가 필요한 큰 제목만 `clamp()`**, 나머지는 고정 + 모바일 분기.

| 토큰(role) | 데스크톱 size | line-height | weight | letter-spacing | 모바일(≤860) | 용도 |
|---|---|---|---|---|---|---|
| `--fs-display` | clamp(2rem, 4.2vw, 2.94rem)≈32→47px | 1.2 | 800 | -.035em | (clamp 하단 32px) | 랜딩 히어로 H1 |
| `--fs-h1` | 1.875rem (30px) | 1.3 | 800 | -.03em | 1.625rem (26px) | 페이지 제목 |
| `--fs-h2` | 2.0625rem (33px) | 1.25 | 800 | -.03em | 1.625rem (26px) | 섹션 제목 |
| `--fs-h3` | 1.5625rem (25px) | 1.3 | 800 | -.02em | 1.375rem (22px) | 기능 블록 제목 |
| `--fs-title` | 1.0625rem (17px) | 1.4 | 700 | -.01em | = | 카드 제목 |
| `--fs-lead` | 1.0625rem (17px) | 1.65 | 400 | 0 | 0.97rem (15.5px) | 히어로 서브·도입문 |
| `--fs-body` | 0.9375rem (15px) | 1.6 | 400 | 0 | = | 본문 |
| `--fs-body-sm` | 0.84rem (13.5px) | 1.55 | 400 | 0 | = | 보조·메타 |
| `--fs-caption` | 0.78rem (12.5px) | 1.5 | 600 | .02em | = | eyebrow·태그·라벨 |
| `--fs-button` | 0.97rem (15.5px) | 1 | 700 | -.01em | = | 버튼(XL) / 일반 14 |
| `--fs-legal` | 0.72rem (11.5px) | 1.7 | 400 | 0 | = | 면책·푸터 고지 |

원칙:
- **큰 글자일수록 자간을 좁힌다(음수)** — 한글 헤드라인 가독·밀도. 본문은 0(좁히면 한글 가독성↓).
- **작은 라벨(caption)만 살짝 양수 자간(.02em)** — 또렷함.
- 한 페이지 H 레벨 최대 3단계. 제목 위계는 크기+굵기+색(ink-900)으로.

---

## 5. 줄 길이 · 줄바꿈 (한국어 특화)

- **줄 길이(measure)**: 본문 한 줄 ≤ **35–45자(한글)** → 컨테이너 760–800px. 글 본문은 이 폭 고정.
- **한글 줄바꿈**: 단어 중간이 어색하게 끊기지 않게
  ```css
  word-break: keep-all;     /* 어절 단위 줄바꿈 (한국어 필수) */
  overflow-wrap: anywhere;  /* 아주 긴 토큰만 강제 분리 */
  ```
- **헤드라인 균형**: 제목은 `text-wrap: balance`(지원 브라우저)로 두 줄 균형. 의도적 줄바꿈은 `<br/>` 최소 사용(모바일에서 깨질 수 있으니 히어로 등 통제된 곳만).
- **본문 가독**: `text-wrap: pretty`로 고아 단어(orphan) 완화.
- 줄간격: 본문 1.6, 제목 1.2–1.3(촘촘), 캡션 1.5.

---

## 6. 수직 리듬 (Margins)
8px 리듬 기반 기본 마진(컴포넌트에서 덮어쓰기 가능):
| 관계 | margin-top |
|---|---|
| 섹션 제목(H2) 위 | 0 (섹션 패딩이 담당) |
| H1/H2 → 바로 아래 sub | 8px |
| 제목 → 본문 문단 | 8–10px |
| 문단 ↔ 문단 | 9–12px (본문 line-height와 조화) |
| 본문 → 리스트 | 8px, 리스트 항목 간 5px |
| 콜아웃/표 상하 | 16px |

규칙: 마진은 **아래로만**(margin-top 일원화)해 충돌 예방. 첫 요소 `:first-child` margin-top 0.

---

## 7. 숫자·통화 포맷 (Numerals)
- 통화: `1,234,000원` (천단위 콤마, `toLocaleString('ko-KR')`). 기호는 "원" 표기(₩ 혼용 금지, 일관성).
- 정렬 필요한 곳(계산 결과·표): `font-variant-numeric: tabular-nums;`
- 큰 금액 강조: Display/H2급 크기 + 800 + 악센트 색.
- 추정값엔 항상 "약 …(추정)" 병기(라이팅 규칙).
- 단위(시간/일/시급)는 숫자와 붙이되 보조색(ink-400)로 살짝 약하게.

---

## 8. 구현 — CSS 토큰 & 유틸리티

```css
:root{
  /* family */
  --font-sans:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,
    "Apple SD Gothic Neo","Malgun Gothic",system-ui,"Segoe UI",Roboto,sans-serif;
  /* size */
  --fs-display:clamp(2rem,4.2vw,2.94rem);
  --fs-h1:1.875rem; --fs-h2:2.0625rem; --fs-h3:1.5625rem;
  --fs-title:1.0625rem; --fs-lead:1.0625rem;
  --fs-body:.9375rem; --fs-body-sm:.84rem; --fs-caption:.78rem; --fs-legal:.72rem;
  /* weight */
  --fw-reg:400; --fw-med:500; --fw-semi:600; --fw-bold:700; --fw-x:800;
  /* leading / tracking */
  --lh-tight:1.25; --lh-head:1.3; --lh-body:1.6; --lh-loose:1.65;
}
@media(max-width:860px){
  :root{ --fs-h1:1.625rem; --fs-h2:1.625rem; --fs-h3:1.375rem; --fs-lead:.97rem; }
}
body{ font-family:var(--font-sans); font-size:var(--fs-body); line-height:var(--lh-body);
  color:var(--ink-700); -webkit-font-smoothing:antialiased; word-break:keep-all; overflow-wrap:anywhere; }

/* 역할 클래스(또는 시맨틱 태그에 직접 매핑) */
.t-display{font-size:var(--fs-display);line-height:var(--lh-tight);font-weight:var(--fw-x);letter-spacing:-.035em;color:var(--ink-900);text-wrap:balance}
.t-h1{font-size:var(--fs-h1);line-height:var(--lh-head);font-weight:var(--fw-x);letter-spacing:-.03em;color:var(--ink-900);text-wrap:balance}
.t-h2{font-size:var(--fs-h2);line-height:var(--lh-tight);font-weight:var(--fw-x);letter-spacing:-.03em;color:var(--ink-900);text-wrap:balance}
.t-h3{font-size:var(--fs-h3);line-height:var(--lh-head);font-weight:var(--fw-x);letter-spacing:-.02em;color:var(--ink-900)}
.t-title{font-size:var(--fs-title);line-height:1.4;font-weight:var(--fw-bold)}
.t-lead{font-size:var(--fs-lead);line-height:var(--lh-loose);color:var(--ink-500)}
.t-body{font-size:var(--fs-body);line-height:var(--lh-body);color:var(--ink-700);text-wrap:pretty}
.t-sm{font-size:var(--fs-body-sm);line-height:1.55;color:var(--ink-400)}
.t-caption{font-size:var(--fs-caption);line-height:1.5;font-weight:var(--fw-semi);letter-spacing:.02em}
.t-legal{font-size:var(--fs-legal);line-height:1.7;color:var(--ink-400)}
.num{font-variant-numeric:tabular-nums}
```

> 기존 코드의 ad-hoc `font-size`들을 이 토큰/클래스로 치환하면 타이포가 단일 기준으로 통일됨.

---

## 9. 접근성 (Type a11y)
- 본문 최소 15px(가독), 캡션 12.5px↑(11.5px는 면책 등 비핵심만).
- 모든 크기 **rem** → 브라우저 글자 확대 200%까지 레이아웃 유지.
- `line-height` 1.5↑(본문) — WCAG 권장.
- 색만으로 위계 표현 금지(크기·굵기 병행).

---

## 10. Do / Don't
- ✅ 헤드라인 800 + 음수 자간 / 본문 400 + 자간 0
- ✅ 한글 `word-break:keep-all`
- ✅ 금액 tabular-nums + "원"
- ❌ 900 굵기, faux bold
- ❌ 본문 자간 음수(한글 뭉개짐)
- ❌ 무분별한 `<br/>`로 줄바꿈 통제(모바일 깨짐)
- ❌ 영문 전용 디스플레이 서체 혼용

---

### 다음 편(②) 예고 — 컬러 시스템
뉴트럴 램프 11단계 토큰화, 악센트 on/hover/active 단계, 다크모드 대비표, 색 사용 규칙(60-30-10), 상태색·콜아웃 색 토큰, 대비 검증표.
