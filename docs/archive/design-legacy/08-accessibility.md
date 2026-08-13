# 디자인 상세 기획 ⑧ 접근성 & 인클루시브

> 시리즈 8/N. 목표: **WCAG 2.2 AA**. 노무 서비스는 위기 상황의 다양한 사용자(고령·저시력·키보드·스크린리더·모바일)가 온다 → 접근성은 옵션이 아니라 신뢰의 일부. 모든 정보는 색·모션 없이도 전달돼야 한다.

---

## 1. 색·대비 (Contrast) — ②컬러와 연동
- 본문 ≥ **4.5:1**, 큰 글씨(18.66px+ 또는 14px+700) ≥ 3:1, UI 요소/아이콘 경계 ≥ 3:1.
- 텍스트는 `--ink-700`(본문)·`--ink-900`(제목)·`--ink-400`(보조, 14px+)까지만. `ink-300` 이하 텍스트 금지.
- 링크·악센트 텍스트 = `--accent-ink`(500 아님). 버튼 흰 글자는 채움면(500) 위에서만.
- **색만으로 의미 전달 금지**: 상태는 색 + 아이콘(✓/⚠/✕) + 텍스트.
- 포커스 표시는 대비 ≥ 3:1.

---

## 2. 키보드 (Keyboard)
- 모든 인터랙션 **Tab 도달 + Enter/Space 작동**. 시각 순서 = DOM 순서(논리적 탭 순서).
- **포커스 가시성**: `:focus-visible{ outline:2px solid var(--accent); outline-offset:2px }` 전역, 절대 `outline:none`만 두지 않기.
- **Skip link**: 페이지 최상단에 "본문 바로가기"(`href="#main"`), 포커스 시 노출.
- **드로어/모달**: 열리면 포커스 이동·**focus trap**, Esc 닫힘, 닫으면 트리거로 포커스 복귀, 배경 `inert`.
- 키보드 함정 금지(빠져나올 수 있어야).
- 커스텀 위젯(세그먼트 탭 등)은 적절한 키 지원(←/→로 탭 이동).

---

## 3. 포커스 관리 (Focus)
- 화면(SPA) 전환 시 포커스를 새 화면의 제목(h1, `tabindex="-1"`)으로 이동 + 스크린리더 알림.
- 모달 오픈: 첫 포커스 가능한 요소 또는 제목으로.
- 동적 콘텐츠(검색 결과·AI 답변) 등장 시 적절히 알림(§4).

---

## 4. 스크린리더 / 시맨틱 (ARIA)
- **시맨틱 우선**: `<header><nav><main><section><footer>`, 버튼=`<button>`, 링크=`<a href>`(div 클릭 금지).
- 랜드마크: `<main id="main">` 1개, `<nav aria-label="주요">`/`<nav aria-label="사이트 메뉴">` 구분.
- 제목 위계: h1(페이지 1개) → h2 → h3, 건너뛰지 않기.
- 이미지: 정보성 `alt`, 장식 `alt=""`. 아이콘 버튼은 `aria-label`.
- 상태 변화 알림:
  - AI 스트리밍/검색 결과 영역 `aria-live="polite"`, 로딩 `aria-busy="true"`.
  - 토스트/에러 `role="status"`(비긴급) / `role="alert"`(긴급).
- 세그먼트=`role="tablist"`/`tab`+`aria-selected`, FAQ=`<details>/<summary>`(네이티브), 아코디언 커스텀이면 `aria-expanded`.
- 폼 컨트롤: `<label for>` 연결, 그룹은 `<fieldset><legend>`.
- 모달 `role="dialog" aria-modal="true" aria-labelledby`.
- 현재 위치: 활성 내비 `aria-current="page"`.
- 장식 이모지: 의미 없으면 `aria-hidden="true"`, 의미 있으면 텍스트 병기.

---

## 5. 폼 접근성 (Forms) — 계산기·문서·예약·검색
- 모든 입력에 보이는 라벨(placeholder만으로 금지).
- 에러: 색 + 아이콘 + 텍스트, `aria-describedby`로 메시지 연결, `aria-invalid`.
- 필수: 라벨에 명시(별표만 X → "필수" 텍스트나 `aria-required`).
- 숫자 입력: `inputmode="numeric"`/적절한 type, 단위 라벨.
- 자동완성: `autocomplete` 적절히(이름·이메일·전화).
- 제출 버튼 상태(로딩) 동안 중복 제출 방지 + `aria-busy`.

---

