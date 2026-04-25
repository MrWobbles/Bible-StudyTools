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
const { createClient } = require('@supabase/supabase-js');
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
  upsertNoteRecord,
  deleteNoteRecord,
  closeDB
} = require('./db');
const { exec } = require('child_process');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = (process.env.BST_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
const SHOULD_AUTO_OPEN_BROWSER = process.env.BST_DISABLE_BROWSER_OPEN !== '1';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const SUPABASE_ALLOWED_EMAILS = parseCsvSet(process.env.SUPABASE_ALLOWED_EMAILS);
const SUPABASE_ALLOWED_ROLES = parseCsvSet(process.env.SUPABASE_ALLOWED_ROLES);
const SUPABASE_ADMIN_EMAILS = parseCsvSet(process.env.SUPABASE_ADMIN_EMAILS);
const SUPABASE_ADMIN_ROLES = parseCsvSet(process.env.SUPABASE_ADMIN_ROLES || 'admin');
const SIGNUP_REQUESTS_TABLE = String(process.env.SUPABASE_SIGNUP_REQUESTS_TABLE || 'bst_signup_requests').trim();
const SIGNUP_INVITES_TABLE = String(process.env.SUPABASE_SIGNUP_INVITES_TABLE || 'bst_signup_invites').trim();
const USER_PROFILES_TABLE = String(process.env.SUPABASE_USER_PROFILES_TABLE || 'bst_user_profiles').trim();
const SIGNUP_NOTIFICATION_EMAIL = 'shadowofthharvest@gmail.com';
const BOOTSTRAP_ADMIN_EMAIL = String(process.env.BST_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const BOOTSTRAP_ADMIN_PASSWORD = String(process.env.BST_BOOTSTRAP_ADMIN_PASSWORD || '');
const BOOTSTRAP_ADMIN_USERNAME_RAW = String(process.env.BST_BOOTSTRAP_ADMIN_USERNAME || '').trim();
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || '587'), 10);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || `Bible Study Tools <${SIGNUP_NOTIFICATION_EMAIL}>`).trim();
const AUTH_COOKIE_NAME = 'bst_access_token';

app.disable('x-powered-by');

const LESSON_PLANS_SEGMENT = 'lessonPlans';
const LEGACY_LESSON_PLANS_SEGMENT = 'lessonplans';
const API_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUIRE_ADMIN_ON_LOOPBACK = process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK == null
  ? process.env.NODE_ENV === 'production'
  : parseBooleanLike(process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK);
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
const MAX_NOTES_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_NOTES_PER_PAYLOAD, 500, 5000);
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

const noteRecordSchema = z.object({
  id: boundedIdSchema.optional(),
  noteId: boundedIdSchema.optional(),
  title: boundedTitleSchema.optional(),
  content: z.any().optional()
}).passthrough();

const notesSaveSchema = z.object({
  notes: z.array(noteRecordSchema).max(MAX_NOTES_PER_PAYLOAD)
}).passthrough();

// Middleware - JSON parsing first
// classes.json can exceed the default 100kb when outlines/content are expanded
app.use(express.json({ limit: '10mb' }));
app.use(requestAuditMiddleware);
app.use(remoteWriteRateLimit);
app.use(enforceRemoteCsrf);

// Data directory
const VIDEO_DIR = process.env.BST_VIDEO_DIR
  ? path.resolve(process.env.BST_VIDEO_DIR)
  : path.join(__dirname, 'assets', 'video');
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const DATA_DOC_MAP = {
  classes: 'classes',
  lessonplans: 'lessonPlans',
  notes: 'notes'
};
const PUBLIC_HTML_FILES = ['index.html', 'admin.html', 'user-admin.html', 'editor.html', 'student.html', 'teacher.html'];
const PUBLIC_ASSET_DIRS = ['css', 'js', 'images', 'audio', 'video', 'documents'];
const AUTH_PUBLIC_HTML_FILES = new Set(['auth.html']);
const ADMIN_HTML_FILES = new Set(['user-admin.html']);

