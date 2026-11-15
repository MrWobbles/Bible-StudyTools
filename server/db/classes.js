/**
 * server/db/classes.js - Class record normalization and persistence helpers.
 */

const {
  TABLE_CLASSES,
  TABLE_LESSON_PLANS,
  cloneJson,
  isPlainObject,
  normalizeOwnerUserId,
  toScopedRecordId,
  getOwnerPrefix,
  buildRecordId,
  getFirstNonEmptyString,
  isConnected,
  getClient,
  appendHistoryRecord,
  upsertScopedRecord
} = require('./client');

const CLASS_ID_FIELDS = ['id', 'classId', 'slug', 'title'];

const CLASS_RECORD_CONFIG = {
  tableName: TABLE_CLASSES,
  keyField: 'class_id',
  docId: 'classes',
  historyIdKey: 'classId',
  idFields: CLASS_ID_FIELDS
};

function normalizeClassesPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.classes)) {
    return null;
  }
  return data.classes.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function getClassRecordIdentity(record, index) {
  return getFirstNonEmptyString(record, CLASS_ID_FIELDS) || buildRecordId('class', index);
}

function toStoredClassRecord(record, index, ownerUserId) {
  const classId = getClassRecordIdentity(record, index);
  return {
    class_id: toScopedRecordId(ownerUserId, classId),
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: cloneJson(record)
  };
}

async function upsertClassRecord(classId, classData, reason = 'partial-upsert', options = {}) {
  return upsertScopedRecord(CLASS_RECORD_CONFIG, classId, classData, reason, options);
}

async function deleteClassRecord(classId, reason = 'partial-delete', options = {}) {
  if (!isConnected()) return false;

  const supabaseAdmin = getClient();
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedClassId = String(classId || '').trim();
  if (!normalizedClassId) return false;
  const scopedClassId = toScopedRecordId(ownerUserId, normalizedClassId);

  const { error: classDeleteError, count: deletedCount } = await supabaseAdmin
    .from(TABLE_CLASSES)
    .delete({ count: 'exact' })
    .eq('class_id', scopedClassId);

  if (classDeleteError) {
    throw new Error(classDeleteError.message);
  }

  let linkedPlansQuery = supabaseAdmin
    .from(TABLE_LESSON_PLANS)
    .select('plan_id,class_ids,data')
    .contains('class_ids', [normalizedClassId]);

  const ownerPrefix = getOwnerPrefix(ownerUserId);
  if (ownerPrefix) {
    linkedPlansQuery = linkedPlansQuery.like('plan_id', `${ownerPrefix}%`);
  }

  const { data: linkedPlans, error: plansError } = await linkedPlansQuery;

  if (plansError) {
    throw new Error(plansError.message);
  }

  if (Array.isArray(linkedPlans) && linkedPlans.length > 0) {
    const updates = linkedPlans.map((row) => {
      const updatedClassIds = Array.isArray(row.class_ids)
        ? row.class_ids.filter(value => value !== normalizedClassId)
        : [];

      const updatedData = cloneJson(row.data || {});
      if (Array.isArray(updatedData.classes)) {
        updatedData.classes = updatedData.classes.filter(value => value !== normalizedClassId);
      }

      return {
        plan_id: row.plan_id,
        class_ids: updatedClassIds,
        updated_at: new Date().toISOString(),
        data: updatedData
      };
    });

    const { error: updateError } = await supabaseAdmin
      .from(TABLE_LESSON_PLANS)
      .upsert(updates, { onConflict: 'plan_id' });

    if (updateError) {
      throw new Error(updateError.message);
    }

    await appendHistoryRecord('lessonPlans', {
      op: 'detach-class',
      classId: normalizedClassId,
      affectedPlanIds: updates.map(update => update.plan_id)
    }, reason, ownerUserId);
  }

  await appendHistoryRecord('classes', {
    op: 'delete',
    classId: normalizedClassId,
    deleted: Number(deletedCount || 0) > 0
  }, reason, ownerUserId);

  return Number(deletedCount || 0) > 0;
}

module.exports = {
  normalizeClassesPayload,
  toStoredClassRecord,
  upsertClassRecord,
  deleteClassRecord
};
