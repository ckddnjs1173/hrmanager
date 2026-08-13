# 디자인 상세 기획 ⑥ 모션 & 인터랙션

> 시리즈 6/N. 원칙: **빠르고 은은하게, 의미 있게**. 모션은 "주의를 끄는 장식"이 아니라 "상태 변화를 설명"하는 도구. 노무 = 신뢰 서비스 → 화려한 패럴랙스·바운스 금지. 모든 모션은 `prefers-reduced-motion`을 존중.

---

## 1. 듀레이션 (Duration)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--dur-1` | 120ms | 마이크로(색·보더·작은 페이드) |
| `--dur-2` | 160ms | 호버 리프트·버튼·칩 |
| `--dur-3` | 220ms | 화면 전환·아코디언·탭 |
| `--dur-4` | 260ms | 드로어·모달·큰 패널 |
| `--dur-scroll` | 500–600ms | 스크롤 진입(섹션 fade-up) |

규칙: **작을수록 빠르게**. 200ms 넘기면 "느리다" 체감 → 큰 표면(드로어/모달)만 260ms 허용. 100ms 미만은 안 보임(피함).

---

## 2. 이징 (Easing)
| 토큰 | 곡선 | 용도 |
|---|---|---|
| `--ease` | `cubic-bezier(.2,.7,.2,1)` | **기본**(빠르게 시작→부드럽게 정지, 자연스러움) |
| `--ease-out` | `cubic-bezier(0,.6,.4,1)` | 진입(등장) |
| `--ease-in` | `cubic-bezier(.5,0,.9,.4)` | 퇴장(사라짐) |
| `--ease-inout` | `cubic-bezier(.5,0,.2,1)` | 위치 이동(드로어) |

규칙: 등장은 `ease-out`(빠르게 나타나 안착), 퇴장은 `ease-in`. 바운스/elastic 금지(신뢰 톤). 대부분 `--ease` 하나로 충분.

---

## 3. 트랜지션 카탈로그 (Catalog)
| 상호작용 | 속성 | 듀레이션/이징 |
|---|---|---|
| 버튼 hover | filter(brightness) | `--dur-2` `--ease` |
| 버튼 active | transform translateY(1px) | `--dur-1` |
| 타일 hover | transform + box-shadow + border-color | `--dur-2` `--ease` |
| 칩/필터 hover·active | bg·color·border | `--dur-1` |
| 인풋 focus | border-color (+링) | `--dur-1` |
| 화면(screen) 전환 | opacity + translateY(6px) | `--dur-3` `--ease-out` |
| 아코디언(FAQ) | height/grid-rows + opacity | `--dur-3` `--ease` |
| 드로어(모바일 사이드바) | transform translateX | `--dur-4` `--ease-inout` |
| scrim | opacity | `--dur-3` |
| 모달 | opacity + scale(.98→1) | `--dur-4` `--ease-out` |
| 토스트 | translateY + opacity | `--dur-3` |
| 서브내비 표시 | opacity(짧게) | `--dur-2` |
| 타이핑 인디케이터 | 점 3개 opacity 루프 | 1.2s loop |
| 히어로 영상 | 자동재생 루프(장식) | — |

규칙: **transform·opacity만 애니메이트**(GPU 합성, 부드러움). width/height/top/left 애니메이션 지양(레이아웃 리플로우). 아코디언은 `grid-template-rows:0fr→1fr` 기법 권장.

---

## 4. 스크롤 진입 애니메이션 (Reveal on Scroll)
- 랜딩 섹션/카드가 뷰포트 진입 시 **8–12px 아래에서 fade-up** 1회.
- **IntersectionObserver** 사용(스크롤 이벤트 X), 한 번 보이면 unobserve.
- 듀레이션 `--dur-scroll`, `--ease-out`, 항목 간 **stagger 60–80ms**(과하지 않게, 최대 4~5개).
- 초기 상태 `opacity:0; translateY(10px)` → 진입 시 `.in`으로 `opacity:1; translateY(0)`.
- **reduced-motion 시**: 즉시 `opacity:1`(움직임 없음).
- 남용 금지: 히어로 텍스트(첫 화면)는 애니메이션 없이 즉시 표시(LCP·체감속도).

