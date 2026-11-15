const express = require('express');
const {
  upsertClassRecord,
  deleteClassRecord,
  upsertLessonPlanRecord,
  deleteLessonPlanRecord,
  upsertNoteRecord,
  deleteNoteRecord
} = require('../../db');
const { LESSON_PLANS_SEGMENT, LEGACY_LESSON_PLANS_SEGMENT } = require('../config/env');
const { requireAuthenticatedAccess } = require('../middleware/auth');
const { markLegacyLessonPlansRoute } = require('../middleware/legacyRoutes');
const {
  getRequestOwnerOptions,
  sendApiError,
  requireSupabaseConnection
} = require('../services/httpHelpers');

const router = express.Router();

/**
 * PUT /api/supabase/classes/:classId
 * Upsert a single class record directly in cloud normalized storage
 */
router.put('/api/supabase/classes/:classId', requireAuthenticatedAccess, async (req, res) => {
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
router.delete('/api/supabase/classes/:classId', requireAuthenticatedAccess, async (req, res) => {
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
router.put([
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
router.delete([
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
router.put('/api/supabase/notes/:noteId', requireAuthenticatedAccess, async (req, res) => {
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
router.delete('/api/supabase/notes/:noteId', requireAuthenticatedAccess, async (req, res) => {
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

module.exports = router;
