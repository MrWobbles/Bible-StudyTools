const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_AUTH_ENABLED,
  SUPABASE_ALLOWED_EMAILS,
  SUPABASE_ALLOWED_ROLES,
  SUPABASE_ADMIN_EMAILS,
  SUPABASE_ADMIN_ROLES,
  USER_PROFILES_TABLE
} = require('../config/env');
const { supabaseServiceClient } = require('./supabaseClient');

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9._-]{3,30}$/.test(username);
}

function getSupabaseUserEmail(user) {
  return String(user?.email || '').trim().toLowerCase();
}

function getSupabaseUserRole(user) {
  return String(user?.app_metadata?.role || '').trim().toLowerCase();
}

function isSupabaseAdminUser(user) {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const email = getSupabaseUserEmail(user);
  const role = getSupabaseUserRole(user);

  if (SUPABASE_ADMIN_EMAILS.size > 0 && SUPABASE_ADMIN_EMAILS.has(email)) {
    return true;
  }

  if (SUPABASE_ADMIN_ROLES.size > 0 && SUPABASE_ADMIN_ROLES.has(role)) {
    return true;
  }

  return false;
}

function toPublicAuthUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    role: getSupabaseUserRole(user) || null,
    isAdmin: isSupabaseAdminUser(user)
  };
}

function isSupabaseUserAuthorized(user) {
  if (!user || typeof user !== 'object') {
    return false;
  }

  if (isSupabaseAdminUser(user)) {
    return true;
  }

  if (SUPABASE_ALLOWED_EMAILS.size === 0 && SUPABASE_ALLOWED_ROLES.size === 0) {
    return true;
  }

  const email = getSupabaseUserEmail(user);
  const role = getSupabaseUserRole(user);

  if (SUPABASE_ALLOWED_EMAILS.size > 0 && SUPABASE_ALLOWED_EMAILS.has(email)) {
    return true;
  }

  if (SUPABASE_ALLOWED_ROLES.size > 0 && SUPABASE_ALLOWED_ROLES.has(role)) {
    return true;
  }

  return false;
}

function getSupabaseUserProviders(user) {
  const providers = new Set();
  const primary = String(user?.app_metadata?.provider || '').trim().toLowerCase();
  if (primary) providers.add(primary);
  const list = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
  list.forEach((p) => providers.add(String(p || '').trim().toLowerCase()));
  return providers;
}

// Accounts with no email/password identity were self-created through an OAuth provider
// and must be explicitly approved (existing profile, admin, or allow-listed email).
async function isOAuthOnlyUserApproved(user) {
  if (isSupabaseAdminUser(user)) {
    return true;
  }

  if (SUPABASE_ALLOWED_EMAILS.has(getSupabaseUserEmail(user))) {
    return true;
  }

  if (!supabaseServiceClient) {
    return false;
  }

  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id')
    .eq('user_id', String(user.id || ''))
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

async function getSupabaseUserFromToken(accessToken, options = {}) {
  if (!SUPABASE_AUTH_ENABLED || !accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const user = await response.json();
    if (!isSupabaseUserAuthorized(user)) {
      return null;
    }

    if (!getSupabaseUserProviders(user).has('email') && !(await isOAuthOnlyUserApproved(user))) {
      return null;
    }

    if (options.requireAdmin && !isSupabaseAdminUser(user)) {
      return null;
    }

    return user;
  } catch (err) {
    return null;
  }
}

async function resolveLoginEmail(identifier) {
  const normalized = String(identifier || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.includes('@')) {
    return normalized.toLowerCase();
  }

  if (!supabaseServiceClient) {
    return '';
  }

  const username = normalizeUsername(normalized);
  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('email')
    .eq('username', username)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve username: ${error.message}`);
  }

  return String(data?.email || '').trim().toLowerCase();
}

module.exports = {
  normalizeUsername,
  isValidUsername,
  getSupabaseUserEmail,
  getSupabaseUserRole,
  isSupabaseAdminUser,
  toPublicAuthUser,
  isSupabaseUserAuthorized,
  getSupabaseUserProviders,
  isOAuthOnlyUserApproved,
  getSupabaseUserFromToken,
  resolveLoginEmail
};
