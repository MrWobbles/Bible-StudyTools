/**
 * server/db/index.js - Public database module facade.
 *
 * Storage layout (default tables):
 *   - bst_classes
 *   - bst_lesson_plans
 *   - bst_notes
 *   - bst_app_data_history
 *   - bst_editor_versions
 *
 * If Supabase is not configured, all functions degrade gracefully so
 * local JSON save flows continue to work.
 */

const { connectDB, isConnected, closeDB } = require('./client');
const { loadDoc, saveDoc, getEditorRecord, saveEditorRecordIfRevision } = require('./editorDocs');
const { listEditorVersions, getEditorVersion } = require('./versions');
const { upsertClassRecord, deleteClassRecord } = require('./classes');
const { upsertLessonPlanRecord, deleteLessonPlanRecord } = require('./lessonPlans');
const { upsertNoteRecord, deleteNoteRecord } = require('./notes');

module.exports = {
  connectDB,
  isConnected,
  loadDoc,
  getEditorRecord,
  saveEditorRecordIfRevision,
  listEditorVersions,
  getEditorVersion,
  saveDoc,
  upsertClassRecord,
  deleteClassRecord,
  upsertLessonPlanRecord,
  deleteLessonPlanRecord,
  upsertNoteRecord,
  deleteNoteRecord,
  closeDB
};
