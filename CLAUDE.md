# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

노무AI — a Korean HR/labor (인사·노무) AI consultation platform (MVP). A worker, employer, or HR manager describes a labor problem; an AI gives a first-pass diagnosis, then routes them to calculators, a 노무사(labor attorney) directory, document templates, and an AI-generated consultation summary they can hand to a 노무사.

## Commands

```bash
npm start          # node server.js  → http://localhost:3000
npm run dev        # node --watch server.js (auto-restart on change)
npm run build      # generate static SEO pages from index.html → articles/*.html, sitemap.xml, robots.txt
npm run migrate    # one-time import of legacy data/*.json into the SQLite DB
npm run ingest <csv>   # 근로복지공단 CSV → data/nomusa.json (filters to labor-relevant agencies)
```

There is **no test suite, linter, or build step for the server** — it runs Node source directly. Requires **Node ≥ 22.5** (uses the built-in `node:sqlite`).

`npm run build` for deployment with a real domain:
```bash
SITE_URL=https://your-domain npm run build   # bakes domain into canonical/OG/sitemap
```

## Architecture

**Zero-dependency by design.** Only runtime deps are `express` and `@anthropic-ai/sdk`. Everything normally pulled from npm is hand-rolled on Node built-ins, intentionally: `.env` loading (`process.loadEnvFile`), security headers (helmet replacement), signed-session cookies + CSRF (HMAC via `node:crypto`), in-memory rate limiting, and the database (`node:sqlite`). Prefer extending these in-house over adding dependencies.

**Three layers:**
- `server.js` — the entire HTTP API and all routing in one file (Express 5). Static file serving, AI endpoints, admin/partner auth, the `/r/:token` summary-viewer page (server-rendered HTML), retention sweeps.
- `lib/repo.js` — the **only** module routes touch for persistence. Domain repositories (`bookings`, `leads`, `nomusa`, `partners`, `privacy`, `events`, `feedback`, `accessLogs`) encapsulate SQLite. Keep this boundary: routes call repo methods, never raw SQL.
- `lib/db.js` — SQLite connection, schema (`CREATE TABLE IF NOT EXISTS`), and inline migrations (e.g. `ALTER TABLE … ADD COLUMN` guarded by a `PRAGMA table_info` check). Add schema changes here as idempotent migrations.

**AI integration** (`lib/prompt.js` + `server.js`):
- `POST /api/chat` streams a consultation reply; `POST /api/summary` returns a structured JSON 상담요약서 via `output_config.json_schema` (`SUMMARY_SCHEMA`).
- **Demo mode:** if `ANTHROPIC_API_KEY` is unset, `client` is `null`, AI endpoints return 503, and the frontend falls back to mock responses. The server still boots and all non-AI features work. Don't assume a key is present.
- Default model is `claude-opus-4-8`, overridable via `ANTHROPIC_MODEL`. Cost is controlled by `max_tokens` caps and by keeping calculators/documents AI-free (pure templates).

**Frontend is a single 300KB+ file: `index.html`.** It's a hand-written SPA (no framework, no bundler) covering chat, info hub, calculators, 노무사 search, and the summary view. All article content lives **inline** in a `<script>` block as `ARTICLES`, `ART_EXTRA`, and `AUTHOR` globals.
- ⚠️ **`scripts/build-site.mjs` extracts those globals by evaluating `index.html`'s script inside a `node:vm` sandbox** (browser globals stubbed with a Proxy). It depends on the data being in the **first** `<script>` tag and on those exact variable names. **After editing article content in `index.html`, you must re-run `npm run build`** to regenerate the static SEO pages — they are derived artifacts, not hand-edited.
- Static article pages (`articles/*.html`) are SSR'd with `<title>`, meta description, OpenGraph, Twitter, JSON-LD (Article + FAQPage), and canonical. Their CTA links to `/#start=<key>` to launch the AI chat.

**Other server-side pages** (`admin.html`, `partner.html`) are static files served by `express.static` with `extensions: ["html"]`, so `/admin` and `/partner` resolve.

## Auth & sessions

- **Admin** (`/admin`): `ADMIN_TOKEN` → `POST /api/admin/login` issues an HMAC-signed session cookie (`nomu_sess`) + a CSRF token. Non-GET admin routes require the `x-csrf-token` header. Scripts can alternatively pass `x-admin-token` directly (bypasses CSRF).
- **Partner** (노무사, `/partner`): operator issues a one-time access token (`POST /api/admin/nomu/:id/token`); the 노무사 logs in to get a `nomu_partner` session. Partners can only see/update bookings assigned to them, and only to `in_progress`/`done` status.
- Token comparison uses `crypto.timingSafeEqual`. Session secret is `SESSION_SECRET`, falling back to a value derived from `ADMIN_TOKEN`.

## Data persistence & privacy (important domain constraints)

- Everything persists to **SQLite at `data/app.db`** (path overridable via `DB_PATH`). On free hosting tiers the filesystem is ephemeral — data resets on redeploy/sleep. Permanent storage needs a paid instance + mounted disk (see `render.yaml` comments).
- **Privacy is a hard product requirement, not a nicety:**
  - `retentionSweep()` (runs at boot + every 24h) hard-deletes bookings/leads older than 1 year and soft-deletes abandoned bookings after 30 days.
  - `POST /api/privacy/delete` lets a user erase their own data by token or contact.
  - The `/r/:token` summary links expire after 7 days; viewer IPs are stored only as salted hashes; access is logged.
- **Legal safety rules are baked into the product — preserve them when editing:**
  - The system prompt (`lib/prompt.js`) must keep framing AI output as **정보 제공, not 법률·노무 자문** (information, not legal advice), avoid definitive conclusions, use confidence labels (`[확정]/[가능성]/[추가 확인 필요]`), and mask company/personal names.
  - The 노무사 directory must be presented as **"정보 제공" not "추천"** (to avoid 공인노무사법 brokerage/알선 risk) and must honor opt-out (`opted_out`).

## Environment variables

See `.env.example`. Key ones: `ANTHROPIC_API_KEY` (optional → demo mode), `ANTHROPIC_MODEL`, `ADMIN_TOKEN` (set a strong value in prod), `SESSION_SECRET`, `DB_PATH`, `SITE_URL` (for SEO canonical/OG/sitemap), `PORT`. The `.env` is loaded natively — no dotenv.

## Deployment

`render.yaml` is a Render Blueprint (`buildCommand: npm install && npm run build`, `startCommand: npm start`, health check `/api/health`). `Procfile` (`web: node server.js`) covers Railway/Fly. The server binds `0.0.0.0` and trusts one proxy hop.

## Reference docs

The repo root has extensive planning/spec markdown (`MASTERPLAN.md`, `PRODUCT.md`, `PAGES.md`, `CONTENT.md`, `DESIGN.md` + `design/*.md`, `OPERATIONS.md`, `UPGRADE.md`, `POLISH.md`). Consult these for product/design intent rather than re-deriving it.
