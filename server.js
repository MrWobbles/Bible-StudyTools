#!/usr/bin/env node
/**
 * Bible Study Tools - Web Server with API
 * Serves static files and provides API endpoints for saving JSON data and downloading videos
 */

require('dotenv').config();

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const ytdl = require('ytdl-core');
const { z } = require('zod');
const {
  connectDB,
  isConnected,
  loadDoc,
  saveDoc,
  upsertClassRecord,
  deleteClassRecord,
  upsertLessonPlanRecord,
  deleteLessonPlanRecord,
  closeDB
} = require('./db');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = (process.env.BST_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
const SHOULD_AUTO_OPEN_BROWSER = process.env.BST_DISABLE_BROWSER_OPEN !== '1';

app.disable('x-powered-by');

const LESSON_PLANS_SEGMENT = 'lessonPlans';
const LEGACY_LESSON_PLANS_SEGMENT = 'lessonplans';
const API_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUIRE_ADMIN_ON_LOOPBACK = parseBooleanLike(process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK);
const ENFORCE_REMOTE_CSRF = parseBooleanLike(process.env.BST_ENFORCE_REMOTE_CSRF);
const REMOTE_CSRF_TOKEN = String(process.env.BST_CSRF_TOKEN || '').trim();
const TRUSTED_REMOTE_ORIGINS = new Set(
  String(process.env.BST_TRUSTED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const ENABLE_REMOTE_RATE_LIMIT = parseBooleanLike(process.env.BST_ENABLE_REMOTE_RATE_LIMIT || '1');
const RATE_LIMIT_WINDOW_MS = getBoundedPositiveInt(process.env.BST_RATE_LIMIT_WINDOW_MS, 60000, 3600000);
const RATE_LIMIT_MAX_REQUESTS = getBoundedPositiveInt(process.env.BST_RATE_LIMIT_MAX_REQUESTS, 120, 5000);
const ENABLE_REQUEST_AUDIT = parseBooleanLike(process.env.BST_ENABLE_REQUEST_AUDIT || '1');
const AUDIT_LOG_FILE = process.env.BST_AUDIT_LOG_FILE
  ? path.resolve(process.env.BST_AUDIT_LOG_FILE)
  : path.join(__dirname, 'logs', 'api-audit.log');
const MAX_CLASSES_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_CLASSES_PER_PAYLOAD, 500, 5000);
const MAX_LESSON_PLANS_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_LESSON_PLANS_PER_PAYLOAD, 500, 5000);
const MAX_ITEMS_PER_CLASS_OUTLINE = getBoundedPositiveInt(process.env.BST_MAX_CLASS_OUTLINE_ITEMS, 2000, 10000);
const MAX_ITEMS_PER_CLASS_MEDIA = getBoundedPositiveInt(process.env.BST_MAX_CLASS_MEDIA_ITEMS, 1000, 10000);
const MAX_CLASSES_PER_LESSON_PLAN = getBoundedPositiveInt(process.env.BST_MAX_CLASSES_PER_LESSON_PLAN, 300, 2000);
const REMOTE_RATE_LIMIT_BUCKETS = new Map();

const baseStringSchema = z.string().trim();
const boundedIdSchema = baseStringSchema.min(1).max(120);
const boundedTitleSchema = baseStringSchema.min(1).max(240);

const classRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  classId: boundedIdSchema.optional(),
  classNumber: z.union([
    baseStringSchema.min(1).max(40),
    z.number().int().min(0).max(100000)
  ]).optional(),
  title: boundedTitleSchema.optional(),
  outline: z.array(z.any()).max(MAX_ITEMS_PER_CLASS_OUTLINE).optional(),
  media: z.array(z.any()).max(MAX_ITEMS_PER_CLASS_MEDIA).optional()
}).passthrough();

const lessonPlanRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  planId: boundedIdSchema.optional(),
  title: boundedTitleSchema.optional(),
  classes: z.array(boundedIdSchema).max(MAX_CLASSES_PER_LESSON_PLAN).optional()
}).passthrough();

const classesSaveSchema = z.object({
  classes: z.array(classRecordSchema).max(MAX_CLASSES_PER_PAYLOAD)
}).passthrough();

const lessonPlansSaveSchema = z.object({
  lessonPlans: z.array(lessonPlanRecordSchema).max(MAX_LESSON_PLANS_PER_PAYLOAD)
}).passthrough();

// Middleware - JSON parsing first
// classes.json can exceed the default 100kb when outlines/content are expanded
app.use(express.json({ limit: '10mb' }));
app.use(requestAuditMiddleware);
app.use(remoteWriteRateLimit);
app.use(enforceRemoteCsrf);

