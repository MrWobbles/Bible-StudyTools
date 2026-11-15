const express = require('express');
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_AUTH_ENABLED,
  SUPABASE_SERVICE_ENABLED
} = require('../config/env');
const {
  extractBearerToken,
  setAuthCookie,
  clearAuthCookie,
  getPublicBaseUrl
} = require('../services/httpHelpers');
const {
  normalizeUsername,
  isValidUsername,
  toPublicAuthUser,
  getSupabaseUserFromToken,
  resolveLoginEmail
} = require('../services/supabaseAuth');
const {
  findInviteRecord,
  findExistingUserProfile,
  createSupabaseAuthUser,
  upsertUserProfileRecord,
  markInviteUsed,
  saveSignupRequestToDatabase,
  sendSignupRequestNotification
} = require('../services/supabaseAdmin');

const router = express.Router();

router.post('/api/auth/login', async (req, res) => {
  if (!SUPABASE_AUTH_ENABLED) {
    return res.status(503).json({ error: 'Supabase auth is not configured on this server.' });
  }

  const identifier = String(req.body?.identifier || req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }

  try {
    const email = await resolveLoginEmail(identifier);
    if (!email) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(401).json({ error: payload?.error_description || payload?.error || 'Login failed' });
    }

    const user = await getSupabaseUserFromToken(String(payload.access_token || ''));
    if (!user) {
      return res.status(403).json({ error: 'Authenticated user is not allowed to access this server.' });
    }

    setAuthCookie(res, String(payload.access_token || ''), payload.expires_in);

    return res.json({
      success: true,
      session: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        tokenType: payload.token_type,
        expiresIn: payload.expires_in,
        expiresAt: payload.expires_at,
        user: toPublicAuthUser(user)
      },
      defaultRedirect: '/admin.html'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to authenticate with Supabase.' });
  }
});

router.post('/api/auth/signup', async (req, res) => {
  if (!SUPABASE_AUTH_ENABLED || !SUPABASE_SERVICE_ENABLED) {
    return res.status(503).json({ error: 'Supabase signup is not configured on this server.' });
  }

  const username = normalizeUsername(req.body?.username);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const inviteCode = String(req.body?.inviteCode || '').trim();

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 chars using letters, numbers, dot, underscore, or dash.' });
  }

  if (!email || !password || !inviteCode) {
    return res.status(400).json({ error: 'username, email, password, and inviteCode are required.' });
  }

  try {
    const invite = await findInviteRecord(inviteCode);
    if (!invite) {
      return res.status(403).json({ error: 'Invitation code is invalid.' });
    }

    if (invite.used_at) {
      return res.status(403).json({ error: 'Invitation code has already been used.' });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: 'Invitation code has expired.' });
    }

    const inviteEmail = String(invite.email || '').trim().toLowerCase();
    if (inviteEmail && inviteEmail !== email) {
      return res.status(403).json({ error: 'Invitation code does not match this email address.' });
    }

    const existingProfile = await findExistingUserProfile(username, email);
    if (existingProfile) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const createUserPayload = await createSupabaseAuthUser({
      email,
      password,
      appMetadata: { role: 'teacher' },
      userMetadata: { username },
      emailConfirm: true
    });

    const userId = String(createUserPayload?.id || '').trim();
    if (!userId) {
      return res.status(500).json({ error: 'Supabase returned an invalid user record.' });
    }

    await upsertUserProfileRecord(userId, username, email);

    await markInviteUsed(inviteCode, userId);

    return res.json({
      success: true,
      message: 'Account created successfully. You can now sign in.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to sign up.' });
  }
});

router.post('/api/auth/signup-request', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 chars using letters, numbers, dot, underscore, or dash.' });
  }

  if (!email) {
    return res.status(400).json({ error: 'email is required.' });
  }

  try {
    const sourceIp = String(req.ip || req.socket?.remoteAddress || '').trim();
    const payload = {
      username,
      email,
      displayName,
      message,
      sourceIp
    };

    const row = await saveSignupRequestToDatabase(payload);
    const notification = await sendSignupRequestNotification(payload);

    return res.status(notification.sent ? 200 : 202).json({
      success: true,
      message: notification.sent
        ? 'Signup request submitted successfully.'
        : 'Signup request saved, but email notification is not configured.',
      requestId: row?.id || null,
      notificationSent: notification.sent
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to submit signup request.' });
  }
});

router.post('/api/auth/refresh', async (req, res) => {
  if (!SUPABASE_AUTH_ENABLED) {
    return res.status(503).json({ error: 'Supabase auth is not configured on this server.' });
  }

  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(401).json({ error: payload?.error_description || payload?.error || 'Token refresh failed' });
    }

    const user = await getSupabaseUserFromToken(String(payload.access_token || ''));
    if (!user) {
      return res.status(403).json({ error: 'Authenticated user is not allowed to access this server.' });
    }

    setAuthCookie(res, String(payload.access_token || ''), payload.expires_in);

    return res.json({
      success: true,
      session: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        tokenType: payload.token_type,
        expiresIn: payload.expires_in,
        expiresAt: payload.expires_at,
        user: toPublicAuthUser(user)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to refresh Supabase session.' });
  }
});

router.get('/api/auth/google', (req, res) => {
  if (!SUPABASE_AUTH_ENABLED) {
    return res.status(503).json({ error: 'Supabase auth is not configured on this server.' });
  }

  const redirectTo = `${getPublicBaseUrl(req)}/auth.html`;
  const params = new URLSearchParams({ provider: 'google', redirect_to: redirectTo });
  return res.redirect(`${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`);
});

// Exchanges the tokens Supabase returned after Google sign-in for a server session.
// Only accounts that are already approved (profile, admin, or allow-listed) are accepted.
router.post('/api/auth/google-session', async (req, res) => {
  if (!SUPABASE_AUTH_ENABLED) {
    return res.status(503).json({ error: 'Supabase auth is not configured on this server.' });
  }

  const accessToken = String(req.body?.accessToken || '').trim();
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  const user = await getSupabaseUserFromToken(accessToken);
  if (!user) {
    return res.status(403).json({
      error: 'This Google account is not approved. Request an invite, or ask an admin to create your account with this email.'
    });
  }

  setAuthCookie(res, accessToken, Number.parseInt(String(req.body?.expiresIn || 3600), 10) || 3600);

  return res.json({
    success: true,
    session: { accessToken, refreshToken, user: toPublicAuthUser(user) },
    defaultRedirect: '/admin.html'
  });
});

router.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true });
});

router.get('/api/auth/me', async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const user = await getSupabaseUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  return res.json({
    success: true,
    user: toPublicAuthUser(user)
  });
});

module.exports = router;
