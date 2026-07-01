# 인사야 — 인사·노무 AI 상담 플랫폼 (MVP)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ckddnjs1173/hrmanager)

> 위 버튼을 누르면 Render에 로그인 후 `render.yaml` 설정이 자동으로 적용됩니다.

근로자·사업주가 노무 문제를 AI로 먼저 진단받고, 계산기·노무사 검색·상담요약서로 이어지는 플랫폼.

## 빠른 시작

```bash
npm install
cp .env.example .env      # .env 열어 ANTHROPIC_API_KEY 입력
npm start                 # http://localhost:3000
```

> API 키가 없어도 서버는 뜹니다. 이 경우 AI 상담은 **데모(목업) 모드**로 동작하고,
> 계산기·정보 글·노무사 목록 등 나머지 기능은 그대로 사용할 수 있습니다.

## 구성

| 부분 | 파일 | 설명 |
|---|---|---|
| 프론트 | `index.html` | 단일 파일 SPA (대화·정보허브·계산기·노무사·요약서) |
| 서버 | `server.js` | Express. 정적 서빙 + AI API |
| 시스템 프롬프트 | `lib/prompt.js` | "단정 금지·정보제공" 규칙 + 요약서 스키마 |
| 노무사 데이터 | `data/nomusa.json` | 공공데이터 + 직접등록 |
| 수집 스크립트 | `scripts/ingest-nomusa.mjs` | 근로복지공단 CSV → JSON |

## API

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/chat` | 대화 메시지 → AI 응답 **스트리밍**(text) |
| `POST /api/summary` | 대화 → 상담요약서 **구조화 JSON** |
| `GET /api/docs` · `POST /api/doc` | 문서 목록(22종) · 문서 초안 렌더 |
| `GET /api/docpacks` · `POST /api/docpack` | 상황별 문서팩(7종) · 묶음 렌더 |
| `GET /api/nomu?region=강남` | 노무사 목록 |
| `POST /api/lead` · `POST /api/booking` | 리드 수집 · 상담 예약(동의 필수) |
| `GET /api/admin/data` 외 | 운영자 대시보드 데이터 (헤더 `x-admin-token` 필요) |
| `GET /r/:token` | 노무사 전달용 보안 요약서(7일 만료) |
| `GET /api/health` | AI 활성/모델 확인 |

주요 페이지: `/` SPA · `/admin` 운영자 대시보드(`ADMIN_TOKEN`으로 로그인) · `/articles/*.html` 정적 글. 전체 페이지 명세는 [`PAGES.md`](./PAGES.md) 참고.

## 배포 (무료 호스팅)

GitHub 저장소에 올린 뒤 아래 중 하나로 배포합니다. **키가 없어도 배포되며**(데모 모드), 나중에 환경변수만 채우면 AI가 켜집니다.

### Render (권장 · 블루프린트 자동 구성)
1. 코드를 GitHub에 push
2. [Render](https://render.com) → **New + → Blueprint** → 저장소 선택 (`render.yaml` 자동 인식)
3. 환경변수 입력: `ANTHROPIC_API_KEY`(선택), `SITE_URL`(첫 배포 후 받은 주소). `ADMIN_TOKEN`은 자동 생성됨
4. 배포 완료 → `https://<앱이름>.onrender.com`

### Railway / Fly.io 등
- `Procfile`(`web: node server.js`)과 `package.json`의 `build` 스크립트를 자동 인식합니다.
- 환경변수(`ANTHROPIC_API_KEY`·`ADMIN_TOKEN`·`SITE_URL`)를 대시보드에서 설정하세요.

### 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 선택 | 없으면 AI 상담은 데모 모드, 나머지 정상 |
| `ANTHROPIC_MODEL` | 선택 | 기본 `claude-opus-4-8` |
| `ADMIN_TOKEN` | **권장** | `/admin` 로그인 토큰 — 배포 시 강력한 값으로 |
| `SITE_URL` | 권장 | 정적 SEO의 canonical·OG·sitemap 도메인. 비우면 빌드 시 `RENDER_EXTERNAL_URL` 자동 사용 |
| `PORT` | 자동 | 대부분 호스트가 자동 주입 |

> ⚠️ **데이터 영속성**: 예약·리드·노무사는 **SQLite**(`data/app.db`, Node 내장 `node:sqlite`)에 저장됩니다. 무료 플랜은 파일시스템이 비영구적이라 재배포·절전 시 초기화됩니다. 영구 보관이 필요하면 유료 인스턴스 + 영구 디스크(`render.yaml` 주석 참고)로 전환하세요. 기존 `data/*.json`이 있으면 `npm run migrate`로 1회 이관할 수 있습니다. (Node **22.5+** 필요)

## SEO 정적 페이지 빌드

검색 노출을 위해 글마다 **JS 없이도 읽히는 정적 HTML**을 생성합니다.

```bash
npm run build                         # 로컬용
SITE_URL=https://내도메인 npm run build  # 배포용 (canonical/OG/sitemap에 도메인 반영)
```

생성물:
- `articles/<key>.html` — 글마다 정적 페이지 (`<title>`·meta description·Open Graph·Twitter·**JSON-LD Article+FAQPage**·canonical, 전체 본문 SSR)
- `sitemap.xml`, `robots.txt`

데이터 원본은 `index.html`(글 내용)이며, 빌드 스크립트가 추출해 정적 페이지로 만듭니다. **글을 고치면 `npm run build`를 다시 실행**하세요. 정적 글의 CTA는 앱의 `/#start=<key>`로 연결돼 바로 AI 상담이 시작됩니다.

## 노무사 공공데이터 수집

1. [근로복지공단 사무대행기관 현황](https://www.data.go.kr/data/3073001/fileData.do)에서 CSV 다운로드
2. `node scripts/ingest-nomusa.mjs ./받은파일.csv`
3. `data/nomusa.json` 갱신됨 (노무 관련만 필터링)

> ⚠️ 노무사 정보는 **"추천"이 아닌 "정보 제공"**으로 표기하고, 삭제 요청(옵트아웃)에 응하세요. (공인노무사법 알선 리스크 회피)

## 비용 통제

- 답변 길이 상한(`max_tokens`)으로 토큰 비용 제한
- 계산기·정보 글은 **AI를 쓰지 않는** 규칙/정적 처리 → 토큰 0원
- 모델은 `.env`의 `ANTHROPIC_MODEL`로 교체 가능(비용↓: sonnet/haiku)

## 안전·법적

- AI 답변은 **법률·노무 자문이 아닌 정보 제공**임을 UI·프롬프트에 명시
- 회사명·실명은 요약서에서 마스킹
- 구체적 사안은 공인노무사 상담 / 고용노동부 공식 절차로 안내