// Data directory
const DATA_DIR = process.env.BST_DATA_DIR
  ? path.resolve(process.env.BST_DATA_DIR)
  : path.join(__dirname, 'assets', 'data');
const VIDEO_DIR = process.env.BST_VIDEO_DIR
  ? path.resolve(process.env.BST_VIDEO_DIR)
  : path.join(__dirname, 'assets', 'video');
const BACKUP_DIR = process.env.BST_BACKUP_DIR
  ? path.resolve(process.env.BST_BACKUP_DIR)
  : path.join(__dirname, 'backups');
const BACKUP_FILE_PATTERN = /^(classes|lessonPlans)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3}Z)?\.json$/;
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const DATA_FILE_MAP = {
  classes: 'classes.json',
  lessonplans: 'lessonPlans.json'
};
const PUBLIC_HTML_FILES = ['index.html', 'admin.html', 'editor.html', 'student.html', 'teacher.html'];
const PUBLIC_ASSET_DIRS = ['css', 'js', 'images', 'audio', 'video', 'documents'];

// Backup settings
const MAX_BACKUPS_PER_FILE = 50; // Keep last 50 backups per file
const BACKUP_THROTTLE_MS = 60000; // Don't create backups more than once per minute for same file

// Track last backup time per file to avoid excessive backups
const lastBackupTime = {};
const fileWriteLocks = new Map();
let serverInstance = null;
let shutdownHandlersRegistered = false;

function isPathInsideDirectory(rootDir, targetPath) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(targetPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveDataFilePath(fileKey) {
  const normalizedKey = String(fileKey || '').toLowerCase();
  const fileName = DATA_FILE_MAP[normalizedKey];
  if (!fileName) {
    const error = new Error('Invalid file name. Use "classes" or "lessonPlans"');
    error.status = 400;
    throw error;
  }

  const resolvedPath = path.resolve(DATA_DIR, fileName);
  if (!isPathInsideDirectory(DATA_DIR, resolvedPath)) {
    const error = new Error('Resolved data path is outside the data directory');
    error.status = 400;
    throw error;
  }

  return { fileName, resolvedPath };
}

function resolveBackupPathOrThrow(candidate) {
  const normalizedName = typeof candidate === 'string' ? candidate.trim() : '';

  if (!normalizedName) {
    const error = new Error('backupFileName is required');
    error.status = 400;
    throw error;
  }

  if (path.basename(normalizedName) !== normalizedName) {
    const error = new Error('Backup file name must be a base name only');
    error.status = 400;
    throw error;
  }

  if (!BACKUP_FILE_PATTERN.test(normalizedName)) {
    const error = new Error('Invalid backup file name format');
    error.status = 400;
    throw error;
  }

  const resolvedPath = path.resolve(BACKUP_DIR, normalizedName);
  if (!isPathInsideDirectory(BACKUP_DIR, resolvedPath)) {
    const error = new Error('Resolved backup path is outside the backup directory');
    error.status = 400;
    throw error;
  }

  return { backupFileName: normalizedName, backupPath: resolvedPath };
}

function isLoopbackRequest(req) {
  const candidates = [req.ip, req.socket?.remoteAddress]
    .filter(Boolean)
    .map(value => String(value).trim());

  return candidates.some(value => LOOPBACK_ADDRESSES.has(value));
}

function hasValidAdminToken(req) {
  if (!ADMIN_TOKEN) {
    return false;
  }

  const authHeader = String(req.get('authorization') || '');
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const headerToken = String(req.get('x-bst-admin-token') || '').trim();

  return areTokensEqual(headerToken, ADMIN_TOKEN) || areTokensEqual(bearerToken, ADMIN_TOKEN);
}

function requireAdminAccess(req, res, next) {
  const isLoopback = isLoopbackRequest(req);
  if (isLoopback && !REQUIRE_ADMIN_ON_LOOPBACK) {
    return next();
  }

  if (!ADMIN_TOKEN) {
    return res.status(403).json({
      error: 'Remote write access is disabled. Set BST_ADMIN_TOKEN to allow authenticated remote administration.'
    });
  }

  if (!hasValidAdminToken(req)) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  return next();
}

function isApiWriteRequest(req) {
  return req.path.startsWith('/api/') && API_WRITE_METHODS.has(req.method);
}

function areTokensEqual(inputToken, expectedToken) {
  const left = Buffer.from(String(inputToken || ''), 'utf8');
  const right = Buffer.from(String(expectedToken || ''), 'utf8');

  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function getBoundedPositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maxValue);
}

function issuePathToString(issuePath) {
  if (!Array.isArray(issuePath) || issuePath.length === 0) {
    return 'root';
  }

  return issuePath
    .map((part) => (typeof part === 'number' ? `[${part}]` : String(part)))
    .join('.');
}