## 6. 터치 & 포인터 (Target Size)
- 터치 타깃 ≥ **44×44px**(WCAG 2.2 Target Size AA는 24px이나 모바일 권장 44). 작은 아이콘도 패딩으로 확보.
- 인접 타깃 간 충분한 간격(오터치 방지).
- 호버 전용 정보 금지(터치엔 호버 없음) → 탭/포커스로도 도달.
- 제스처는 단순 탭으로 대체 가능해야(복잡 제스처 단독 금지).

---

## 7. 모션 민감 (Motion) — ⑥과 연동
- `prefers-reduced-motion: reduce` 시 트랜지션/자동재생/패럴랙스 비활성, 히어로 영상 정지.
- 자동재생 영상은 무음·장식용만. 깜빡임 3회/초 초과 금지.
- 자동 이동 콘텐츠(캐러셀 등) 사용 시 정지 컨트롤 제공(현재 미사용).

---

## 8. 텍스트·줌·언어
- `<html lang="ko">`. 외국어 구절은 해당 `lang`.
- 모든 크기 **rem** → 텍스트 200% 확대 시 가로 스크롤 없이 reflow(반응형).
- 줄간격 본문 1.5↑, 자간 과한 음수 금지(본문).
- 한글 줄바꿈 `word-break:keep-all`(가독). 의미 단위 유지.
- 콘텐츠 reflow: 320px 폭에서도 가로 스크롤 없이(반응형 단일 컬럼).

---

## 9. 콘텐츠·언어 명료성 (Cognitive)
- 쉬운 말, 짧은 문장. 법률 용어엔 짧은 설명 병기.
- 중요한 행동은 명확한 라벨("AI로 진단하기" > "시작").
- 에러는 "무엇이/왜/어떻게 고치는지" 안내.
- 면책·고지는 일관 위치·일관 문구(라이팅 ⑨).
- 일관된 내비·패턴(예측 가능성).

---

## 10. 테스트 체크리스트 (WCAG 2.2 AA)
- [ ] 키보드만으로 전 기능 사용 + 포커스 항상 보임 + Skip link
- [ ] 명도 대비 본문 4.5:1 / 큰글씨·UI 3:1 (자동검사 axe + 수동)
- [ ] 색만으로 의미 전달하는 곳 없음(아이콘/텍스트 병기)
- [ ] 제목 위계 올바름, 랜드마크 존재, 이미지 alt
- [ ] 폼 라벨·에러·필수 표시·`aria-invalid`
- [ ] 동적 영역 `aria-live`, 모달 focus trap·Esc·복귀
- [ ] 터치 타깃 ≥44px, 320px 폭 reflow, 200% 줌 OK
- [ ] `prefers-reduced-motion` 동작, 자동재생 정지
- [ ] 스크린리더 1회 통과(VoiceOver/NVDA): 내비·상담·계산기·글
- [ ] `<html lang="ko">`, 페이지별 `<title>` 의미 명확
- 도구: **axe DevTools / Lighthouse(접근성) / 키보드 수동 / 스크린리더 1종**.

---

## 11. 구현 — 공통 a11y CSS/패턴
```css
:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{
  outline:2px solid var(--accent); outline-offset:2px; border-radius:inherit;
}
.skip-link{position:absolute;left:-9999px;top:8px;background:#fff;border:1px solid var(--line);
  padding:8px 12px;border-radius:var(--r-md);z-index:var(--z-toast)}
.skip-link:focus{left:8px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
```
```html
<a class="skip-link" href="#main">본문 바로가기</a>
<main id="main" tabindex="-1">…</main>
<!-- 아이콘 버튼 --> <button aria-label="링크 복사">🔗</button>
<!-- 라이브 영역 --> <div id="chatBody" aria-live="polite" aria-busy="false">…</div>
```

---

## 12. Do / Don't
- ✅ 시맨틱 태그 + 가시 포커스 + 키보드 전부
- ✅ 색+아이콘+텍스트로 상태
- ✅ rem·reflow·터치 44px
- ✅ `aria-live`로 동적 알림, 모달 focus trap
- ❌ `outline:none`만 두기
- ❌ div를 버튼처럼(키보드 안 됨)
- ❌ placeholder를 라벨 대용
- ❌ 색/모션에만 의존, reduced-motion 무시

---

### 다음 편(⑨) 예고 — UX 라이팅 & 보이스(톤앤매너)
브랜드 보이스, 단정 금지·정보제공 톤 규칙, 마이크로카피(버튼·빈 상태·에러·플레이스홀더), 면책 문구 표준, 숫자·법률용어 표기, 근로자/사업주 톤 차이, 금칙어.