const supabaseServiceClient = SUPABASE_SERVICE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  : null;

let serverInstance = null;
let shutdownHandlersRegistered = false;

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

  const bearerToken = extractBearerToken(req);
  const headerToken = String(req.get('x-bst-admin-token') || '').trim();

  return areTokensEqual(headerToken, ADMIN_TOKEN) || areTokensEqual(bearerToken, ADMIN_TOKEN);
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

function getRequestOwnerUserId(req) {
  return String(req?.authUser?.id || '').trim() || null;
}

function getRequestOwnerOptions(req) {
  const ownerUserId = getRequestOwnerUserId(req);
  return ownerUserId ? { ownerUserId } : null;
}

function toPublicAuthUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    role: getSupabaseUserRole(user) || null,
    isAdmin: isSupabaseAdminUser(user)
  };
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

async function findInviteRecord(inviteCode) {
  if (!supabaseServiceClient) {
    return null;
  }

  const normalizedCode = String(inviteCode || '').trim();
  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_INVITES_TABLE)
    .select('*')
    .eq('invite_code', normalizedCode)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load invite code: ${error.message}`);
  }

  return data || null;
}

async function findSignupRequestById(requestId) {
  if (!supabaseServiceClient) {
    return null;
  }

  const normalizedId = Number.parseInt(String(requestId || ''), 10);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .select('*')
    .eq('id', normalizedId)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load signup request: ${error.message}`);
  }

  return data || null;
}

async function listSignupRequests(statusFilter) {
  if (!supabaseServiceClient) {
    return [];
  }

  let query = supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(200);

  const normalizedStatus = String(statusFilter || '').trim().toLowerCase();
  if (normalizedStatus) {
    query = query.eq('status', normalizedStatus);
  }

  const { data, error } = await query;
  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load signup requests: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function generateInviteCode() {
  return crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
}

async function createInviteRecord(payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for invite creation.');
  }

  const suppliedInviteCode = String(payload.inviteCode || '').trim().toUpperCase();
  const inviteEmail = String(payload.email || '').trim().toLowerCase() || null;
  const expiresAt = payload.expiresAt || null;
  const createdByUserId = String(payload.createdByUserId || '').trim() || null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = suppliedInviteCode || generateInviteCode();
    const { data, error } = await supabaseServiceClient
      .from(SIGNUP_INVITES_TABLE)
      .insert({
        invite_code: inviteCode,
        email: inviteEmail,
        expires_at: expiresAt,
        created_by_user_id: createdByUserId
      })
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error) {
      return data || null;
    }

    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_INVITES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    const duplicateInvite = String(error.message || '').toLowerCase().includes('duplicate')
      || String(error.message || '').toLowerCase().includes('unique');
    if (duplicateInvite && !suppliedInviteCode) {
      continue;
    }

    throw new Error(`Failed to create invite code: ${error.message}`);
  }

  throw new Error('Failed to generate a unique invite code. Try again.');
}

async function updateSignupRequestApproval(requestId, payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for signup approvals.');
  }

  const normalizedId = Number.parseInt(String(requestId || ''), 10);
  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .update({
      status: payload.status,
      invite_code: payload.inviteCode || null,
      approved_at: payload.approvedAt || null,
      approved_by_user_id: payload.approvedByUserId || null
    })
    .eq('id', normalizedId)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to update signup request: ${error.message}`);
  }

  return data || null;
}

function buildSupabaseAdminHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function createSupabaseAuthUser({ email, password, appMetadata = {}, userMetadata = {}, emailConfirm = true }) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: buildSupabaseAdminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: emailConfirm,
      app_metadata: appMetadata,
      user_metadata: userMetadata
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.error || 'Failed to create account.');
  }

  return payload;
}

async function updateSupabaseAuthUser(userId, payload) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(String(userId || '').trim())}`, {
    method: 'PUT',
    headers: buildSupabaseAdminHeaders(),
    body: JSON.stringify(payload)
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responsePayload?.msg || responsePayload?.error_description || responsePayload?.error || 'Failed to update account.');
  }

  return responsePayload;
}

