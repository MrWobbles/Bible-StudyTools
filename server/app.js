const express = require('express');
const { exec } = require('child_process');
const { connectDB, closeDB } = require('./db');
const {
  PORT,
  SHOULD_AUTO_OPEN_BROWSER,
  VIDEO_DIR
} = require('./config/env');
const {
  requestAuditMiddleware,
  remoteWriteRateLimit
} = require('./middleware/auditAndRateLimit');
const errorHandler = require('./middleware/errorHandler');
const { ensureBootstrapAdminAccount } = require('./services/supabaseUsers');

const editorRoutes = require('./routes/editor');
const dataRoutes = require('./routes/data');
const mediaProxyRoutes = require('./routes/mediaProxy');
const aiRoutes = require('./routes/ai');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const supabaseRecordsRoutes = require('./routes/supabaseRecords');
const uploadAndVideoRoutes = require('./routes/uploadAndVideo');
const vbsRoutes = require('./routes/vbs');
const displaySyncRoutes = require('./routes/displaySync');
const djRoutes = require('./routes/dj');
const staticPagesRoutes = require('./routes/staticPages');

const app = express();
app.disable('x-powered-by');

// Middleware - JSON parsing first
// classes.json can exceed the default 100kb when outlines/content are expanded
app.use(express.json({ limit: '10mb' }));
app.use(requestAuditMiddleware);
app.use(remoteWriteRateLimit);

// ===== API ENDPOINTS =====
app.use(editorRoutes);
app.use(dataRoutes);
app.use(mediaProxyRoutes);
app.use(aiRoutes);
app.use(authRoutes);
app.use(adminRoutes);
app.use(supabaseRecordsRoutes);
app.use(uploadAndVideoRoutes);
app.use(vbsRoutes);
app.use(displaySyncRoutes);
app.use(djRoutes);

// ===== STATIC FILES (must be after API routes) =====
app.use(staticPagesRoutes);

// ===== ERROR HANDLING =====
app.use(errorHandler);

// ===== START SERVER =====
let serverInstance = null;
let shutdownHandlersRegistered = false;

async function initializeServerState() {
  // Connect to Supabase and sync data
  await connectDB();
  await ensureBootstrapAdminAccount();
}

function logServerStartup(port) {
  console.log(`
╔════════════════════════════════════════╗
║   Bible Study Tools - Web Server       ║
╚════════════════════════════════════════╝

Server running at: http://localhost:${port}

Open in browser:
  - Admin:   http://localhost:${port}/admin.html
  - User Admin: http://localhost:${port}/user-admin.html
  - Student: http://localhost:${port}/student.html
  - Teacher: http://localhost:${port}/teacher.html

API Endpoints:
    - POST /api/save/classes       - Save classes to Supabase
    - POST /api/save/lessonPlans   - Save lesson plans to Supabase
    - POST /api/save/notes         - Save notes to Supabase
    - GET  /api/status             - Health check
  - PUT  /api/supabase/classes/:id  - Upsert one class in Supabase
  - DELETE /api/supabase/classes/:id - Delete one class in Supabase
  - PUT  /api/supabase/lessonPlans/:id - Upsert one lesson plan in Supabase
  - DELETE /api/supabase/lessonPlans/:id - Delete one lesson plan in Supabase
  - PUT  /api/supabase/notes/:id    - Upsert one note in Supabase
  - DELETE /api/supabase/notes/:id  - Delete one note in Supabase
  - POST /api/auth/login            - Supabase email/password login
  - POST /api/auth/refresh          - Refresh Supabase session
  - GET  /api/auth/me               - Get authenticated user
  - GET  /api/admin/signup-requests - List signup requests
  - GET  /api/admin/accounts - List active user accounts
  - POST /api/admin/signup-requests/:id/approve - Approve request and create invite
  - POST /api/admin/signup-requests/:id/reject - Reject signup request
  - POST /api/admin/accounts/reset-password - Reset account password
  - DELETE /api/admin/accounts/:identifier - Remove account by email or username

Press Ctrl+C to stop
  `);
}

function maybeOpenBrowser(port) {
  if (!SHOULD_AUTO_OPEN_BROWSER) {
    return;
  }

  // Auto-open admin page in the default browser
  const adminUrl = `http://localhost:${port}/admin.html`;
  const openCmd = process.platform === 'win32' ? `start "" "${adminUrl}"`
    : process.platform === 'darwin' ? `open "${adminUrl}"`
      : `xdg-open "${adminUrl}"`;
  exec(openCmd, err => {
    if (err) console.warn('[!] Could not auto-open browser:', err.message);
  });
}

function registerShutdownHandlers() {
  if (shutdownHandlersRegistered) {
    return;
  }

  shutdownHandlersRegistered = true;
  process.on('SIGINT', async () => {
    await stopServer();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopServer();
    process.exit(0);
  });
}

async function startServer(options = {}) {
  const requestedPort = options.port || PORT;
  const openBrowser = options.openBrowser ?? SHOULD_AUTO_OPEN_BROWSER;

  if (serverInstance) {
    return serverInstance;
  }

  await initializeServerState();

  serverInstance = await new Promise((resolve, reject) => {
    const listener = app.listen(requestedPort, '0.0.0.0', () => resolve(listener));
    listener.on('error', reject);
  });

  registerShutdownHandlers();
  logServerStartup(requestedPort);

  if (openBrowser) {
    maybeOpenBrowser(requestedPort);
  }

  return serverInstance;
}

async function stopServer() {
  if (serverInstance) {
    await new Promise((resolve, reject) => {
      serverInstance.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    serverInstance = null;
  }

  await closeDB();
}

module.exports = {
  app,
  startServer,
  stopServer,
  paths: {
    VIDEO_DIR
  }
};
