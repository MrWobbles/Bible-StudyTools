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

## MongoDB Storage Model (v2)

When `MONGODB_URI` is configured, the server now stores cloud data in normalized collections:

- `classes`: one document per class
- `lessonPlans`: one document per lesson plan (with class references)
- `appDataHistory`: append-only snapshot records for version/history tracking

The legacy `appData` documents (`_id: "classes"` and `_id: "lessonPlans"`) are still supported for compatibility. If normalized collections are empty, the server auto-migrates legacy data on startup.

For partial cloud updates (without writing full aggregate documents), use:

- `PUT /api/mongo/classes/:classId`
- `DELETE /api/mongo/classes/:classId`
- `PUT /api/mongo/lessonPlans/:planId`
- `DELETE /api/mongo/lessonPlans/:planId`

These routes require admin access and return `503` when MongoDB is disconnected.

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
