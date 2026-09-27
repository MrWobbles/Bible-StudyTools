# Bible Study Tools — Copilot Agent Guidance

## Project Overview

**Bible Study Tools** is an interactive presentation system for synchronized Bible study with video playback and teacher controls. The app is built as a multi-page vanilla JavaScript frontend (HTML/CSS) with an Express API backend.

- **Primary use**: Serve static HTML/CSS/JS pages and provide API endpoints for data storage (Supabase-backed or local JSON fallback).
- **Architecture**: Express server (`server.js`), Supabase integration (`db.js`), desktop Electron wrapper (`desktop/`).
- **Data**: Classes, lesson plans, notes, VBS scenes stored in Supabase JSONB tables (schema in `scripts/supabase/schema.sql`); local JSON files fallback in `data/`.

---

## Development Commands

All commands are defined in [package.json](package.json).

### Running the Server
- `npm start` or `npm run dev` — Start the Express server on port 3000 (default).

### Styles
- `npm run build:styles` — Compile SCSS (admin, teacher, student, editor) to CSS.
- `npm run watch:styles` — Watch mode for SCSS compilation.

### Testing
- `npm run check:syntax` — Static JS/JSON syntax checks (Node.js script in `scripts/ci/`).
- `npm run test:unit` — Vitest unit tests (API, helpers).
- `npm run test:unit:watch` — Vitest watch mode.
- `npm run test:e2e` — Playwright browser tests (full suite).
- `npm run test:e2e:p0` — P0 (highest priority) end-to-end tests only.
- `npm run test:e2e:priority` — P0-P2 tests.
- `npm run test:e2e:a11y` — Accessibility audit.
- `npm run test:e2e:contrast` — Color contrast audit.
- `npm run test:e2e:headed` — Playwright tests in headed mode (visible browser).
- `npm run test:smoke:light` — Fast smoke test (syntax, unit, API endpoints).
- `npm run test:smoke:heavy` — Slow smoke test (all endpoints, edge cases).

### Test Aggregates
- `npm run test:light` — Syntax + unit + light smoke + P0-P2 e2e + a11y.
- `npm run test:heavy` — Syntax + unit + heavy smoke + all e2e + a11y.

---

## Environment & Secrets

Configuration is in `.env` (ignored by `.gitignore`). Use `.env.example` as a template.

### Supabase (Cloud Storage)
- `SUPABASE_URL` — Project URL
- `SUPABASE_ANON_KEY` — Anon/public key (used in browser auth)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side key (keep private; used by API)
- `SUPABASE_DB_SCHEMA` — Database schema name (default: `public`)

**Important**: Service-role keys must never be exposed in client code or deployed to the browser. Always use the server to make service-role API calls.

### Admin & Auth
- `BST_ADMIN_TOKEN` — Token required by write endpoints in production (checked as `x-bst-admin-token` or `Authorization: Bearer ...` header).
- `BST_REQUIRE_ADMIN_ON_LOOPBACK` — If `1`, enforce admin token even on localhost (default: production mode only).
- `SUPABASE_ALLOWED_EMAILS`, `SUPABASE_ALLOWED_ROLES` — CSV lists of allowed email/role patterns for Supabase auth.
- `SUPABASE_ADMIN_EMAILS`, `SUPABASE_ADMIN_ROLES` — CSV lists of admin email/role patterns.

### Email (Optional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Nodemailer config for signup notifications.
- `BST_BOOTSTRAP_ADMIN_EMAIL`, `BST_BOOTSTRAP_ADMIN_PASSWORD`, `BST_BOOTSTRAP_ADMIN_USERNAME` — Initial admin account (if no admins exist).

### Other
- `API_BIBLE_KEY` — API.Bible API key (optional; for scripture lookups).
- `PORT` — Server port (default: 3000).
- `NODE_ENV` — `production` or `development` (affects auth defaults).

---

## Data & Storage

### Supabase Tables (When Connected)
- `bst_classes` — Class records with JSONB `data` payload.
- `bst_lesson_plans` — Lesson plans with `class_ids` and `data` JSONB.
- `bst_notes` — Notes with JSONB `data`.
- `bst_app_data_history` — Append-only history/snapshots.
- `bst_vbs_scenes` — VBS control scenes (video, SFX, scripts, effects).
- `bst_signup_requests`, `bst_signup_invites`, `bst_user_profiles` — User management.

Schema: [scripts/supabase/schema.sql](scripts/supabase/schema.sql)

### Local JSON Fallback
When Supabase is not configured, data is read/written to JSON files in `data/`:
- `data/classes.json`
- `data/lessonplans.json`
- `data/notes.json`

**Note**: The README claims the server falls back gracefully when Supabase is unavailable. However, current API endpoints return `503` if Supabase is disconnected. This discrepancy should be verified if you need reliable local-only operation.

### API Routes (Write)
All write endpoints require admin token (if `BST_ADMIN_TOKEN` is set or on remote deployments).