async function deleteSupabaseAuthUser(userId, shouldSoftDelete = false) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('A valid user id is required.');
  }

  const suffix = shouldSoftDelete ? '?should_soft_delete=true' : '';
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(normalizedUserId)}${suffix}`, {
    method: 'DELETE',
    headers: buildSupabaseAdminHeaders()
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.msg || payload?.error_description || payload?.error || 'Failed to delete account.');
  }
}

async function findUserProfileByIdentifier(identifier) {
  const normalized = String(identifier || '').trim();
  if (!normalized) {
    return null;
  }

  const normalizedEmail = normalized.toLowerCase();
  const normalizedUsername = normalizeUsername(normalized);

  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email')
    .or(`email.eq.${normalizedEmail},username.eq.${normalizedUsername}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load account profile: ${error.message}`);
  }

  return data || null;
}

async function listAllUserProfiles() {
  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to load user accounts: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function deleteUserProfileRecord(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return;
  }

  const { error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .delete()
    .eq('user_id', normalizedUserId);

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to remove user profile: ${error.message}`);
  }
}

async function upsertUserProfileRecord(userId, username, email) {
  const { error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .upsert({
      user_id: userId,
      username,
      email,
      created_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to save user profile: ${error.message}`);
  }
}

async function findExistingUserProfile(username, email) {
  const { data, error } = await supabaseServiceClient
    .from(USER_PROFILES_TABLE)
    .select('user_id, username, email')
    .or(`username.eq.${username},email.eq.${email}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, USER_PROFILES_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to validate uniqueness: ${error.message}`);
  }

  return data || null;
}

async function ensureBootstrapAdminAccount() {
  if (!SUPABASE_SERVICE_ENABLED) {
    return;
  }

  if (!BOOTSTRAP_ADMIN_EMAIL && !BOOTSTRAP_ADMIN_PASSWORD && !BOOTSTRAP_ADMIN_USERNAME_RAW) {
    return;
  }

  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    console.warn('[Supabase] Admin bootstrap skipped: set both BST_BOOTSTRAP_ADMIN_EMAIL and BST_BOOTSTRAP_ADMIN_PASSWORD.');
    return;
  }

  const derivedUsername = BOOTSTRAP_ADMIN_USERNAME_RAW || BOOTSTRAP_ADMIN_EMAIL.split('@')[0] || 'admin';
  const username = normalizeUsername(derivedUsername);
  if (!isValidUsername(username)) {
    console.warn('[Supabase] Admin bootstrap skipped: BST_BOOTSTRAP_ADMIN_USERNAME must be 3-30 chars using letters, numbers, dot, underscore, or dash.');
    return;
  }

  try {
    const existingProfile = await findExistingUserProfile(username, BOOTSTRAP_ADMIN_EMAIL);
    if (existingProfile?.user_id) {
      await updateSupabaseAuthUser(existingProfile.user_id, {
        app_metadata: { role: 'admin' },
        user_metadata: { username }
      });
      await upsertUserProfileRecord(existingProfile.user_id, username, BOOTSTRAP_ADMIN_EMAIL);
      console.log(`[Supabase] Bootstrap admin ensured for ${BOOTSTRAP_ADMIN_EMAIL}.`);
      return;
    }

    const createdUser = await createSupabaseAuthUser({
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: BOOTSTRAP_ADMIN_PASSWORD,
      appMetadata: { role: 'admin' },
      userMetadata: { username },
      emailConfirm: true
    });

    const userId = String(createdUser?.id || '').trim();
    if (!userId) {
      throw new Error('Supabase returned an invalid bootstrap admin user record.');
    }

    await upsertUserProfileRecord(userId, username, BOOTSTRAP_ADMIN_EMAIL);
    console.log(`[Supabase] Bootstrap admin account created for ${BOOTSTRAP_ADMIN_EMAIL}.`);
  } catch (err) {
    console.error('[Supabase] Failed to bootstrap admin account:', err.message);
  }
}

function getMissingSupabaseTableMessage(error, tableName) {
  const message = String(error?.message || '').trim();
  if (!message) {
    return '';
  }

  const normalizedTable = String(tableName || '').trim();
  const isMissingTableError = message.includes('schema cache')
    || message.includes('Could not find the table')
    || message.includes('relation') && message.includes('does not exist');

  if (!isMissingTableError || !normalizedTable) {
    return '';
  }

  return `Missing Supabase table \"public.${normalizedTable}\". Run scripts/supabase/schema.sql in the Supabase SQL editor, then retry after the schema cache refreshes.`;
}

async function markInviteUsed(inviteCode, userId) {
  if (!supabaseServiceClient) {
    return;
  }

  const { error } = await supabaseServiceClient
    .from(SIGNUP_INVITES_TABLE)
    .update({
      used_at: new Date().toISOString(),
      used_by_user_id: userId
    })
    .eq('invite_code', String(inviteCode || '').trim());

  if (error) {
    throw new Error(`Failed to mark invite as used: ${error.message}`);
  }
}

async function saveSignupRequestToDatabase(payload) {
  if (!supabaseServiceClient) {
    throw new Error('Supabase service role is not configured for signup requests.');
  }

  const insertPayload = {
    requested_at: new Date().toISOString(),
    status: 'pending',
    username: normalizeUsername(payload.username),
    email: String(payload.email || '').trim().toLowerCase(),
    display_name: String(payload.displayName || '').trim() || null,
    message: String(payload.message || '').trim() || null,
    source_ip: String(payload.sourceIp || '').trim() || null
  };

  const { data, error } = await supabaseServiceClient
    .from(SIGNUP_REQUESTS_TABLE)
    .insert(insertPayload)
    .select('id')
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingTableMessage = getMissingSupabaseTableMessage(error, SIGNUP_REQUESTS_TABLE);
    if (missingTableMessage) {
      throw new Error(missingTableMessage);
    }

    throw new Error(`Failed to save signup request: ${error.message}`);
  }

  return data || null;
}

async function sendSignupRequestNotification(payload) {
  if (!nodemailer) {
    return {
      sent: false,
      reason: 'Nodemailer is not installed.'
    };
  }

  if (!SMTP_HOST || !Number.isInteger(SMTP_PORT) || !SMTP_USER || !SMTP_PASS) {
    return {
      sent: false,
      reason: 'SMTP is not configured.'
    };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  const createdAt = new Date().toISOString();
  const subject = `Signup request: ${payload.username}`;
  const lines = [
    'A new signup request was submitted.',
    '',
    `Username: ${payload.username}`,
    `Email: ${payload.email}`,
    `Name: ${payload.displayName || '(not provided)'}`,
    `Submitted at: ${createdAt}`,
    `Source IP: ${payload.sourceIp || '(unknown)'}`,
    '',
    'Message:',
    payload.message || '(none)'
  ];

  await transporter.sendMail({
    from: SMTP_FROM,
    to: SIGNUP_NOTIFICATION_EMAIL,
    subject,
    text: lines.join('\n')
  });

  return { sent: true };
}

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

function parseCsvSet(rawValue) {
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
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

    if (options.requireAdmin && !isSupabaseAdminUser(user)) {
      return null;
    }

    return user;
  } catch (err) {
    return null;
  }
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

// ===== API ENDPOINTS =====

app.get('/api/data/:fileName', requireAuthenticatedAccess, async (req, res) => {
  try {
    const key = String(req.params.fileName || '').toLowerCase();
    const docId = DATA_DOC_MAP[key];
    if (!docId) {
      return res.status(400).json({ error: 'Invalid data key. Use "classes", "lessonPlans", or "notes".' });
    }
    if (!isConnected()) {
      return res.status(503).json({ error: 'Supabase is disconnected. Data is unavailable.' });
    }
    const ownerOptions = getRequestOwnerOptions(req);
    const data = ownerOptions
      ? await loadDoc(docId, ownerOptions)
      : await loadDoc(docId);
    if (!data) {
      return res.status(404).json({ error: 'Data not found' });
    }
    res.json(data);
  } catch (err) {
    sendApiError(res, err, 'Failed to load data');
  }
});

/**
 * POST /api/save/classes
 * Save classes document to Supabase
 */
app.post('/api/save/classes', requireAuthenticatedAccess, async (req, res) => {
  try {
    const parsed = parseBodyWithSchema(classesSaveSchema, req.body, 'Invalid classes payload');
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        error: parsed.error,
        details: parsed.details
      });
    }

    if (!isConnected()) {
      return res.status(503).json({ error: 'Supabase is disconnected. Cannot save classes.' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const ok = ownerOptions
      ? await saveDoc('classes', parsed.data, ownerOptions)
      : await saveDoc('classes', parsed.data);
    if (!ok) {
      return res.status(500).json({ error: 'Failed to save classes to Supabase.' });
    }

    res.json({ success: true, message: 'Classes saved successfully' });
  } catch (err) {
    console.error('Error saving classes:', err);
    sendApiError(res, err, 'Failed to save classes');
  }
});

/**
 * POST /api/save/lessonPlans
 * Save lesson plans document to Supabase
 */
app.post([
  `/api/save/${LESSON_PLANS_SEGMENT}`,
  `/api/save/${LEGACY_LESSON_PLANS_SEGMENT}`
], markLegacyLessonPlansRoute, requireAuthenticatedAccess, async (req, res) => {
  try {
    const parsed = parseBodyWithSchema(lessonPlansSaveSchema, req.body, 'Invalid lesson plans payload');
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        error: parsed.error,
        details: parsed.details
      });
    }

    if (!isConnected()) {
      return res.status(503).json({ error: 'Supabase is disconnected. Cannot save lesson plans.' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const ok = ownerOptions
      ? await saveDoc('lessonPlans', parsed.data, ownerOptions)
      : await saveDoc('lessonPlans', parsed.data);
    if (!ok) {
      return res.status(500).json({ error: 'Failed to save lesson plans to Supabase.' });
    }

    res.json({ success: true, message: 'Lesson plans saved successfully' });
  } catch (err) {
    console.error('Error saving lesson plans:', err);
    sendApiError(res, err, 'Failed to save lesson plans');
  }
});

/**
 * POST /api/save/notes
 * Save notes document to Supabase
 */
app.post('/api/save/notes', requireAuthenticatedAccess, async (req, res) => {
  try {
    const parsed = parseBodyWithSchema(notesSaveSchema, req.body, 'Invalid notes payload');
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        error: parsed.error,
        details: parsed.details
      });
    }

    if (!isConnected()) {
      return res.status(503).json({ error: 'Supabase is disconnected. Cannot save notes.' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const ok = ownerOptions
      ? await saveDoc('notes', parsed.data, ownerOptions)
      : await saveDoc('notes', parsed.data);
    if (!ok) {
      return res.status(500).json({ error: 'Failed to save notes to Supabase.' });
    }

    res.json({ success: true, message: 'Notes saved successfully' });
  } catch (err) {
    console.error('Error saving notes:', err);
    sendApiError(res, err, 'Failed to save notes');
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
    supabase: isConnected() ? 'connected' : 'disconnected'
  });
});

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/auth/signup', async (req, res) => {
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

app.get('/api/admin/signup-requests', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  try {
    const status = String(req.query?.status || '').trim();
    const requests = await listSignupRequests(status);
    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load signup requests.' });
  }
});

app.get('/api/admin/accounts', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  try {
    const accounts = await listAllUserProfiles();
    return res.json({ success: true, accounts });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load user accounts.' });
  }
});

