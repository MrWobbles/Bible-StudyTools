const {
  ADMIN_TOKEN,
  SUPABASE_AUTH_ENABLED,
  REQUIRE_ADMIN_ON_LOOPBACK
} = require('../config/env');
const {
  isLoopbackRequest,
  hasValidAdminToken,
  extractBearerToken,
  clearAuthCookie
} = require('../services/httpHelpers');
const { getSupabaseUserFromToken } = require('../services/supabaseAuth');

async function requireAuthenticatedPage(req, res, next) {
  if (!SUPABASE_AUTH_ENABLED) {
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    const redirect = encodeURIComponent(req.originalUrl || '/admin.html');
    return res.redirect(`/auth.html?redirect=${redirect}`);
  }

  const user = await getSupabaseUserFromToken(token);
  if (!user) {
    clearAuthCookie(res);
    const redirect = encodeURIComponent(req.originalUrl || '/admin.html');
    return res.redirect(`/auth.html?redirect=${redirect}`);
  }

  req.authUser = user;
  return next();
}

async function requireAdminPage(req, res, next) {
  if (!SUPABASE_AUTH_ENABLED) {
    return next();
  }

  const token = extractBearerToken(req);
  if (!token) {
    const redirect = encodeURIComponent(req.originalUrl || '/admin.html');
    return res.redirect(`/auth.html?redirect=${redirect}`);
  }

  const user = await getSupabaseUserFromToken(token, { requireAdmin: true });
  if (!user) {
    clearAuthCookie(res);
    const redirect = encodeURIComponent(req.originalUrl || '/admin.html');
    return res.redirect(`/auth.html?redirect=${redirect}`);
  }

  req.authUser = user;
  return next();
}

async function requireAdminAccess(req, res, next) {
  const isLoopback = isLoopbackRequest(req);
  if (isLoopback && !REQUIRE_ADMIN_ON_LOOPBACK) {
    return next();
  }

  if (hasValidAdminToken(req)) {
    return next();
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const user = await getSupabaseUserFromToken(bearerToken, { requireAdmin: true });
    if (user) {
      req.authUser = user;
      return next();
    }
  }

  if (!ADMIN_TOKEN && !SUPABASE_AUTH_ENABLED) {
    return res.status(403).json({
      error: 'Remote write access is disabled. Configure Supabase auth or set BST_ADMIN_TOKEN.'
    });
  }

  return res.status(401).json({
    error: SUPABASE_AUTH_ENABLED
      ? 'Authentication required. Sign in with Supabase or provide a valid admin token.'
      : 'Admin token required'
  });
}

async function requireAuthenticatedAccess(req, res, next) {
  const isLoopback = isLoopbackRequest(req);
  if (hasValidAdminToken(req)) {
    return next();
  }

  if (!SUPABASE_AUTH_ENABLED) {
    if (isLoopback && !REQUIRE_ADMIN_ON_LOOPBACK) {
      return next();
    }

    if (!ADMIN_TOKEN) {
      return res.status(403).json({
        error: 'Protected API access is disabled. Configure Supabase auth or set BST_ADMIN_TOKEN.'
      });
    }

    return res.status(401).json({ error: 'Admin token required' });
  }

  if (isLoopback && !REQUIRE_ADMIN_ON_LOOPBACK) {
    return next();
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const user = await getSupabaseUserFromToken(bearerToken);
    if (user) {
      req.authUser = user;
      return next();
    }
  }

  return res.status(401).json({ error: 'Authentication required.' });
}

module.exports = {
  requireAuthenticatedPage,
  requireAdminPage,
  requireAdminAccess,
  requireAuthenticatedAccess
};