function formatZodIssues(error, maxIssues = 8) {
  if (!error?.issues || !Array.isArray(error.issues)) {
    return [];
  }

  return error.issues.slice(0, maxIssues).map((issue) => ({
    path: issuePathToString(issue.path),
    message: issue.message
  }));
}

function parseBodyWithSchema(schema, payload, errorMessage) {
  const result = schema.safeParse(payload);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    status: 400,
    error: errorMessage,
    details: formatZodIssues(result.error)
  };
}

function isLegacyLessonPlansPath(reqPath) {
  return String(reqPath || '').toLowerCase().includes(`/${LEGACY_LESSON_PLANS_SEGMENT}`);
}

function markLegacyLessonPlansRoute(req, res, next) {
  if (isLegacyLessonPlansPath(req.path)) {
    const successorPath = req.path.replace(`/${LEGACY_LESSON_PLANS_SEGMENT}`, `/${LESSON_PLANS_SEGMENT}`);
    res.set('Deprecation', 'true');
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
  }
  next();
}

function getRemoteRateLimitKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  return `${ip}|${req.method}|${req.path}`;
}

function remoteWriteRateLimit(req, res, next) {
  if (!ENABLE_REMOTE_RATE_LIMIT || !isApiWriteRequest(req) || isLoopbackRequest(req)) {
    return next();
  }

  const now = Date.now();
  const key = getRemoteRateLimitKey(req);
  const entry = REMOTE_RATE_LIMIT_BUCKETS.get(key);

  if (!entry || now > entry.resetAt) {
    REMOTE_RATE_LIMIT_BUCKETS.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    });
    return next();
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Rate limit exceeded for remote write requests. Try again later.',
      retryAfterSeconds
    });
  }

  return next();
}

function enforceRemoteCsrf(req, res, next) {
  if (!isApiWriteRequest(req) || isLoopbackRequest(req) || !ENFORCE_REMOTE_CSRF) {
    return next();
  }

  if (!REMOTE_CSRF_TOKEN) {
    return res.status(500).json({
      error: 'Remote CSRF protection is enabled but BST_CSRF_TOKEN is not configured.'
    });
  }

  const providedToken = String(req.get('x-bst-csrf-token') || req.get('x-csrf-token') || '').trim();
  if (!areTokensEqual(providedToken, REMOTE_CSRF_TOKEN)) {
    return res.status(403).json({ error: 'CSRF token required for remote write requests' });
  }

  const origin = String(req.get('origin') || '').trim();
  if (TRUSTED_REMOTE_ORIGINS.size > 0 && origin && !TRUSTED_REMOTE_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Request origin is not trusted' });
  }

  return next();
}

