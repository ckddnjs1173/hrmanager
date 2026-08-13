# 인사야 1.0 디자인 시스템

> 상태: 제품 UI 기준
> 기준일: 2026-08-14
> 목적: 기능 추가 과정에서 누적된 시각 스타일을 하나의 제품 언어로 통일한다.

## 1. 디자인 목표

인사야의 디자인은 법률 사이트처럼 무겁거나 AI 챗봇처럼 가벼워 보이지 않아야 한다.

목표는 세 가지다.

1. **신뢰** — 정보의 근거와 상태가 분명하다.
2. **이해** — 복잡한 노동문제를 사용자가 읽을 수 있는 단위로 나눈다.
3. **행동** — 사용자가 다음에 무엇을 해야 하는지 항상 보인다.

키워드:

`차분함 / 명료함 / 공신력 / 행동 중심 / 과장 없는 친절함`

---

## 2. 시각 방향

기존 딥 네이비 기반의 신뢰형 방향은 유지한다.

다만 그라데이션·카드 그림자·장식 요소가 기능마다 따로 증가하지 않도록 제한한다.

### 기본 원칙

- 배경은 흰색/아주 옅은 회색 위주
- 핵심 액션에만 브랜드 색 사용
- 정보 카드 대부분은 border 기반
- 그림자는 floating/modal 등 실제 계층이 필요할 때만 사용
- 위험/경고/성공 상태는 의미가 있을 때만 색 사용
- 법률 근거와 출처는 장식이 아니라 정보 구조로 표현

---

## 3. Color Tokens

현재 코드의 네이비 계열을 기반으로 정리한다.

```text
brand-700  #0E2038
brand-600  #142B47
brand-500  #1B3A5B
brand-100  #DCE4EF
brand-050  #EEF2F7

ink-900    #0B0D12
ink-700    #2B2F36
ink-500    #4B5563
ink-300    #9AA1AD
line       #E7E9EE
surface    #F7F8FA
white      #FFFFFF

success    #15814F
success-bg #E7F7EF
warning    #9A6212
warning-bg #FCF3E3
danger     #B42318
danger-bg  #FDEAEA
```

### Accent 사용 규칙

Brand:
- Primary button
- 선택 상태
- 진행 상태
- 중요한 링크

Danger:
- 법적 불이익 가능성
- 기한 임박
- 실제 오류/삭제

Warning:
- 추가 확인 필요
- 근거 불충분

Success:
- 확인 완료
- 행동 완료
- 증거 확보

---

## 4. Typography

### 기본 폰트

Pretendard 계열을 UI 기본으로 사용한다.

세리프는 콘텐츠/에디토리얼에서 제한적으로 사용한다.
제품 Workspace의 제목·버튼·수치에는 Sans를 기본으로 한다.

### Scale

```text
Display   40/48  700
H1        32/40  700
H2        24/32  700
H3        20/28  700
Title     17/24  600
Body      16/26  400
Body-sm   14/22  400
Label     13/18  600
Caption   12/18  400
Number-L  30/36  700
```

### 원칙

- 본문 16px 미만을 기본 텍스트로 쓰지 않음
- 법률 고지라고 해서 지나치게 작은 글씨를 쓰지 않음
- 금액/날짜는 tabular 숫자 사용
- 긴 법률 설명은 720~800px 읽기 폭 유지

---

## 5. Spacing

4px 기반 체계.

```text
4  / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96
```

### 기본 사용

- 컴포넌트 내부: 12~20
- 카드 내부: 20~24
- 화면 블록 간: 32~48
- 큰 섹션 간: 64~96

---

## 6. Radius

```text
sm   8
md   12
lg   16
xl   20
pill 999
```

카드마다 서로 다른 radius를 만들지 않는다.

---

## 7. Elevation

### Level 0

일반 카드. border만 사용.

### Level 1

Hover 또는 선택된 카드.

### Level 2

Sticky action / dropdown.

### Level 3

Modal / drawer.

상시 카드에 강한 그림자를 쓰지 않는다.

---

## 8. Layout

