# Case-first IA 최종 코드 리뷰

검토 시작: `ea76fb713a7963b7553995894a85236cb7a78a9a`

브랜치: `feat/case-first-ia`

fetch 후 비교 기준: `origin/main` = `6a0c03ca6e032ab510278ca88ca6bfd4b3beb0a1`

기존 구현을 다시 만들지 않고 `origin/main...HEAD`의 제품·코드·테스트 변경을 검토했다.

## 발견과 보정

| 항목 | 검토 결과 / 보정 |
|---|---|
| PostgreSQL directory | 지역 조건이 있어도 모든 공개 행을 가져오던 처리를 SQL 조건으로 이동했다. `opted_out=FALSE`는 항상 유지한다. |
| 지역 필터 의미 | 기존 SQLite 및 검토 시작 커밋의 `includes` 의미를 보존한다. 대소문자를 구분하는 `LIKE $1 ESCAPE '!'`와 바인딩을 사용하며 `%`, `_`, `!`를 escape한다. `ILIKE`로 바꾸면 영문 대소문자 검색 결과가 달라지므로 채택하지 않았다. |
| 공통 순위 | featured → v(자격확인) → 선택 지역 → 선택 분야 → 이름/식별자의 결정적 순서를 보존했다. 실제 UI에서는 지역·분야가 먼저 필터링되므로 그 안에서 광고·자격확인 순위가 적용된다. |
| ES module | `directory-policy.js`가 순수 named export를 제공하고 두 Node repository가 명시적으로 import한다. Node 전역 객체 의존성을 제거했다. |
| 브라우저 호환 | `directory-browser.js`가 동일 module을 로드해 기존 `window.INSAYA_DIRECTORY` API를 제공한다. 목록은 준비 Promise를 기다린 뒤 로드하여 첫 `#nomu` 진입의 로딩 순서 경쟁을 방지한다. |
| Navigation 범위 | 일반 HTML 변환은 기본적으로 메뉴를 추가하지 않는다. Business/Advisor/Worker 및 article 경로에서만 명시적으로 opt-in한다. 별도 공개 landing과 Home은 기존 주입 경로를 유지한다. |
| Navigation 중복 | 기존 `defer` 또는 다른 속성 순서의 script도 src/href 기준으로 감지해 중복 주입하지 않는다. |
| Business 상태 표시 | 기존 CSS의 `display` 규칙이 `hidden` 속성을 덮어 로그인 화면과 Workspace가 동시에 보였다. Business/Advisor 컨테이너 안에서는 숨김 상태가 레이아웃보다 우선하도록 보정했다. 인증이나 인가 로직 변경은 없다. |
| Static release | Worker/Employer/Tools 공개 페이지와 필요한 IA/정렬 자산을 필수 파일 검사에 추가했다. |

## 변경 없이 보존한 계약

- API 목록의 배열 및 각 레코드 구조, authoritative featured boolean, 옵트아웃 제외.
- Business landing: 401은 로그인 필요, 404는 SaaS 비활성, 503/네트워크 오류는 상태 확인 실패 및 CTA 비노출. 성공 응답도 회사 권한에 따른 이용으로 안내한다.
- Organization Membership/RBAC, Advisor ShareGrant, CSRF, 문서 암호화, Worker 사건 접근 토큰.
- AI handoff는 사용자 대화에서 감지한 사건 유형을 활용하며 LLM의 riskLevel로 결정하지 않는다. 특정 노무사 추천을 하지 않고 직접 해결 링크를 함께 제공한다.
- Worker Core 5 경로, 계산기·문서·기존 가이드 및 analytics 함수와 사건 흐름.
- 새 landing의 canonical은 서버 SITE_URL로 재작성된다. sitemap에는 각 공개 URL이 한 번씩 포함된다.
- Windows CRLF 수정은 입력 텍스트의 줄바꿈만 정규화한다. 기존 검증 조건이나 안전장치를 제거하지 않는다.
- 기존 CI browser job은 Playwright 설치 및 Chromium 설치 뒤 새 smoke를 실행한다. production job의 main 조건은 변경하지 않았다.

## 검증 결과

Windows / Node 24.13.0 환경에서 실행했다. PowerShell 실행 정책 때문에 npm의 Windows 실행 파일인 `npm.cmd`를 사용했다.

| 명령 | 결과 |
|---|---|
| `npm test` | 405 통과, 실패/skip 없음 |
| `npm run check` | 405 테스트 및 빌드 통과 |
| `npm run content:check` | 통과 |
| `npm run deployment:check` | non-production 검사 통과 |
| `npm run release:check` | 405 테스트, 빌드, 콘텐츠, 배포 설정, 필수 파일 76개 검사 통과 |
| `node scripts/case-first-browser-smoke.mjs` | `IA_BROWSER_CHANNEL=msedge`로 직접 실행하여 통과 |
| `git diff --check` | 통과 |

브라우저 검증: 1440/768/390/320px, 공개 진입/계산/문서/노무사/Worker Core 5/Business/Advisor/article의 메뉴 1회 렌더링, 메뉴 Escape·포커스, overflow, JS 오류, 정렬·필터·비교, AI handoff 및 직접 해결, Business 401/404/503 표시. Admin/Legal Admin/Partner HTML에 공통 메뉴 script가 주입되지 않는 것도 확인했다.

로그인 후 Workspace 탭과 숨김 상태는 브라우저 API 응답 fixture로 검증했다. PostgreSQL repository는 query stub으로 바인딩·필터·반환 순위를 검사했으며 실제 DB 연결 테스트가 아니다. SQLite는 메모리 DB를 사용했다.

로그: `ia-review-*.log` (git 제외). 화면: `.shots/case-first/` (git 제외).

## 한계와 운영 경계

- 실제 PostgreSQL 서버에서 SQL을 실행하거나 migration/cutover를 수행하지 않았다.
- 실제 SaaS 로그인·이메일 발송·Organization/Advisor 공유 연동과 실 AI provider 응답은 이번 검증 범위가 아니다.
- GitHub CI의 원격 실행 결과는 로컬 검사 통과와 별개다.
- release 검사에 기존 Render free-plan persistence 경고가 있다. 이는 저장소 설정 검사 결과이며 현재 Production 상태를 확인한 결과가 아니다.
- Production, secret, DB 운영 데이터, SaaS 활성화 설정, main merge는 변경하지 않았다.