async function appendAuditLog(entry) {
  if (!ENABLE_REQUEST_AUDIT) {
    return;
  }

  try {
    await fs.mkdir(path.dirname(AUDIT_LOG_FILE), { recursive: true });
    await fs.appendFile(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    console.warn('[Audit] Failed to append request audit log:', err.message);
  }
}

function requestAuditMiddleware(req, res, next) {
  if (!isApiWriteRequest(req)) {
    return next();
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  res.set('x-request-id', requestId);

  res.on('finish', () => {
    const authMode = isLoopbackRequest(req)
      ? 'loopback'
      : (hasValidAdminToken(req) ? 'token' : 'none');

    void appendAuditLog({
      requestId,
      at: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: String(req.ip || req.socket?.remoteAddress || ''),
      userAgent: String(req.get('user-agent') || ''),
      authMode
    });
  });

  return next();
}

async function readDataDocument(fileKey) {
  const { resolvedPath } = resolveDataFilePath(fileKey);
  const content = await fs.readFile(resolvedPath, 'utf8');
  return JSON.parse(content);
}

function getHttpStatus(err, fallbackStatus = 500) {
  return err?.status && Number.isInteger(err.status) ? err.status : fallbackStatus;
}

function sendApiError(res, err, fallbackMessage = 'Internal server error') {
  const status = getHttpStatus(err);
  const safeMessage = status >= 500 ? fallbackMessage : (err?.message || fallbackMessage);
  res.status(status).json({ error: safeMessage });
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function shouldSkipCloudSync(req) {
  const queryValue = req.query?.skipCloudSync;
  const headerValue = req.get('x-bst-skip-cloud-sync');
  return parseBooleanLike(queryValue) || parseBooleanLike(headerValue);
}

function requireMongoConnection(res) {
  if (!isConnected()) {
    res.status(503).json({
      error: 'MongoDB is disconnected. Partial cloud updates are unavailable.',
      mongodb: 'disconnected'
    });
    return false;
  }

  return true;
}

function areDocumentsEqual(firstDoc, secondDoc) {
  return JSON.stringify(firstDoc) === JSON.stringify(secondDoc);
}

function withFileLock(lockKey, work) {
  const previous = fileWriteLocks.get(lockKey) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(work);

  fileWriteLocks.set(lockKey, current);
  return current.finally(() => {
    if (fileWriteLocks.get(lockKey) === current) {
      fileWriteLocks.delete(lockKey);
    }
  });
}

async function writeJsonFileAtomic(targetPath, data) {
  const payload = JSON.stringify(data, null, 2);
  const dirPath = path.dirname(targetPath);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;

  await fs.mkdir(dirPath, { recursive: true });

  try {
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, targetPath);
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch (cleanupErr) {
      // temp file may not exist; ignore cleanup errors
    }
    throw err;
  }
}

async function syncDocumentToMongo(docId, data) {
  if (!isConnected()) {
    return {
      ok: false,
      state: 'disconnected',
      message: 'Saved locally, but cloud sync is unavailable because MongoDB is disconnected.'
    };
  }

  try {
    const synced = await saveDoc(docId, data);
    if (synced) {
      return {
        ok: true,
        state: 'synced',
        message: 'Saved locally and synced to cloud.'
      };
    }

    return {
      ok: false,
      state: 'failed',
      message: 'Saved locally, but cloud sync failed. Check MongoDB connectivity and logs.'
    };
  } catch (err) {
    return {
      ok: false,
      state: 'failed',
      message: 'Saved locally, but cloud sync failed. Check MongoDB connectivity and logs.'
    };
  }
}

// ===== BACKUP FUNCTIONS =====

/**
 * Create a backup of a file before saving
 */
async function createBackup(fileName, data) {
  try {
    // Ensure backup directory exists
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Check throttle - don't backup if we just did one
    const now = Date.now();
    const lastTime = lastBackupTime[fileName] || 0;
    if (now - lastTime < BACKUP_THROTTLE_MS) {
      console.log(`[!] Backup throttled for ${fileName} (last backup ${Math.round((now - lastTime) / 1000)}s ago)`);
      return null;
    }

    // Create timestamp-based backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${path.basename(fileName, '.json')}_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Write backup atomically
    await writeJsonFileAtomic(backupPath, data);
    lastBackupTime[fileName] = now;
    console.log(`[✓] Backup created: ${backupFileName}`);

    // Clean old backups
    await cleanOldBackups(fileName);

    return backupFileName;
  } catch (err) {
    console.error('Error creating backup:', err);
    return null;
  }
}

/**
 * Clean old backups, keeping only the most recent ones
 */
async function cleanOldBackups(fileName) {
  try {
    const baseName = path.basename(fileName, '.json');
    const files = await fs.readdir(BACKUP_DIR);

    // Filter backups for this file
    const backups = files
      .filter(f => f.startsWith(baseName + '_') && f.endsWith('.json'))
      .sort()
      .reverse(); // Newest first (ISO timestamp sorts correctly)

    // Remove old backups beyond the limit
    if (backups.length > MAX_BACKUPS_PER_FILE) {
      const toDelete = backups.slice(MAX_BACKUPS_PER_FILE);
      for (const file of toDelete) {
        await fs.unlink(path.join(BACKUP_DIR, file));
        console.log(`[✓] Deleted old backup: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error cleaning old backups:', err);
  }
}

/**
 * List all backups for a specific file
 */
async function listBackups(fileName) {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const baseName = path.basename(fileName, '.json');
    const files = await fs.readdir(BACKUP_DIR);

    const backups = files
      .filter(f => f.startsWith(baseName + '_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        // Parse timestamp from filename
        const match = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
        const timestamp = match ? match[1].replace(/-/g, (m, i) => i > 9 ? ':' : '-').replace('T', ' ') : 'Unknown';
        return {
          fileName: f,
          timestamp,
          displayName: timestamp.replace('T', ' ').substring(0, 19)
        };
      });

    return backups;
  } catch (err) {
    console.error('Error listing backups:', err);
    return [];
  }
}

// ===== API ENDPOINTS =====

app.get('/api/data/:fileName', async (req, res) => {
  try {
    const data = await readDataDocument(req.params.fileName);
    res.json(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Data file not found' });
    }
    sendApiError(res, err, 'Failed to load data file');
  }
});

/**
 * POST /api/save/classes
 * Save classes.json with automatic backup
 */
app.post('/api/save/classes', requireAdminAccess, async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'classes.json');
    const parsed = parseBodyWithSchema(
      classesSaveSchema,
      req.body,
      'Invalid classes payload'
    );
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        error: parsed.error,
        details: parsed.details
      });
    }

    const data = parsed.data;
    const skipCloudSync = shouldSkipCloudSync(req);

    const { backupFile, cloudSync } = await withFileLock('classes.json', async () => {
      let backupFileName = null;

      try {
        const currentContent = await fs.readFile(filePath, 'utf8');
        const currentData = JSON.parse(currentContent);
        backupFileName = await createBackup('classes.json', currentData);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('[Backup] Could not capture pre-save classes.json backup:', err.message);
        }
      }

      await writeJsonFileAtomic(filePath, data);
      console.log('[✓] Saved classes.json (atomic write)');

      const syncResult = skipCloudSync
        ? {
          ok: true,
          state: 'skipped',
          message: 'Cloud sync skipped by request flag.'
        }
        : await syncDocumentToMongo('classes', data);
      return { backupFile: backupFileName, cloudSync: syncResult };
    });

    const response = {
      success: true,
      message: 'Classes saved successfully',
      backup: backupFile,
      mongoSync: cloudSync.ok,
      cloudSync
    };

    if (!cloudSync.ok) {
      response.partialSuccess = true;
      response.warning = cloudSync.message;
    }

    res.json(response);
  } catch (err) {
    console.error('Error saving classes:', err);
    sendApiError(res, err, 'Failed to save classes');
  }
});

/**
 * POST /api/save/lessonPlans
 * Save lessonPlans.json with automatic backup
 */
app.post([
  `/api/save/${LESSON_PLANS_SEGMENT}`,
  `/api/save/${LEGACY_LESSON_PLANS_SEGMENT}`
], markLegacyLessonPlansRoute, requireAdminAccess, async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'lessonPlans.json');
    const parsed = parseBodyWithSchema(
      lessonPlansSaveSchema,
      req.body,
      'Invalid lesson plans payload'
    );
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        error: parsed.error,
        details: parsed.details
      });
    }

    const data = parsed.data;
    const skipCloudSync = shouldSkipCloudSync(req);

    const { backupFile, cloudSync } = await withFileLock('lessonPlans.json', async () => {
      let backupFileName = null;

      try {
        const currentContent = await fs.readFile(filePath, 'utf8');
        const currentData = JSON.parse(currentContent);
        backupFileName = await createBackup('lessonPlans.json', currentData);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('[Backup] Could not capture pre-save lessonPlans.json backup:', err.message);
        }
      }

      await writeJsonFileAtomic(filePath, data);
      console.log('[✓] Saved lessonPlans.json (atomic write)');

      const syncResult = skipCloudSync
        ? {
          ok: true,
          state: 'skipped',
          message: 'Cloud sync skipped by request flag.'
        }
        : await syncDocumentToMongo('lessonPlans', data);
      return { backupFile: backupFileName, cloudSync: syncResult };
    });

    const response = {
      success: true,
      message: 'Lesson plans saved successfully',
      backup: backupFile,
      mongoSync: cloudSync.ok,
      cloudSync
    };

    if (!cloudSync.ok) {
      response.partialSuccess = true;
      response.warning = cloudSync.message;
    }

    res.json(response);
  } catch (err) {
    console.error('Error saving lesson plans:', err);
    sendApiError(res, err, 'Failed to save lesson plans');
  }
});

/**
 * GET /api/backups/:fileName
 * List all backups for a specific file (classes or lessonPlans)
 */
app.get('/api/backups/:fileName', requireAdminAccess, async (req, res) => {
  try {
    const { fileName } = resolveDataFilePath(req.params.fileName);
    const backups = await listBackups(fileName);
    res.json({ success: true, backups });
  } catch (err) {
    console.error('Error listing backups:', err);
    sendApiError(res, err, 'Failed to list backups');
  }
});

/**
 * POST /api/backups/restore
 * Restore a specific backup
 * Body: { backupFileName: "classes_2026-02-28T10-30-00.json" }
 */
app.post('/api/backups/restore', requireAdminAccess, async (req, res) => {
  try {
    const { backupFileName, backupPath } = resolveBackupPathOrThrow(req.body?.backupFileName);

    // Check if backup exists
    try {
      await fs.stat(backupPath);
    } catch (err) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Read backup content
    const backupContent = await fs.readFile(backupPath, 'utf8');
    const backupData = JSON.parse(backupContent);

    // Determine target file
    const targetFileName = backupFileName.startsWith('classes') ? 'classes.json' : 'lessonPlans.json';
    const targetPath = path.join(DATA_DIR, targetFileName);
    const targetDocId = targetFileName === 'classes.json' ? 'classes' : 'lessonPlans';

    const cloudSync = await withFileLock(targetFileName, async () => {
      // Read current file and backup it before restoring
      try {
        const currentContent = await fs.readFile(targetPath, 'utf8');
        const currentData = JSON.parse(currentContent);
        await createBackup(targetFileName, currentData);
      } catch (err) {
        // Current file might not exist, that's ok
      }

      // Restore the backup atomically
      await writeJsonFileAtomic(targetPath, backupData);
      console.log(`[✓] Restored ${targetFileName} from ${backupFileName} (atomic write)`);

      // Re-sync Mongo immediately so local and remote do not drift after restore
      return syncDocumentToMongo(targetDocId, backupData);
    });

    const response = {
      success: true,
      message: `Restored ${targetFileName} from backup`,
      restoredFrom: backupFileName,
      mongoSync: cloudSync.ok,
      cloudSync
    };

    if (!cloudSync.ok) {
      response.partialSuccess = true;
      response.warning = cloudSync.message;
    }

    res.json(response);
  } catch (err) {
    console.error('Error restoring backup:', err);
    sendApiError(res, err, 'Failed to restore backup');
  }
});

/**
 * DELETE /api/backups/:backupFileName
 * Delete a specific backup
 */
app.delete('/api/backups/:backupFileName', requireAdminAccess, async (req, res) => {
  try {
    const { backupFileName, backupPath } = resolveBackupPathOrThrow(req.params.backupFileName);

    await fs.unlink(backupPath);
    console.log(`[✓] Deleted backup: ${backupFileName}`);

    res.json({ success: true, message: 'Backup deleted' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    console.error('Error deleting backup:', err);
    sendApiError(res, err, 'Failed to delete backup');
  }
});

/**
 * POST /api/backups/create
 * Manually create a backup of current data
 * Body: { fileName: "classes" or "lessonPlans" }
 */
app.post('/api/backups/create', requireAdminAccess, async (req, res) => {
  try {
    const { fileName: sourceFile, resolvedPath: sourcePath } = resolveDataFilePath(req.body?.fileName);

    // Read current data
    const content = await fs.readFile(sourcePath, 'utf8');
    const data = JSON.parse(content);

    // Force create backup (bypass throttle for manual backups)
    delete lastBackupTime[sourceFile];
    const backupFile = await createBackup(sourceFile, data);

    if (backupFile) {
      res.json({
        success: true,
        message: 'Backup created successfully',
        backupFileName: backupFile
      });
    } else {
      res.status(500).json({ error: 'Failed to create backup' });
    }
  } catch (err) {
    console.error('Error creating manual backup:', err);
    sendApiError(res, err, 'Failed to create backup');
  }
});

/**
 * GET /api/status
 * Health check endpoint
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is running',
    mongodb: isConnected() ? 'connected' : 'disconnected'
  });
});

/**
 * PUT /api/mongo/classes/:classId
 * Upsert a single class record directly in MongoDB normalized storage
 */
app.put('/api/mongo/classes/:classId', requireAdminAccess, async (req, res) => {
  try {
    if (!requireMongoConnection(res)) {
      return;
    }

    const classId = String(req.params.classId || '').trim();
    const classData = req.body?.class && typeof req.body.class === 'object' ? req.body.class : req.body;

    if (!classId || !classData || typeof classData !== 'object' || Array.isArray(classData)) {
      return res.status(400).json({ error: 'Invalid class payload' });
    }

    const saved = await upsertClassRecord(classId, classData, 'api-partial-upsert');
    if (!saved) {
      return res.status(400).json({ error: 'Unable to upsert class record' });
    }

    return res.json({
      success: true,
      message: 'Class upserted in MongoDB',
      classId,
      class: saved,
      mongodb: 'connected'
    });
  } catch (err) {
    console.error('Error upserting Mongo class:', err);
    sendApiError(res, err, 'Failed to upsert Mongo class');
  }
});

/**
 * DELETE /api/mongo/classes/:classId
 * Delete a single class record directly in MongoDB normalized storage
 */
app.delete('/api/mongo/classes/:classId', requireAdminAccess, async (req, res) => {
  try {
    if (!requireMongoConnection(res)) {
      return;
    }

    const classId = String(req.params.classId || '').trim();
    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    const deleted = await deleteClassRecord(classId, 'api-partial-delete');
    return res.json({
      success: true,
      message: deleted ? 'Class deleted from MongoDB' : 'Class not found in MongoDB',
      classId,
      deleted,
      mongodb: 'connected'
    });
  } catch (err) {
    console.error('Error deleting Mongo class:', err);
    sendApiError(res, err, 'Failed to delete Mongo class');
  }
});

/**
 * PUT /api/mongo/lessonPlans/:planId
 * Upsert a single lesson plan record directly in MongoDB normalized storage
 */
app.put([
  `/api/mongo/${LESSON_PLANS_SEGMENT}/:planId`,
  `/api/mongo/${LEGACY_LESSON_PLANS_SEGMENT}/:planId`
], markLegacyLessonPlansRoute, requireAdminAccess, async (req, res) => {
  try {
    if (!requireMongoConnection(res)) {
      return;
    }

    const planId = String(req.params.planId || '').trim();
    const lessonPlanData = req.body?.lessonPlan && typeof req.body.lessonPlan === 'object'
      ? req.body.lessonPlan
      : req.body;

    if (!planId || !lessonPlanData || typeof lessonPlanData !== 'object' || Array.isArray(lessonPlanData)) {
      return res.status(400).json({ error: 'Invalid lesson plan payload' });
    }

    const saved = await upsertLessonPlanRecord(planId, lessonPlanData, 'api-partial-upsert');
    if (!saved) {
      return res.status(400).json({ error: 'Unable to upsert lesson plan record' });
    }

    return res.json({
      success: true,
      message: 'Lesson plan upserted in MongoDB',
      planId,
      lessonPlan: saved,
      mongodb: 'connected'
    });
  } catch (err) {
    console.error('Error upserting Mongo lesson plan:', err);
    sendApiError(res, err, 'Failed to upsert Mongo lesson plan');
  }
});

/**
 * DELETE /api/mongo/lessonPlans/:planId
 * Delete a single lesson plan record directly in MongoDB normalized storage
 */
app.delete([
  `/api/mongo/${LESSON_PLANS_SEGMENT}/:planId`,
  `/api/mongo/${LEGACY_LESSON_PLANS_SEGMENT}/:planId`
], markLegacyLessonPlansRoute, requireAdminAccess, async (req, res) => {
  try {
    if (!requireMongoConnection(res)) {
      return;
    }

    const planId = String(req.params.planId || '').trim();
    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    const deleted = await deleteLessonPlanRecord(planId, 'api-partial-delete');
    return res.json({
      success: true,
      message: deleted ? 'Lesson plan deleted from MongoDB' : 'Lesson plan not found in MongoDB',
      planId,
      deleted,
      mongodb: 'connected'
    });
  } catch (err) {
    console.error('Error deleting Mongo lesson plan:', err);
    sendApiError(res, err, 'Failed to delete Mongo lesson plan');
  }
});

/**
 * POST /api/download/youtube
 * Download YouTube video
 * Body: { videoUrl: "https://www.youtube.com/watch?v=..." }
 */
app.post('/api/download/youtube', requireAdminAccess, async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    console.log('Download request for:', videoUrl);

    // Validate it's a YouTube URL
    if (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Extract video ID - handle both full URLs and just the ID
    let videoId = videoUrl;

    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      try {
        videoId = ytdl.getVideoID(videoUrl);
      } catch (err) {
        console.error('Error extracting video ID:', err.message);
        return res.status(400).json({ error: 'Could not extract video ID from URL' });
      }
    }

    console.log('Video ID:', videoId);

    const fileName = `${videoId}.mp4`;
    const filePath = path.join(VIDEO_DIR, fileName);

    // Create video directory if it doesn't exist
    try {
      await fs.mkdir(VIDEO_DIR, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }

    // Check if video already downloaded
    try {
      await fs.stat(filePath);
      console.log(`[✓] Video already exists: ${fileName}`);
      return res.json({
        success: true,
        message: 'Video already downloaded',
        fileName,
        localPath: `assets/video/${fileName}`,
      });
    } catch (err) {
      // File doesn't exist, proceed with download
    }

    console.log(`Downloading YouTube video: ${videoId}...`);

    // Construct full URL if just ID was provided
    const fullUrl = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
      ? videoUrl
      : `https://www.youtube.com/watch?v=${videoId}`;

    // Get video info
    let info;
    try {
      info = await ytdl.getInfo(fullUrl);
    } catch (err) {
      console.error('Failed to get video info:', err.message);
      return res.status(500).json({
        error: 'Could not retrieve video information. YouTube may have blocked the request. Try again later or download manually.',
      });
    }

    const duration = parseInt(info.videoDetails.lengthSeconds);

    // Download video
    const writeStream = require('fs').createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      ytdl(fullUrl, {
        quality: 'highest',
        filter: (format) => format.container === 'mp4',
      })
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log(`[✓] Downloaded: ${fileName}`);

    res.json({
      success: true,
      message: 'Video downloaded successfully',
      fileName,
      localPath: `assets/video/${fileName}`,
      duration,
    });
  } catch (err) {
    console.error('YouTube download error:', err);
    res.status(500).json({
      error: 'Failed to download video',
    });
  }
});

// ===== STATIC FILES (must be after API routes) =====
PUBLIC_ASSET_DIRS.forEach((dirName) => {
  app.use(`/assets/${dirName}`, express.static(path.join(__dirname, 'assets', dirName)));
});

PUBLIC_HTML_FILES.forEach((fileName) => {
  const routePaths = fileName === 'index.html' ? ['/', '/index.html'] : [`/${fileName}`];
  routePaths.forEach((routePath) => {
    app.get(routePath, (req, res) => {
      res.sendFile(path.join(__dirname, fileName));
    });
  });
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Server error:', err);

  // Body parser limits/format errors
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Try reducing content size or increase server limit.' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const status = getHttpStatus(err);
  const message = status >= 500 ? 'Internal server error' : (err?.message || 'Request failed');
  res.status(status).json({ error: message });
});

// ===== MONGODB SYNC HELPERS =====

/**
 * On startup, sync data between Atlas and local JSON files.
 * - If Atlas has data that is newer/different: overwrite the local file.
 * - If Atlas has no data for a doc: seed it from the local file.
 */
async function syncFromMongoDB() {
  const docs = [
    { docId: 'classes',     fileName: 'classes.json' },
    { docId: 'lessonPlans', fileName: 'lessonPlans.json' },
  ];

  for (const { docId, fileName } of docs) {
    const filePath = path.join(DATA_DIR, fileName);
    const mongoData = await loadDoc(docId);
    let localData = null;

    try {
      const localContent = await fs.readFile(filePath, 'utf8');
      localData = JSON.parse(localContent);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[MongoDB] Could not parse local "${docId}" file; skipping startup sync for this document.`);
        continue;
      }
    }

    if (mongoData) {
      if (!localData) {
        await writeJsonFileAtomic(filePath, mongoData);
        console.log(`[MongoDB] Synced "${docId}" Atlas → local file (local file missing)`);
        continue;
      }

      if (areDocumentsEqual(localData, mongoData)) {
        console.log(`[MongoDB] "${docId}" already in sync`);
        continue;
      }

      const pushed = await saveDoc(docId, localData);
      if (pushed) {
        console.warn(`[MongoDB] Conflict detected for "${docId}". Preserved local edits and updated Atlas from local file.`);
      } else {
        console.warn(`[MongoDB] Conflict detected for "${docId}". Preserved local edits, but failed to update Atlas.`);
      }
    } else {
      // Atlas has no doc yet — seed it from the local file
      if (localData) {
        const ok = await saveDoc(docId, localData);
        if (ok) console.log(`[MongoDB] Seeded "${docId}" local file → Atlas`);
      } else {
        console.log(`[MongoDB] No local file found for "${docId}"; skipping seed.`);
      }
    }
  }
}

// ===== START SERVER =====

async function initializeServerState() {
  // Ensure backup directory exists on startup
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }

  // Connect to MongoDB Atlas and sync data
  const mongoOk = await connectDB();
  if (mongoOk) {
    await syncFromMongoDB();
  }
}

function logServerStartup(port) {
  console.log(`
╔════════════════════════════════════════╗
║   Bible Study Tools - Web Server       ║
╚════════════════════════════════════════╝

Server running at: http://localhost:${port}
Static files: ./
Data saved to: ${DATA_DIR}
Backups saved to: ${BACKUP_DIR}

Open in browser:
  - Admin:   http://localhost:${port}/admin.html
  - Student: http://localhost:${port}/student.html
  - Teacher: http://localhost:${port}/teacher.html

API Endpoints:
  - POST /api/save/classes       - Save classes.json (auto-backup)
  - POST /api/save/lessonPlans   - Save lessonPlans.json (auto-backup)
  - GET  /api/backups/:fileName  - List backups (classes/lessonPlans)
  - POST /api/backups/restore    - Restore from backup
  - POST /api/backups/create     - Create manual backup
  - DELETE /api/backups/:file    - Delete a backup
  - GET  /api/status             - Health check
  - PUT  /api/mongo/classes/:id  - Upsert one class in MongoDB
  - DELETE /api/mongo/classes/:id - Delete one class in MongoDB
  - PUT  /api/mongo/lessonPlans/:id - Upsert one lesson plan in MongoDB
  - DELETE /api/mongo/lessonPlans/:id - Delete one lesson plan in MongoDB

Press Ctrl+C to stop
  `);
}

function maybeOpenBrowser(port) {
  if (!SHOULD_AUTO_OPEN_BROWSER) {
    return;
  }

  // Auto-open admin page in the default browser
  const adminUrl = `http://localhost:${port}/admin.html`;
  const openCmd = process.platform === 'win32'  ? `start "" "${adminUrl}"`
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
    const listener = app.listen(requestedPort, () => resolve(listener));
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

if (require.main === module) {
  startServer().catch(async (err) => {
    console.error('Failed to start server:', err);
    await closeDB();
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  stopServer,
  paths: {
    DATA_DIR,
    VIDEO_DIR,
    BACKUP_DIR
  }
};