app.post('/api/admin/signup-requests/:requestId/approve', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  const requestId = Number.parseInt(String(req.params.requestId || ''), 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'requestId must be a positive integer.' });
  }

  const inviteCode = String(req.body?.inviteCode || '').trim().toUpperCase();
  const expiresInDays = Number.parseInt(String(req.body?.expiresInDays || '7'), 10);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    return res.status(400).json({ error: 'expiresInDays must be an integer between 1 and 90.' });
  }

  try {
    const signupRequest = await findSignupRequestById(requestId);
    if (!signupRequest) {
      return res.status(404).json({ error: 'Signup request not found.' });
    }

    if (String(signupRequest.status || '').trim().toLowerCase() === 'approved') {
      return res.status(409).json({ error: 'Signup request has already been approved.' });
    }

    const approvedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const createdInvite = await createInviteRecord({
      inviteCode,
      email: signupRequest.email,
      expiresAt,
      createdByUserId: req.authUser?.id || null
    });

    const updatedRequest = await updateSignupRequestApproval(requestId, {
      status: 'approved',
      inviteCode: String(createdInvite?.invite_code || '').trim() || inviteCode,
      approvedAt,
      approvedByUserId: req.authUser?.id || null
    });

    return res.json({
      success: true,
      inviteCode: String(createdInvite?.invite_code || '').trim() || inviteCode,
      invite: createdInvite,
      request: updatedRequest,
      message: 'Signup request approved.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to approve signup request.' });
  }
});

