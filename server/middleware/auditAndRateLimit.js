const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const {
  API_WRITE_METHODS,
  ENABLE_REMOTE_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  ENABLE_REQUEST_AUDIT,
  AUDIT_LOG_FILE
} = require('../config/env');
const { isLoopbackRequest, hasValidAdminToken } = require('../services/httpHelpers');

const REMOTE_RATE_LIMIT_BUCKETS = new Map();

function isApiWriteRequest(req) {
  return req.path.startsWith('/api/') && API_WRITE_METHODS.has(req.method);
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

module.exports = {
  remoteWriteRateLimit,
  requestAuditMiddleware
};
