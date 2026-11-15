const express = require('express');
const { isConnected, loadDoc, saveDoc } = require('../../db');
const {
  SUPABASE_AUTH_ENABLED,
  DATA_DOC_MAP,
  LESSON_PLANS_SEGMENT,
  LEGACY_LESSON_PLANS_SEGMENT
} = require('../config/env');
const {
  classesSaveSchema,
  lessonPlansSaveSchema,
  notesSaveSchema,
  parseBodyWithSchema
} = require('../config/schemas');
const { requireAuthenticatedAccess } = require('../middleware/auth');
const { markLegacyLessonPlansRoute } = require('../middleware/legacyRoutes');
const {
  isLoopbackRequest,
  hasValidAdminToken,
  extractBearerToken,
  getRequestOwnerOptions,
  sendApiError
} = require('../services/httpHelpers');
const { getSupabaseUserFromToken } = require('../services/supabaseAuth');
const { loadLocalData } = require('../services/localData');

const router = express.Router();

router.get('/api/data/:fileName', async (req, res) => {
  // Allow GET requests on localhost without authentication for testing
  const isLoopback = isLoopbackRequest(req);

  // Check auth: allow loopback, admin token, or Supabase auth
  if (!isLoopback && !hasValidAdminToken(req)) {
    // Try Supabase authentication
    if (SUPABASE_AUTH_ENABLED) {
      const bearerToken = extractBearerToken(req);
      if (bearerToken) {
        const user = await getSupabaseUserFromToken(bearerToken);
        if (user) {
          req.authUser = user;
          // User is authenticated, continue
        } else {
          return res.status(401).json({ error: 'Invalid or expired authentication.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required for remote access.' });
      }
    } else {
      return res.status(401).json({ error: 'Authentication required for remote access.' });
    }
  }

  try {
    const key = String(req.params.fileName || '').toLowerCase();
    const docId = DATA_DOC_MAP[key];
    if (!docId) {
      return res.status(400).json({ error: 'Invalid data key. Use "classes", "lessonPlans", or "notes".' });
    }

    // Try Supabase first if connected
    if (isConnected()) {
      const ownerOptions = getRequestOwnerOptions(req);
      const data = ownerOptions
        ? await loadDoc(docId, ownerOptions)
        : await loadDoc(docId);
      if (!data) {
        return res.status(404).json({ error: 'Data not found' });
      }
      return res.json(data);
    }

    // Fall back to local JSON files when Supabase is disconnected
    console.log(`[Local Fallback] Loading ${key} from local files`);
    const localData = await loadLocalData(key);
    if (localData === null) {
      return res.status(503).json({ error: 'Supabase is disconnected and no local data is available.' });
    }
    return res.json(localData);
  } catch (err) {
    sendApiError(res, err, 'Failed to load data');
  }
});

/**
 * POST /api/save/classes
 * Save classes document to Supabase
 */
router.post('/api/save/classes', requireAuthenticatedAccess, async (req, res) => {
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
router.post([
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
router.post('/api/save/notes', requireAuthenticatedAccess, async (req, res) => {
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
router.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is running',
    supabase: isConnected() ? 'connected' : 'disconnected'
  });
});

module.exports = router;