app.post('/api/admin/signup-requests/:requestId/reject', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin request management is not configured on this server.' });
  }

  const requestId = Number.parseInt(String(req.params.requestId || ''), 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'requestId must be a positive integer.' });
  }

  const reason = String(req.body?.reason || '').trim();

  try {
    const signupRequest = await findSignupRequestById(requestId);
    if (!signupRequest) {
      return res.status(404).json({ error: 'Signup request not found.' });
    }

    const currentStatus = String(signupRequest.status || '').trim().toLowerCase();
    if (currentStatus === 'approved') {
      return res.status(409).json({ error: 'Approved requests cannot be rejected.' });
    }

    if (currentStatus === 'rejected') {
      return res.status(409).json({ error: 'Signup request has already been rejected.' });
    }

    const updatedRequest = await updateSignupRequestApproval(requestId, {
      status: 'rejected',
      inviteCode: null,
      approvedAt: new Date().toISOString(),
      approvedByUserId: req.authUser?.id || null
    });

    if (reason && supabaseServiceClient) {
      await supabaseServiceClient
        .from(SIGNUP_REQUESTS_TABLE)
        .update({ message: `${String(signupRequest.message || '').trim()}\n\n[Rejected by admin] ${reason}`.trim() })
        .eq('id', requestId);
    }

    return res.json({
      success: true,
      request: updatedRequest,
      message: 'Signup request rejected.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to reject signup request.' });
  }
});