**Cloud Updates** (full aggregate):
- `POST /api/data/classes` — Create class.
- `PUT /api/data/classes/:classId` — Update full class.
- `DELETE /api/data/classes/:classId` — Delete class.
- `POST /api/data/lessonPlans` — Create lesson plan.
- `PUT /api/data/lessonPlans/:planId` — Update full lesson plan.
- `DELETE /api/data/lessonPlans/:planId` — Delete lesson plan.
- `POST /api/data/notes` — Create note.
- `PUT /api/data/notes/:noteId` — Update full note.
- `DELETE /api/data/notes/:noteId` — Delete note.

**Partial Updates** (Supabase-backed only):
- `PUT /api/supabase/classes/:classId` — Partial class update.
- `DELETE /api/supabase/classes/:classId` — Delete class.
- `PUT /api/supabase/lessonPlans/:planId` — Partial lesson plan update.
- `DELETE /api/supabase/lessonPlans/:planId` — Delete lesson plan.
- `PUT /api/supabase/notes/:noteId` — Partial note update.
- `DELETE /api/supabase/notes/:noteId` — Delete note.

**VBS Control**:
- `POST /api/vbs/scenes` — Create VBS scene.
- `PUT /api/vbs/scenes/:id` — Update VBS scene.
- `DELETE /api/vbs/scenes/:id` — Delete VBS scene.
- `GET /api/vbs/events` — Server-Sent Events stream for live VBS control.

---

## Testing & CI

### Test Configuration
- **Vitest**: [vitest.config.js](vitest.config.js) — Unit tests in `tests/api/`.
- **Playwright**: [playwright.config.js](playwright.config.js) — E2E tests in `tests/e2e/`.
- **Smoke Tests**: [scripts/ci/api-smoke.js](scripts/ci/api-smoke.js) — Fast API endpoint checks.
- **Syntax Checks**: [scripts/ci/run-syntax-checks.js](scripts/ci/run-syntax-checks.js) — JavaScript/JSON linting.

### CI/CD Workflows
All workflows are in `.github/workflows/`.

- **Light CI** (`ci-light.yml`): Runs on every push and pull request.
  - Syntax checks, unit tests, light smoke, P0-P2 e2e, accessibility audit.
- **Heavy CI** (`ci-heavy.yml`): Manual trigger.
  - All tests (syntax, unit, heavy smoke, all e2e, accessibility).
- **Fly.io Deploy** (`fly-deploy.yml`): Runs on push to `main` or manual trigger.
  - Builds Docker image, deploys to Fly.io with `FLY_API_TOKEN`.

**Note**: Light CI smoke tests expect successful `/api/data` responses, but the server returns `503` when Supabase is disconnected and no token is provided. If you deploy without Supabase configured, these tests may fail.

### Docker & Deployment
- **Dockerfile**: Node.js 22, runs `npm start`.
- **fly.toml**: Fly.io configuration (port 3000, auto-scaling, volumes).

---

## Code Patterns & Conventions

### Frontend
- **Vanilla JavaScript**: No framework dependencies (other than TipTap for rich text editing).
- **Pages**: `index.html`, `teacher.html`, `student.html`, `editor.html`, `admin.html`, `auth.html`, plus VBS/dashboard variants.
- **CSS**: SCSS source in `assets/scss/`, compiled to `assets/css/`.
- **Static Assets**: Images, videos, audio in `assets/`.
- **Config**: [assets/js/config.js](assets/js/config.js) — Video IDs, pause points, feature flags.

### Backend
- **Express Middleware**: Auth tokens, CORS, rate limiting, request logging.
- **Database Helpers** ([db.js](db.js)): Supabase client, fallback logic, partial update helpers.
- **Error Handling**: Returns HTTP status + JSON error messages. Log errors to console and audit logs.

### Testing
- **Prefer narrow tests**: Test individual API routes and helper functions; avoid testing entire workflows unless required.
- **Playwright for real interactions**: Use e2e tests for user flows that span multiple pages or require session state.
- **Keep test data lean**: Use fixtures in `tests/` rather than full production dumps.

---

## Related Documentation

- [plan.agent.md](plan.agent.md) — Proposed feature roadmap (rich-text CMS/editor); separate from general project guidance.
- [docs/VBS_SCRIPT_GUIDE.md](docs/VBS_SCRIPT_GUIDE.md) — VBS script and SFX linking workflow.
- [scripts/supabase/schema.sql](scripts/supabase/schema.sql) — Database schema.
- [.env.example](.env.example) — Template for environment variables.

---

## Quick Checklist for New Sessions

1. **Environment**: Verify `.env` has `SUPABASE_URL` and keys, or accept local-JSON-only mode.
2. **Dependencies**: `npm install` to ensure all packages are ready.
3. **Styles**: If editing SCSS, run `npm run build:styles` or `npm run watch:styles`.
4. **Tests**: Run `npm run test:light` or targeted tests (`npm run test:unit`, `npm run test:e2e:p0`).
5. **Server**: `npm start` to run the dev server.
6. **Secrets**: Never commit `.env`; use `.env.example` as reference.

---

**Last Updated**: 2026-09-27
