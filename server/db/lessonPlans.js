/**
 * server/db/lessonPlans.js - Lesson plan record normalization and persistence helpers.
 */

const {
  TABLE_LESSON_PLANS,
  cloneJson,
  isPlainObject,
  toScopedRecordId,
  buildRecordId,
  getFirstNonEmptyString,
  upsertScopedRecord,
  deleteScopedRecord
} = require('./client');

const PLAN_ID_FIELDS = ['id', 'planId', 'slug', 'title'];

function extractClassIds(record) {
  return Array.isArray(record.classes)
    ? record.classes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];
}

const LESSON_PLAN_RECORD_CONFIG = {
  tableName: TABLE_LESSON_PLANS,
  keyField: 'plan_id',
  docId: 'lessonPlans',
  historyIdKey: 'planId',
  idFields: PLAN_ID_FIELDS,
  buildExtraFields: (normalizedData) => ({
    class_ids: extractClassIds(normalizedData)
  })
};

function normalizeLessonPlansPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.lessonPlans)) {
    return null;
  }
  return data.lessonPlans.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function getLessonPlanRecordIdentity(record, index) {
  return getFirstNonEmptyString(record, PLAN_ID_FIELDS) || buildRecordId('lesson-plan', index);
}

function toStoredLessonPlanRecord(record, index, ownerUserId) {
  const planId = getLessonPlanRecordIdentity(record, index);
  return {
    plan_id: toScopedRecordId(ownerUserId, planId),
    class_ids: extractClassIds(record),
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: cloneJson(record)
  };
}

async function upsertLessonPlanRecord(planId, lessonPlanData, reason = 'partial-upsert', options = {}) {
  return upsertScopedRecord(LESSON_PLAN_RECORD_CONFIG, planId, lessonPlanData, reason, options);
}

async function deleteLessonPlanRecord(planId, reason = 'partial-delete', options = {}) {
  return deleteScopedRecord(LESSON_PLAN_RECORD_CONFIG, planId, reason, options);
}

module.exports = {
  normalizeLessonPlansPayload,
  toStoredLessonPlanRecord,
  upsertLessonPlanRecord,
  deleteLessonPlanRecord
};
