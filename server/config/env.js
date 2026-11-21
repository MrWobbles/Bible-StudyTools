require('dotenv').config();

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function parseCsvSet(rawValue) {
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getBoundedPositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maxValue);
}

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
const TABLE_VBS_SCENES = String(process.env.SUPABASE_VBS_SCENES_TABLE || 'bst_vbs_scenes').trim();

const SIGNUP_NOTIFICATION_EMAIL = 'shadowofthharvest@gmail.com';
const BOOTSTRAP_ADMIN_EMAIL = String(process.env.BST_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const BOOTSTRAP_ADMIN_PASSWORD = String(process.env.BST_BOOTSTRAP_ADMIN_PASSWORD || '');
const BOOTSTRAP_ADMIN_USERNAME_RAW = String(process.env.BST_BOOTSTRAP_ADMIN_USERNAME || '').trim();

const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || '587'), 10);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || `Bible Study Tools <${SIGNUP_NOTIFICATION_EMAIL}>`).trim();

const API_BIBLE_KEY = String(process.env.API_BIBLE_KEY || '').trim();
const API_BIBLE_BASE_URL = 'https://rest.api.bible/v1';
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
const UNSPLASH_ACCESS_KEY = String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
const UNSPLASH_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTH_COOKIE_NAME = 'bst_access_token';

const LESSON_PLANS_SEGMENT = 'lessonPlans';
const LEGACY_LESSON_PLANS_SEGMENT = 'lessonplans';
const API_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUIRE_ADMIN_ON_LOOPBACK = process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK == null
  ? process.env.NODE_ENV === 'production'
  : parseBooleanLike(process.env.BST_REQUIRE_ADMIN_ON_LOOPBACK);

const ENABLE_REMOTE_RATE_LIMIT = parseBooleanLike(process.env.BST_ENABLE_REMOTE_RATE_LIMIT || '1');
const RATE_LIMIT_WINDOW_MS = getBoundedPositiveInt(process.env.BST_RATE_LIMIT_WINDOW_MS, 60000, 3600000);
const RATE_LIMIT_MAX_REQUESTS = getBoundedPositiveInt(process.env.BST_RATE_LIMIT_MAX_REQUESTS, 120, 5000);
const ENABLE_REQUEST_AUDIT = parseBooleanLike(process.env.BST_ENABLE_REQUEST_AUDIT || '1');
const AUDIT_LOG_FILE = process.env.BST_AUDIT_LOG_FILE
  ? path.resolve(process.env.BST_AUDIT_LOG_FILE)
  : path.join(ROOT_DIR, 'logs', 'api-audit.log');

const MAX_CLASSES_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_CLASSES_PER_PAYLOAD, 500, 5000);
const MAX_LESSON_PLANS_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_LESSON_PLANS_PER_PAYLOAD, 500, 5000);
const MAX_NOTES_PER_PAYLOAD = getBoundedPositiveInt(process.env.BST_MAX_NOTES_PER_PAYLOAD, 500, 5000);
const MAX_ITEMS_PER_CLASS_OUTLINE = getBoundedPositiveInt(process.env.BST_MAX_CLASS_OUTLINE_ITEMS, 2000, 10000);
const MAX_ITEMS_PER_CLASS_MEDIA = getBoundedPositiveInt(process.env.BST_MAX_CLASS_MEDIA_ITEMS, 1000, 10000);
const MAX_CLASSES_PER_LESSON_PLAN = getBoundedPositiveInt(process.env.BST_MAX_CLASSES_PER_LESSON_PLAN, 300, 2000);

const VIDEO_DIR = process.env.BST_VIDEO_DIR
  ? path.resolve(process.env.BST_VIDEO_DIR)
  : path.join(ROOT_DIR, 'assets', 'video');
const AUDIO_DIR = path.join(ROOT_DIR, 'assets', 'audio');
const QUEUE_FILE = path.join(ROOT_DIR, 'data', 'queue.json');

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const DATA_DOC_MAP = {
  classes: 'classes',
  lessonplans: 'lessonPlans',
  notes: 'notes'
};
const PUBLIC_HTML_FILES = [
  'index.html',
  'admin.html',
  'user-admin.html',
  'editor.html',
  'student.html',
  'teacher.html',
  'dj-dashboard.html',
  'requests.html',
  'vbs.html',
  'vbs-control.html',
  'teleprompter.html',
  'speech-test.html'
];
const PUBLIC_ASSET_DIRS = ['css', 'js', 'images', 'audio', 'video', 'documents'];
const AUTH_PUBLIC_HTML_FILES = new Set(['auth.html', 'requests.html', 'vbs.html', 'teleprompter.html', 'speech-test.html', 'student.html']);
const ADMIN_HTML_FILES = new Set(['user-admin.html']);

module.exports = {
  ROOT_DIR,
  PORT,
  ADMIN_TOKEN,
  SHOULD_AUTO_OPEN_BROWSER,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_AUTH_ENABLED,
  SUPABASE_SERVICE_ENABLED,
  SUPABASE_ALLOWED_EMAILS,
  SUPABASE_ALLOWED_ROLES,
  SUPABASE_ADMIN_EMAILS,
  SUPABASE_ADMIN_ROLES,
  SIGNUP_REQUESTS_TABLE,
  SIGNUP_INVITES_TABLE,
  USER_PROFILES_TABLE,
  TABLE_VBS_SCENES,
  SIGNUP_NOTIFICATION_EMAIL,
  BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD,
  BOOTSTRAP_ADMIN_USERNAME_RAW,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  API_BIBLE_KEY,
  API_BIBLE_BASE_URL,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  UNSPLASH_ACCESS_KEY,
  UNSPLASH_CACHE_TTL_MS,
  AUTH_COOKIE_NAME,
  LESSON_PLANS_SEGMENT,
  LEGACY_LESSON_PLANS_SEGMENT,
  API_WRITE_METHODS,
  REQUIRE_ADMIN_ON_LOOPBACK,
  ENABLE_REMOTE_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  ENABLE_REQUEST_AUDIT,
  AUDIT_LOG_FILE,
  MAX_CLASSES_PER_PAYLOAD,
  MAX_LESSON_PLANS_PER_PAYLOAD,
  MAX_NOTES_PER_PAYLOAD,
  MAX_ITEMS_PER_CLASS_OUTLINE,
  MAX_ITEMS_PER_CLASS_MEDIA,
  MAX_CLASSES_PER_LESSON_PLAN,
  VIDEO_DIR,
  AUDIO_DIR,
  QUEUE_FILE,
  LOOPBACK_ADDRESSES,
  DATA_DOC_MAP,
  PUBLIC_HTML_FILES,
  PUBLIC_ASSET_DIRS,
  AUTH_PUBLIC_HTML_FILES,
  ADMIN_HTML_FILES
};