```js
const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.15});
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.querySelectorAll('[data-reveal]').forEach((el,i)=>{el.style.transitionDelay=(i%5*70)+'ms';io.observe(el)});
} else { document.querySelectorAll('[data-reveal]').forEach(el=>el.classList.add('in')); }
```

---

## 5. 마이크로 인터랙션 (Micro)
- **버튼 눌림**: 1px 내려가 "눌렸다" 피드백.
- **복사 버튼**: 클릭 → 라벨 "✓ 링크 복사됨"으로 1.5초 치환 후 복귀.
- **계산 결과**: 결과 카드가 fade-up로 등장(값은 즉시, 카운트업 애니메이션은 선택—과하면 생략).
- **타이핑 인디케이터**: AI 응답 전 점 3개 깜빡임 → 스트리밍 시작 시 제거.
- **스트리밍**: 토큰 누적 렌더(자연스러운 타이핑 느낌), 자동 하단 스크롤.
- **타일 hover**: 살짝 떠오름(−3px)으로 "클릭 가능" 암시.
- 규칙: 마이크로는 **빠르고 1회성**. 무한 반복 애니메이션은 로딩/타이핑만.

---

## 6. 페이지 전환 (View Transition)
- SPA 화면 전환: 현재 `@keyframes fade`(opacity+6px up, `--dur-3`). 유지.
- (선택, v2) View Transitions API로 부드러운 크로스페이드 — 미지원 브라우저는 기존 방식 폴백.
- 전환 시 스크롤 위치 상단 리셋(콘텐츠 영역).

---

## 7. 접근성 — prefers-reduced-motion (필수)
```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important;
  }
}
```
- 추가: 히어로 **영상 자동재생 정지**(reduced-motion 시 `pause()` 또는 포스터만), 타이핑 인디케이터는 정적 텍스트("입력 중…")로.
- 모든 정보는 모션 없이도 전달돼야 함(모션은 보강일 뿐).
- 깜빡임 3회/초 초과 금지(발작 위험).

---

## 8. 성능 가드
- 애니메이션 속성은 **transform/opacity** 우선. `will-change`는 꼭 필요한 곳만(남용 시 메모리↑).
- 스크롤 핸들러 대신 IntersectionObserver.
- 큰 그림자+애니메이션 동시 남발 금지(페인트 비용). 호버 그림자는 e2까지.
- 자동재생 영상은 무음·`playsinline`·압축(<5MB), 모바일은 포스터로 대체 고려.

---

## 9. 구현 — 토큰
```css
:root{
  --dur-1:120ms; --dur-2:160ms; --dur-3:220ms; --dur-4:260ms; --dur-scroll:560ms;
  --ease:cubic-bezier(.2,.7,.2,1);
  --ease-out:cubic-bezier(0,.6,.4,1);
  --ease-in:cubic-bezier(.5,0,.9,.4);
  --ease-inout:cubic-bezier(.5,0,.2,1);
}
[data-reveal]{opacity:0;transform:translateY(10px);transition:opacity var(--dur-scroll) var(--ease-out),transform var(--dur-scroll) var(--ease-out)}
[data-reveal].in{opacity:1;transform:none}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.screen.active{animation:fade var(--dur-3) var(--ease-out)}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
  [data-reveal]{opacity:1;transform:none}
}
```

---

## 10. Do / Don't
- ✅ transform·opacity만, `--ease` 기본
- ✅ 빠르게(≤220ms, 큰 표면만 260)
- ✅ 스크롤 진입 1회 + stagger 절제 + reduced-motion 가드
- ✅ 모션은 상태 변화를 "설명"
- ❌ 바운스·elastic·과한 패럴랙스
- ❌ width/height/top/left 애니메이션(리플로우)
- ❌ 무한 반복(로딩·타이핑 제외)
- ❌ 히어로 텍스트 등장 지연(LCP 손해)
- ❌ reduced-motion 무시

---

### 다음 편(⑦) 예고 — 아이콘 · 일러스트 · 미디어
아이콘 세트 기준(스타일·크기·stroke), 이모지→라인아이콘 전환 계획, 일러스트 톤, 제품 스크린샷/목업 규격, 사진(노무사) 가이드, OG/소셜 이미지 템플릿, 에셋 파이프라인·폴백.