app.post('/api/admin/accounts/reset-password', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  const identifier = String(req.body?.identifier || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!identifier || !newPassword) {
    return res.status(400).json({ error: 'identifier and newPassword are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'newPassword must be at least 8 characters.' });
  }

  try {
    const profile = await findUserProfileByIdentifier(identifier);
    if (!profile?.user_id) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    await updateSupabaseAuthUser(profile.user_id, {
      password: newPassword
    });

    return res.json({
      success: true,
      userId: profile.user_id,
      identifier: profile.email || profile.username,
      message: 'Password reset successfully.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to reset password.' });
  }
});

app.delete('/api/admin/accounts/:identifier', requireAdminAccess, async (req, res) => {
  if (!SUPABASE_SERVICE_ENABLED || !supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase admin account management is not configured on this server.' });
  }

  const identifier = String(req.params.identifier || '').trim();
  if (!identifier) {
    return res.status(400).json({ error: 'identifier is required.' });
  }

  try {
    const profile = await findUserProfileByIdentifier(identifier);
    if (!profile?.user_id) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const targetUserId = String(profile.user_id || '').trim();
    if (req.authUser?.id && targetUserId === String(req.authUser.id).trim()) {
      return res.status(400).json({ error: 'You cannot remove the account currently in use.' });
    }

    await deleteSupabaseAuthUser(targetUserId, false);
    await deleteUserProfileRecord(targetUserId);

    return res.json({
      success: true,
      userId: targetUserId,
      identifier: profile.email || profile.username,
      message: 'Account removed successfully.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to remove account.' });
  }
});

app.post('/api/auth/signup-request', async (req, res) => {
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

app.post('/api/auth/refresh', async (req, res) => {
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

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
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

/**
 * PUT /api/supabase/classes/:classId
 * Upsert a single class record directly in cloud normalized storage
 */
app.put('/api/supabase/classes/:classId', requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const classId = String(req.params.classId || '').trim();
    const classData = req.body?.class && typeof req.body.class === 'object' ? req.body.class : req.body;

    if (!classId || !classData || typeof classData !== 'object' || Array.isArray(classData)) {
      return res.status(400).json({ error: 'Invalid class payload' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const saved = ownerOptions
      ? await upsertClassRecord(classId, classData, 'api-partial-upsert', ownerOptions)
      : await upsertClassRecord(classId, classData, 'api-partial-upsert');
    if (!saved) {
      return res.status(400).json({ error: 'Unable to upsert class record' });
    }

    return res.json({
      success: true,
      message: 'Class upserted in Supabase',
      classId,
      class: saved,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error upserting Supabase class:', err);
    sendApiError(res, err, 'Failed to upsert Supabase class');
  }
});

/**
 * DELETE /api/supabase/classes/:classId
 * Delete a single class record directly in cloud normalized storage
 */
app.delete('/api/supabase/classes/:classId', requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const classId = String(req.params.classId || '').trim();
    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const deleted = ownerOptions
      ? await deleteClassRecord(classId, 'api-partial-delete', ownerOptions)
      : await deleteClassRecord(classId, 'api-partial-delete');
    return res.json({
      success: true,
      message: deleted ? 'Class deleted from Supabase' : 'Class not found in Supabase',
      classId,
      deleted,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error deleting Supabase class:', err);
    sendApiError(res, err, 'Failed to delete Supabase class');
  }
});

/**
 * PUT /api/supabase/lessonPlans/:planId
 * Upsert a single lesson plan record directly in cloud normalized storage
 */
app.put([
  `/api/supabase/${LESSON_PLANS_SEGMENT}/:planId`,
  `/api/supabase/${LEGACY_LESSON_PLANS_SEGMENT}/:planId`
], markLegacyLessonPlansRoute, requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const planId = String(req.params.planId || '').trim();
    const lessonPlanData = req.body?.lessonPlan && typeof req.body.lessonPlan === 'object'
      ? req.body.lessonPlan
      : req.body;

    if (!planId || !lessonPlanData || typeof lessonPlanData !== 'object' || Array.isArray(lessonPlanData)) {
      return res.status(400).json({ error: 'Invalid lesson plan payload' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const saved = ownerOptions
      ? await upsertLessonPlanRecord(planId, lessonPlanData, 'api-partial-upsert', ownerOptions)
      : await upsertLessonPlanRecord(planId, lessonPlanData, 'api-partial-upsert');
    if (!saved) {
      return res.status(400).json({ error: 'Unable to upsert lesson plan record' });
    }

    return res.json({
      success: true,
      message: 'Lesson plan upserted in Supabase',
      planId,
      lessonPlan: saved,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error upserting Supabase lesson plan:', err);
    sendApiError(res, err, 'Failed to upsert Supabase lesson plan');
  }
});

/**
 * DELETE /api/supabase/lessonPlans/:planId
 * Delete a single lesson plan record directly in cloud normalized storage
 */
app.delete([
  `/api/supabase/${LESSON_PLANS_SEGMENT}/:planId`,
  `/api/supabase/${LEGACY_LESSON_PLANS_SEGMENT}/:planId`
], markLegacyLessonPlansRoute, requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const planId = String(req.params.planId || '').trim();
    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const deleted = ownerOptions
      ? await deleteLessonPlanRecord(planId, 'api-partial-delete', ownerOptions)
      : await deleteLessonPlanRecord(planId, 'api-partial-delete');
    return res.json({
      success: true,
      message: deleted ? 'Lesson plan deleted from Supabase' : 'Lesson plan not found in Supabase',
      planId,
      deleted,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error deleting Supabase lesson plan:', err);
    sendApiError(res, err, 'Failed to delete Supabase lesson plan');
  }
});

/**
 * PUT /api/supabase/notes/:noteId
 * Upsert a single note record directly in cloud normalized storage
 */
app.put('/api/supabase/notes/:noteId', requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const noteId = String(req.params.noteId || '').trim();
    const noteData = req.body?.note && typeof req.body.note === 'object'
      ? req.body.note
      : req.body;

    if (!noteId || !noteData || typeof noteData !== 'object' || Array.isArray(noteData)) {
      return res.status(400).json({ error: 'Invalid note payload' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const saved = ownerOptions
      ? await upsertNoteRecord(noteId, noteData, 'api-partial-upsert', ownerOptions)
      : await upsertNoteRecord(noteId, noteData, 'api-partial-upsert');
    if (!saved) {
      return res.status(400).json({ error: 'Unable to upsert note record' });
    }

    return res.json({
      success: true,
      message: 'Note upserted in Supabase',
      noteId,
      note: saved,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error upserting Supabase note:', err);
    sendApiError(res, err, 'Failed to upsert Supabase note');
  }
});

/**
 * DELETE /api/supabase/notes/:noteId
 * Delete a single note record directly in cloud normalized storage
 */
app.delete('/api/supabase/notes/:noteId', requireAuthenticatedAccess, async (req, res) => {
  try {
    if (!requireSupabaseConnection(res)) {
      return;
    }

    const noteId = String(req.params.noteId || '').trim();
    if (!noteId) {
      return res.status(400).json({ error: 'noteId is required' });
    }

    const ownerOptions = getRequestOwnerOptions(req);
    const deleted = ownerOptions
      ? await deleteNoteRecord(noteId, 'api-partial-delete', ownerOptions)
      : await deleteNoteRecord(noteId, 'api-partial-delete');
    return res.json({
      success: true,
      message: deleted ? 'Note deleted from Supabase' : 'Note not found in Supabase',
      noteId,
      deleted,
      supabase: 'connected'
    });
  } catch (err) {
    console.error('Error deleting Supabase note:', err);
    sendApiError(res, err, 'Failed to delete Supabase note');
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

['auth.html', ...PUBLIC_HTML_FILES].forEach((fileName) => {
  const routePaths = fileName === 'index.html' ? ['/', '/index.html'] : [`/${fileName}`];
  routePaths.forEach((routePath) => {
    const middleware = AUTH_PUBLIC_HTML_FILES.has(fileName)
      ? []
      : ADMIN_HTML_FILES.has(fileName)
        ? [requireAdminPage]
        : [requireAuthenticatedPage];

    app.get(routePath, ...middleware, (req, res) => {
      if (fileName === 'index.html') {
        return res.redirect('/admin.html');
      }
      return res.sendFile(path.join(__dirname, fileName));
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

// ===== SUPABASE SYNC HELPERS =====

// ===== START SERVER =====

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
    VIDEO_DIR,
  }
};
