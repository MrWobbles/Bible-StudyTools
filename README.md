# Bible Study Tools

An interactive Bible study presentation system with synchronized video playback and teacher controls.

## Download Desktop App

Download the standalone desktop application (no installation required):

- **Windows**: [Download for Windows](../../releases/latest) - Portable `.exe`
- **macOS**: [Download for Mac](../../releases/latest) - `.dmg` installer

Or run directly in your browser using the web version (see [Quick Start](#quick-start) below).

## Project Structure

```
Bible-StudyTools/
├── index.html              # Student/display view (show on TV/projector)
├── teacher.html            # Presenter control panel (keep on laptop)
├── assets/
│   ├── css/
│   │   ├── student.css     # Styles for student view
│   │   └── teacher.css     # Styles for teacher view
│   ├── js/
│   │   ├── config.js       # Video and pause point configuration
│   │   ├── student.js      # Student view functionality
│   │   └── teacher.js      # Teacher control panel functionality
│   ├── images/             # Store images here
│   └── video/              # Store video files here (if needed)
└── docs/
    ├── README.md           # Class-specific documentation
    ├── SERVE.md            # Server setup instructions
    └── serve.py            # Development server script
```

## Quick Start

1. **Configure your class**: Edit `assets/js/config.js` to set your video ID and pause points
2. **Open the display view**: Open `index.html` on your TV or projector
3. **Open the teacher view**: Open `teacher.html` on your laptop
4. **Control remotely**: Use the buttons in teacher view to control the display

## Creating New Classes

To create a new class:

1. Copy `index.html` and `teacher.html` (e.g., `index-class2.html`, `teacher-class2.html`)
2. Create a new config file (e.g., `assets/js/config-class2.js`)
3. Update the script src in both HTML files to reference your new config
4. Customize the content and pause points

The CSS and JS files are shared, making it easy to maintain consistent styling across all classes.

## Development

To run a local server for testing:

```bash
python docs/serve.py
```

Then open `http://localhost:8000` in your browser.

## Supabase Storage Model

When Supabase is configured, the server stores cloud data in normalized tables:

- `bst_classes`: one row per class (`data` JSONB payload)
- `bst_lesson_plans`: one row per lesson plan (`class_ids` + `data` JSONB)
- `bst_notes`: one row per note (`data` JSONB)
- `bst_app_data_history`: append-only history/snapshot records

Schema SQL is provided at `scripts/supabase/schema.sql`.

For partial cloud updates (without writing full aggregate documents), use:

- `PUT /api/supabase/classes/:classId`
- `DELETE /api/supabase/classes/:classId`
- `PUT /api/supabase/lessonPlans/:planId`
- `DELETE /api/supabase/lessonPlans/:planId`
- `PUT /api/supabase/notes/:noteId`
- `DELETE /api/supabase/notes/:noteId`

All partial cloud update routes use `/api/supabase/...`.

Authentication for protected routes supports:

- Supabase bearer session token (`Authorization: Bearer <access_token>`)
- Optional fallback `BST_ADMIN_TOKEN`

## API Hardening (Remote Deployments)

For non-localhost deployments, the server now includes security controls for write endpoints:

- **Auth**: set `BST_ADMIN_TOKEN` (or `ADMIN_TOKEN`) and send it as `x-bst-admin-token` or `Authorization: Bearer ...`
- **Optional local auth enforcement**: set `BST_REQUIRE_ADMIN_ON_LOOPBACK=1` to require tokens even on localhost
- **Rate limiting (remote writes)**: enabled by default; tune with `BST_RATE_LIMIT_WINDOW_MS` and `BST_RATE_LIMIT_MAX_REQUESTS`
- **CSRF strategy (remote writes)**: set `BST_ENFORCE_REMOTE_CSRF=1` and provide `BST_CSRF_TOKEN`; clients send `x-bst-csrf-token`
- **Origin allowlist**: optional `BST_TRUSTED_ORIGINS` as comma-separated origins (used with remote CSRF)
- **Request auditing**: enabled by default; logs API write requests to `logs/api-audit.log` (override with `BST_AUDIT_LOG_FILE`)

## Test Environment (Light + Heavy)

This project now uses a two-tier test strategy:

- **Light checks (automatic on every push/PR):** fast syntax + API smoke checks
- **Heavy checks (manual):** deeper save/backup/restore integrity checks, with optional desktop build validation

### Local commands

- `npm run check:syntax` - syntax validation for server + key frontend/backend scripts
- `npm run test:unit` - `Vitest` + `Supertest` integration tests
- `npm run test:e2e` - `Playwright` browser tests
- `npm run test:e2e:p0` - focused `Playwright` P0 regression suite (`*.p0.spec.js`)
- `npm run test:e2e:priority` - `Playwright` priority regression suite (`*.p0.spec.js` + `*.p1.spec.js` + `*.p2.spec.js`)
- `npm run test:smoke:light` - starts server and runs lightweight API checks
- `npm run test:smoke:heavy` - starts server and runs save/backup/restore integrity checks
- `npm run test:light` - syntax + unit + light smoke + priority browser checks (P0-P2)
- `npm run test:heavy` - syntax + unit + heavy smoke + priority browser checks (P0-P2) + full browser suite

### GitHub Actions workflows

- `.github/workflows/ci-light.yml` runs on push and pull_request
- `.github/workflows/ci-heavy.yml` is manual (`workflow_dispatch`) and runs the heavier API/browser suite with an optional desktop build check

### Recommended test split

- **Vitest + Supertest:** route validation, save/restore logic, error handling, non-destructive integration checks
- **Playwright:** admin/editor/teacher page load and broader end-to-end UI flows

## Features

- **Synchronized controls**: Control the display screen from your laptop
- **Planned pause points**: Automatically pause at predetermined timestamps
- **Rich text notes**: Keep presenter notes with formatting
- **Question prompts**: Store and manage discussion questions
- **Export/import**: Save and load your notes and questions

## Browser Compatibility

Works best in modern browsers with BroadcastChannel API support (Chrome, Firefox, Safari, Edge). Falls back to localStorage for cross-window communication if needed.

## Installation & Setup

### Prerequisites
- **Node.js** and **npm** (for running the local server and scripts)
- **Python** (for the dev server)
- **Ollama** (for AI-powered verse lookup and LLM features)

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd Bible-Study-Tools
```

### 2. Install Dependencies
```bash
npm install
```

### 3. (Optional) Set Up Python Dev Server
For local development and testing:
```bash
python docs/serve.py
```
Then open `http://localhost:8000` in your browser.

### 4. Set Up Ollama for AI Features
Ollama enables advanced Bible verse lookup by thought or topic.

#### a. Install Ollama
- Download and install from [https://ollama.com/download](https://ollama.com/download)
- Follow the instructions for your operating system

#### b. Start Ollama
```bash
ollama serve
```

#### c. Pull a Model
```bash
ollama pull llama3
```
(You can use other models; see `assets/js/llmService.js` for supported options.)

#### d. Verify Ollama is Running
- The app expects Ollama at `http://localhost:11434` (default)
- Test by visiting [http://localhost:11434](http://localhost:11434) in your browser

### 5. Set Up Supabase Database + Authentication

This app requires your own Supabase project for cloud storage and authentication.

#### a. Create a Supabase Project
- Go to [https://supabase.com](https://supabase.com) and create a project
- In **SQL Editor**, run `scripts/supabase/schema.sql` to create required tables
- For invite-only signup flow, ensure these tables also exist (or set custom names via env vars):
  - `bst_user_profiles` (username/email lookup)
  - `bst_signup_invites` (invite code validation)
  - `bst_signup_requests` (invite request submissions)
- In **Authentication**, enable the sign-in methods you want (Email/Password is used by default)

#### b. Configure Environment Variables
- Copy `.env.example` to `.env` and set:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Optional hardening:
  - `SUPABASE_ALLOWED_EMAILS` to allowlist emails
  - `SUPABASE_ALLOWED_ROLES` to allowlist roles
  - `SUPABASE_ADMIN_EMAILS` to restrict admin-only pages and approval actions
  - `SUPABASE_ADMIN_ROLES` to restrict admin-only pages and approval actions (defaults to `admin`)
  - `BST_ADMIN_TOKEN` as fallback token auth
- Optional auth/invite table overrides:
  - `SUPABASE_USER_PROFILES_TABLE`
  - `SUPABASE_SIGNUP_INVITES_TABLE`
  - `SUPABASE_SIGNUP_REQUESTS_TABLE`
- Optional first-admin bootstrap on startup:
  - `BST_BOOTSTRAP_ADMIN_EMAIL`
  - `BST_BOOTSTRAP_ADMIN_PASSWORD`
  - `BST_BOOTSTRAP_ADMIN_USERNAME`
- Optional signup request email notifications (to `shadowofthharvest@gmail.com`):
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`

#### c. Admin Approval Flow
- `admin.html` and `user-admin.html` are now admin-only routes
- The signup request approval page is at `/user-admin.html`
- Approving a request creates an invite code in `bst_signup_invites` and marks the request as `approved`
- To create the first admin automatically, set the `BST_BOOTSTRAP_ADMIN_*` variables and restart the server

#### d. Start the Node Server
- Start with `npm run dev` or `npm start`
- If Supabase variables are missing, the app still runs in local-file mode but cloud sync/partial cloud updates are unavailable

### 6. Start the App
- Open `index.html` (student view) and `teacher.html` (teacher view) in your browser
- For desktop app, download from the releases page and run the executable

### 7. Using AI Features
- Highlight a phrase in the editor, then use the "Verse Lookup by Thought" button or press `Alt+T`
- Select verses from the modal and click "Insert Selected"

### Troubleshooting
- If you see errors about connecting to Ollama, ensure the server is running and the model is pulled
- For more help, see the [Ollama documentation](https://ollama.com/docs)

---