### Desktop

```text
Page max-width: 1200px
Workspace content: 1080~1160px
Reading content: 760~800px
Gutter: 24~32px
```

### Breakpoints

```text
mobile < 640
compact 640~859
desktop >= 860
wide >= 1200
```

기존 860px 전환 기준은 최대한 유지해 회귀 위험을 줄인다.

---

## 9. Header

### Global Header

```text
인사야 | 문제 해결하기 | 가이드 | 전문가 찾기 | 내 사건
```

### 규칙

- Home에서는 `문제 해결하기`가 핵심
- Case 내부에서는 Header보다 Case Header가 더 강해야 함
- `무료 진단` 같은 중복 CTA를 우측에 계속 반복하지 않음
- 베타 배지는 정식 제품 단계에서 제거 예정

---

## 10. Button

### Primary

한 화면에 기본 1개.

예:
- 문제 해결 시작하기
- 체불액 계산 계속하기
- 문서 초안 만들기

### Secondary

현재 단계의 보조 행동.

### Tertiary

텍스트 링크 또는 ghost.

### Danger

삭제/취소 등 파괴적 행동 전용.

### 규칙

- `다음`, `확인`처럼 의미 없는 버튼명보다 결과를 표현
- 아이콘만 있는 버튼은 접근성 label 필수
- disabled 상태에 이유를 숨기지 않음

---

## 11. Input

### 종류

- Text
- Textarea
- Date
- Money
- Number
- Select
- Radio Card
- Checkbox
- Segmented control

### Case Intake에서의 우선순위

`선택 가능한 사실 → Radio/Choice`

`날짜 → Date`

`금액 → Money`

`설명 → Textarea`

자유 텍스트만으로 모든 질문을 받지 않는다.

---

## 12. Card Types

카드 종류를 제한한다.

### Standard Card

일반 정보 묶음.

### Status Card

확인/미확인/위험 등 상태.

### Next Action Card

Case Workspace에서 가장 중요한 카드.
한 화면에서 가장 강한 시각 위계.

### Metric Card

예상금액/기한/증거 수.

### Evidence Card

증거 상태 변경.

### Legal Source Card

근거/기준일/검증일.

### Expert Card

노무사 정보.

기능별로 새로운 카드 스타일을 계속 만들지 않는다.

---

## 13. Status System

### Confirmed

`확인됨`

- green check
- 사실 검증 완료

### Needs Info

`추가 확인 필요`

- amber
- 사용자 입력 필요

### Unknown

`모름`

- neutral gray

### Risk

`주의 필요`

- red
- 실제 불이익/긴급성 있을 때만

### Estimated

`추정`

- blue/neutral
- 계산 또는 AI 추정값

---

## 14. Progress

퍼센트만 표시하지 않는다.

```text
상황 정리   완료
판단 준비   완료
금액 확인   진행 중
증거 정리   대기
해결 준비   대기
```

Mobile에서는 compact stepper로 표현한다.

---

## 15. Next Best Action Pattern

Case Workspace에서 가장 중요한 제품 패턴.

```text
다음으로 할 일

체불액을 정확히 확인하세요.
현재 기본급은 확인됐지만 연장근로수당은 아직 계산되지 않았어요.

[수당 계산 계속하기]
```

구성:

- 이유
- 행동
- 기대 결과

여러 CTA를 동급으로 나열하지 않는다.

---

## 16. Legal Information Pattern

```text
적용 기준
2026-08-01 기준

근거
근로기준법 ○조

상태
현재 적용 중

마지막 확인
2026-08-14

[공식 출처 보기]
```

시행 예정은 별도 badge:

`시행 예정`

현재 적용 규칙과 섞지 않는다.

---

## 17. Money Pattern

금액은 다음 3단계로 구분한다.

### Confirmed

`3,000,000원`

### Estimated

`약 3,000,000원`

### Incomplete

`3,000,000원 + 추가 수당 확인 필요`

큰 숫자 하나만 강조하고 아래에서 구성 항목을 설명한다.

---

## 18. Evidence Pattern

