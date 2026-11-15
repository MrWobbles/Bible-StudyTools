const crypto = require('crypto');
const { isConnected } = require('../db');
const {
  ADMIN_TOKEN,
  AUTH_COOKIE_NAME,
  LOOPBACK_ADDRESSES
} = require('../config/env');

function areTokensEqual(inputToken, expectedToken) {
  const left = Buffer.from(String(inputToken || ''), 'utf8');
  const right = Buffer.from(String(expectedToken || ''), 'utf8');

  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function isLoopbackRequest(req) {
  const candidates = [req.ip, req.socket?.remoteAddress]
    .filter(Boolean)
    .map(value => String(value).trim());

  return candidates.some(value => LOOPBACK_ADDRESSES.has(value));
}

function getCookieValue(req, key) {
  const cookieHeader = String(req.get('cookie') || '');
  if (!cookieHeader) {
    return '';
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split('=');
    if (String(rawName || '').trim() !== key) {
      continue;
    }

    const joined = rest.join('=');
    try {
      return decodeURIComponent(joined).trim();
    } catch (err) {
      return String(joined || '').trim();
    }
  }

  return '';
}

function extractBearerToken(req) {
  const authHeader = String(req.get('authorization') || '');
  const headerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';

  if (headerToken) {
    return headerToken;
  }

  return getCookieValue(req, AUTH_COOKIE_NAME);
}

function hasValidAdminToken(req) {
  if (!ADMIN_TOKEN) {
    return false;
  }

  const bearerToken = extractBearerToken(req);
  const headerToken = String(req.get('x-bst-admin-token') || '').trim();

  return areTokensEqual(headerToken, ADMIN_TOKEN) || areTokensEqual(bearerToken, ADMIN_TOKEN);
}

function setAuthCookie(res, accessToken, expiresInSeconds = 3600) {
  const maxAgeMs = Math.max(60, Number.parseInt(String(expiresInSeconds || 3600), 10)) * 1000;
  res.cookie(AUTH_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeMs
  });
}

function clearAuthCookie(res) {
  res.cookie(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0)
  });
}

function getRequestOwnerUserId(req) {
  return String(req?.authUser?.id || '').trim() || null;
}

function getRequestOwnerOptions(req) {
  const ownerUserId = getRequestOwnerUserId(req);
  return ownerUserId ? { ownerUserId } : null;
}

function getPublicBaseUrl(req) {
  const configured = String(process.env.BST_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured;
  }

  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function getHttpStatus(err, fallbackStatus = 500) {
  return err?.status && Number.isInteger(err.status) ? err.status : fallbackStatus;
}

function sendApiError(res, err, fallbackMessage = 'Internal server error') {
  const status = getHttpStatus(err);
  const safeMessage = status >= 500 ? fallbackMessage : (err?.message || fallbackMessage);
  res.status(status).json({ error: safeMessage });
}

function requireSupabaseConnection(res) {
  if (!isConnected()) {
    res.status(503).json({
      error: 'Supabase is disconnected. Partial cloud updates are unavailable.',
      supabase: 'disconnected'
    });
    return false;
  }

  return true;
}

module.exports = {
  areTokensEqual,
  isLoopbackRequest,
  getCookieValue,
  extractBearerToken,
  hasValidAdminToken,
  setAuthCookie,
  clearAuthCookie,
  getRequestOwnerUserId,
  getRequestOwnerOptions,
  getPublicBaseUrl,
  getHttpStatus,
  sendApiError,
  requireSupabaseConnection
};