체크박스 자체보다 상태 관리가 중요하다.

```text
급여명세서
현재 상태: 있음
[상태 변경]
```

상태:

- 있음
- 없음
- 확보 예정
- 해당 없음

---

## 19. Alert

### Info

설명/도움말.

### Warning

추가 확인 필요.

### Critical

기한/권리 상실 위험 등 실제 행동이 필요한 경우.

Alert를 장식용 배경 박스로 남용하지 않는다.

---

## 20. Empty State

나쁜 예:

`데이터가 없습니다.`

좋은 예:

```text
아직 계산된 금액이 없어요.
급여와 미지급 기간을 확인하면 예상 체불액을 계산할 수 있습니다.
[금액 확인하기]
```

---

## 21. Error State

반드시 알려야 하는 것:

1. 무엇이 실패했는지
2. 사용자의 입력이 보존됐는지
3. 어떻게 다시 시도하는지

AI 호출 실패로 Case 전체가 사라져서는 안 된다.

---

## 22. Loading

AI의 생각을 연출하는 문구보다 실제 작업 상태를 보여준다.

예:

- 사건 유형 확인 중
- 입력한 사실 정리 중
- 계산 가능한 항목 확인 중

과도한 애니메이션을 쓰지 않는다.

---

## 23. Mobile Rules

- 주요 CTA는 thumb reach를 고려
- 고정 하단 CTA는 필요한 화면에서만 사용
- 2열 카드 강제 금지
- Workspace 탭은 아코디언 또는 horizontal tabs
- 핵심 금액/기한이 첫 화면에 보이도록 함
- 모달보다 bottom sheet/drawer 우선 검토

---

## 24. Accessibility

최소 기준:

- WCAG AA 수준 색 대비 목표
- keyboard focus visible
- semantic heading
- form label 연결
- error message와 field 연결
- icon-only button aria-label
- motion reduce 지원
- 색상만으로 상태 구분하지 않음

현재 코드의 `focus-visible`, reduced-motion 기반은 유지 자산으로 활용한다.

---

## 25. Content Tone

### 권장

- 짧고 구체적
- 사용자가 이해하는 표현 우선
- 행동 중심
- 판단의 불확실성 명시

### 피함

- 법률용어만으로 설명
- 과도한 안심 표현
- 승소/위법 확정
- AI를 사람 전문가처럼 표현

### 예

나쁜 문구:

`법적으로 문제가 있을 수 있습니다.`

좋은 문구:

`현재 확인된 내용만 보면 임금 미지급 쟁점이 있습니다. 지급일과 실제 입금내역을 확인하면 금액을 더 정확히 정리할 수 있습니다.`

---

## 26. 기존 스타일 정리 정책

현재 `index.html`에 이미 많은 디자인 토큰과 컴포넌트 스타일이 있다.

1차 리팩터링에서는 전부 새로 만들지 않는다.

순서:

1. 기존 토큰 매핑
2. 중복 값 제거
3. Core Component 추출
4. Case Component 추가
5. 화면별 임시 inline style 제거
6. 레거시 component 사용처 제거 후 삭제

---

## 27. Core Components 1.0

필수:

```text
Button
IconButton
TextField
TextArea
MoneyInput
DateInput
Select
ChoiceGroup
Checkbox
Badge
Alert
Card
MetricCard
ProgressStepper
Tabs
Accordion
Modal/Drawer
Skeleton
EmptyState
ErrorState
```

Case 전용:

```text
CaseHeader
NextActionCard
FactItem
IssueItem
MoneyBreakdown
EvidenceItem
ActionStep
DocumentRecommendation
LegalSourceCard
```

---

## 28. 디자인 완료 기준

화면을 제품 수준으로 인정하려면:

- Primary Action이 명확함
- Desktop/Mobile 정의됨
- 모든 상태 정의됨
- 기존 토큰 재사용 여부 확인
- 법률 정보의 기준일/상태 표현 가능
- 정보 위계가 색상 없이도 이해됨
- 임시 스타일 없이 Core Component 조합으로 구현 가능
