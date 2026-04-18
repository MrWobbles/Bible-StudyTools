/**
 * db.js - Supabase data helpers
 *
 * Storage layout (default tables):
 *   - bst_classes
 *   - bst_lesson_plans
 *   - bst_notes
 *   - bst_app_data_history
 *
 * If Supabase is not configured, all functions degrade gracefully so
 * local JSON save flows continue to work.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_SCHEMA = String(process.env.SUPABASE_DB_SCHEMA || 'public').trim() || 'public';

const TABLE_CLASSES = String(process.env.SUPABASE_CLASSES_TABLE || 'bst_classes').trim();
const TABLE_LESSON_PLANS = String(process.env.SUPABASE_LESSON_PLANS_TABLE || 'bst_lesson_plans').trim();
const TABLE_NOTES = String(process.env.SUPABASE_NOTES_TABLE || 'bst_notes').trim();
const TABLE_HISTORY = String(process.env.SUPABASE_HISTORY_TABLE || 'bst_app_data_history').trim();
const SCHEMA_VERSION = 1;
const OWNER_SCOPE_SEPARATOR = '::';

let supabaseAdmin = null;
let connected = false;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeOwnerUserId(ownerUserId) {
  return String(ownerUserId || '').trim();
}

function toScopedRecordId(ownerUserId, recordId) {
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedOwnerId = normalizeOwnerUserId(ownerUserId);
  if (!normalizedRecordId || !normalizedOwnerId) {
    return normalizedRecordId;
  }

  return `${normalizedOwnerId}${OWNER_SCOPE_SEPARATOR}${normalizedRecordId}`;
}

function getOwnerPrefix(ownerUserId) {
  const normalizedOwnerId = normalizeOwnerUserId(ownerUserId);
  if (!normalizedOwnerId) {
    return '';
  }

  return `${normalizedOwnerId}${OWNER_SCOPE_SEPARATOR}`;
}

function normalizeDocId(docId) {
  const normalized = String(docId || '').trim().toLowerCase();
  if (normalized === 'classes') return 'classes';
  if (normalized === 'lessonplans') return 'lessonPlans';
  if (normalized === 'notes') return 'notes';
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeClassesPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.classes)) {
    return null;
  }
  return data.classes.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function normalizeLessonPlansPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.lessonPlans)) {
    return null;
  }
  return data.lessonPlans.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function normalizeNotesPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.notes)) {
    return null;
  }
  return data.notes.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function buildRecordId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function getClassRecordIdentity(record, index) {
  const candidates = [record.id, record.classId, record.slug, record.title]
    .filter(value => typeof value === 'string' && value.trim());
  return candidates.length > 0 ? candidates[0].trim() : buildRecordId('class', index);
}

function getLessonPlanRecordIdentity(record, index) {
  const candidates = [record.id, record.planId, record.slug, record.title]
    .filter(value => typeof value === 'string' && value.trim());
  return candidates.length > 0 ? candidates[0].trim() : buildRecordId('lesson-plan', index);
}

function getNoteRecordIdentity(record, index) {
  const candidates = [record.id, record.noteId, record.slug, record.title]
    .filter(value => typeof value === 'string' && value.trim());
  return candidates.length > 0 ? candidates[0].trim() : buildRecordId('note', index);
}

function getClassIdFromValue(value) {
  if (!isPlainObject(value)) return null;
  const candidates = [value.id, value.classId, value.slug, value.title]
    .filter(item => typeof item === 'string' && item.trim());
  return candidates.length > 0 ? candidates[0].trim() : null;
}

function getPlanIdFromValue(value) {
  if (!isPlainObject(value)) return null;
  const candidates = [value.id, value.planId, value.slug, value.title]
    .filter(item => typeof item === 'string' && item.trim());
  return candidates.length > 0 ? candidates[0].trim() : null;
}

function getNoteIdFromValue(value) {
  if (!isPlainObject(value)) return null;
  const candidates = [value.id, value.noteId, value.slug, value.title]
    .filter(item => typeof item === 'string' && item.trim());
  return candidates.length > 0 ? candidates[0].trim() : null;
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

function toStoredLessonPlanRecord(record, index, ownerUserId) {
  const planId = getLessonPlanRecordIdentity(record, index);
  return {
    plan_id: toScopedRecordId(ownerUserId, planId),
    class_ids: Array.isArray(record.classes)
      ? record.classes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
      : [],
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: cloneJson(record)
  };
}

function toStoredNoteRecord(record, index, ownerUserId) {
  const noteId = getNoteRecordIdentity(record, index);
  return {
    note_id: toScopedRecordId(ownerUserId, noteId),
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: cloneJson(record)
  };
}

function getTableForDocId(docId) {
  if (docId === 'classes') return TABLE_CLASSES;
  if (docId === 'lessonPlans') return TABLE_LESSON_PLANS;
  if (docId === 'notes') return TABLE_NOTES;
  return null;
}

async function appendHistoryRecord(docId, payload, reason = 'save', ownerUserId = null) {
  if (!isConnected()) return;

  const effectivePayload = isPlainObject(payload)
    ? { ...payload }
    : { value: payload };
  if (ownerUserId) {
    effectivePayload.ownerUserId = ownerUserId;
  }

  const { error } = await supabaseAdmin
    .from(TABLE_HISTORY)
    .insert({
      doc_id: docId,
      reason,
      schema_version: SCHEMA_VERSION,
      recorded_at: new Date().toISOString(),
      payload: cloneJson(effectivePayload)
    });

  if (error) {
    console.warn(`[Supabase] appendHistoryRecord("${docId}") failed:`, error.message);
  }
}

async function getCurrentIds(tableName, keyField, ownerUserId = null) {
  let query = supabaseAdmin
    .from(tableName)
    .select(keyField);

  const ownerPrefix = getOwnerPrefix(ownerUserId);
  if (ownerPrefix) {
    query = query.like(keyField, `${ownerPrefix}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data || []).map(row => String(row[keyField] || '').trim()).filter(Boolean));
}

async function deleteMissingIds(tableName, keyField, targetIds, ownerUserId = null) {
  const existingIds = await getCurrentIds(tableName, keyField, ownerUserId);
  const toDelete = [...existingIds].filter(id => !targetIds.has(id));

  if (toDelete.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .in(keyField, toDelete);

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertNormalizedRecords(tableName, keyField, records, reason, ownerUserId = null) {
  if (records.length > 0) {
    const { error } = await supabaseAdmin
      .from(tableName)
      .upsert(records, { onConflict: keyField });

    if (error) {
      throw new Error(error.message);
    }
  }

  const targetIds = new Set(records.map(record => String(record[keyField] || '').trim()).filter(Boolean));
  await deleteMissingIds(tableName, keyField, targetIds, ownerUserId);
  await appendHistoryRecord(tableName, { count: records.length, items: records.map(record => record.data) }, reason, ownerUserId);
}

async function getNextOrderValue(tableName, keyField, ownerUserId = null) {
  let query = supabaseAdmin
    .from(tableName)
    .select(`sort_order,${keyField}`)
    .order('sort_order', { ascending: false })
    .limit(1);

  const ownerPrefix = getOwnerPrefix(ownerUserId);
  if (ownerPrefix) {
    query = query.like(keyField, `${ownerPrefix}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const latest = data && data.length > 0 ? data[0] : null;
  if (!Number.isInteger(latest?.sort_order)) {
    return 0;
  }

  return latest.sort_order + 1;
}

async function upsertClassRecord(classId, classData, reason = 'partial-upsert', options = {}) {
  if (!isConnected()) return null;
  if (!isPlainObject(classData)) return null;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedClassId = String(classId || '').trim() || getClassIdFromValue(classData);
  if (!normalizedClassId) return null;
  const scopedClassId = toScopedRecordId(ownerUserId, normalizedClassId);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from(TABLE_CLASSES)
    .select('sort_order')
    .eq('class_id', scopedClassId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
  const order = Number.isInteger(existing?.sort_order)
    ? existing.sort_order
    : await getNextOrderValue(TABLE_CLASSES, 'class_id', ownerUserId);

  const normalizedData = cloneJson(classData);
  if (!normalizedData.id) {
    normalizedData.id = normalizedClassId;
  }

  const record = {
    class_id: scopedClassId,
    sort_order: order,
    updated_at: new Date().toISOString(),
    data: normalizedData
  };

  const { error } = await supabaseAdmin
    .from(TABLE_CLASSES)
    .upsert(record, { onConflict: 'class_id' });

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord('classes', {
    op: 'upsert',
    classId: normalizedClassId,
    item: normalizedData
  }, reason, ownerUserId);

  return normalizedData;
}

async function deleteClassRecord(classId, reason = 'partial-delete', options = {}) {
  if (!isConnected()) return false;

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

async function upsertLessonPlanRecord(planId, lessonPlanData, reason = 'partial-upsert', options = {}) {
  if (!isConnected()) return null;
  if (!isPlainObject(lessonPlanData)) return null;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedPlanId = String(planId || '').trim() || getPlanIdFromValue(lessonPlanData);
  if (!normalizedPlanId) return null;
  const scopedPlanId = toScopedRecordId(ownerUserId, normalizedPlanId);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from(TABLE_LESSON_PLANS)
    .select('sort_order')
    .eq('plan_id', scopedPlanId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
  const order = Number.isInteger(existing?.sort_order)
    ? existing.sort_order
    : await getNextOrderValue(TABLE_LESSON_PLANS, 'plan_id', ownerUserId);

  const normalizedData = cloneJson(lessonPlanData);
  if (!normalizedData.id) {
    normalizedData.id = normalizedPlanId;
  }

  const classIds = Array.isArray(normalizedData.classes)
    ? normalizedData.classes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];

  const record = {
    plan_id: scopedPlanId,
    class_ids: classIds,
    sort_order: order,
    updated_at: new Date().toISOString(),
    data: normalizedData
  };

  const { error } = await supabaseAdmin
    .from(TABLE_LESSON_PLANS)
    .upsert(record, { onConflict: 'plan_id' });

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord('lessonPlans', {
    op: 'upsert',
    planId: normalizedPlanId,
    item: normalizedData
  }, reason, ownerUserId);

  return normalizedData;
}

async function deleteLessonPlanRecord(planId, reason = 'partial-delete', options = {}) {
  if (!isConnected()) return false;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedPlanId = String(planId || '').trim();
  if (!normalizedPlanId) return false;
  const scopedPlanId = toScopedRecordId(ownerUserId, normalizedPlanId);

  const { error, count } = await supabaseAdmin
    .from(TABLE_LESSON_PLANS)
    .delete({ count: 'exact' })
    .eq('plan_id', scopedPlanId);

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord('lessonPlans', {
    op: 'delete',
    planId: normalizedPlanId,
    deleted: Number(count || 0) > 0
  }, reason, ownerUserId);

  return Number(count || 0) > 0;
}

async function upsertNoteRecord(noteId, noteData, reason = 'partial-upsert', options = {}) {
  if (!isConnected()) return null;
  if (!isPlainObject(noteData)) return null;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedNoteId = String(noteId || '').trim() || getNoteIdFromValue(noteData);
  if (!normalizedNoteId) return null;
  const scopedNoteId = toScopedRecordId(ownerUserId, normalizedNoteId);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from(TABLE_NOTES)
    .select('sort_order')
    .eq('note_id', scopedNoteId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
  const order = Number.isInteger(existing?.sort_order)
    ? existing.sort_order
    : await getNextOrderValue(TABLE_NOTES, 'note_id', ownerUserId);

  const normalizedData = cloneJson(noteData);
  if (!normalizedData.id) {
    normalizedData.id = normalizedNoteId;
  }

  const record = {
    note_id: scopedNoteId,
    sort_order: order,
    updated_at: new Date().toISOString(),
    data: normalizedData
  };

  const { error } = await supabaseAdmin
    .from(TABLE_NOTES)
    .upsert(record, { onConflict: 'note_id' });

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord('notes', {
    op: 'upsert',
    noteId: normalizedNoteId,
    item: normalizedData
  }, reason, ownerUserId);

  return normalizedData;
}

async function deleteNoteRecord(noteId, reason = 'partial-delete', options = {}) {
  if (!isConnected()) return false;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedNoteId = String(noteId || '').trim();
  if (!normalizedNoteId) return false;
  const scopedNoteId = toScopedRecordId(ownerUserId, normalizedNoteId);

  const { error, count } = await supabaseAdmin
    .from(TABLE_NOTES)
    .delete({ count: 'exact' })
    .eq('note_id', scopedNoteId);

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord('notes', {
    op: 'delete',
    noteId: normalizedNoteId,
    deleted: Number(count || 0) > 0
  }, reason, ownerUserId);

  return Number(count || 0) > 0;
}

async function connectDB() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_URL.includes('your-project-ref')) {
    console.warn('[Supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured. Running in local-file-only mode.');
    connected = false;
    return false;
  }

  if (supabaseAdmin && connected) {
    return true;
  }

  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: SUPABASE_SCHEMA
      }
    });

    const { error } = await supabaseAdmin
      .from(TABLE_CLASSES)
      .select('class_id', { head: true, count: 'exact' });

    if (error) {
      throw new Error(error.message);
    }

    connected = true;
    console.log(`[Supabase] Connected (${SUPABASE_SCHEMA} schema).`);
    return true;
  } catch (err) {
    console.error('[Supabase] Connection failed:', err.message);
    supabaseAdmin = null;
    connected = false;
    return false;
  }
}

function isConnected() {
  return connected && !!supabaseAdmin;
}

async function loadDoc(docId, options = {}) {
  if (!isConnected()) return null;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return null;

  const tableName = getTableForDocId(normalizedDocId);
  if (!tableName) return null;

  const keyField = normalizedDocId === 'classes'
    ? 'class_id'
    : normalizedDocId === 'lessonPlans'
      ? 'plan_id'
      : 'note_id';

  let query = supabaseAdmin
    .from(tableName)
    .select(`data,${keyField},sort_order`)
    .order('sort_order', { ascending: true })
    .order(keyField, { ascending: true });

  const ownerPrefix = getOwnerPrefix(ownerUserId);
  if (ownerPrefix) {
    query = query.like(keyField, `${ownerPrefix}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[Supabase] loadDoc("${docId}") failed:`, error.message);
    return null;
  }

  if (normalizedDocId === 'classes') {
    return { classes: (data || []).map(record => cloneJson(record.data || {})) };
  }

  if (normalizedDocId === 'lessonPlans') {
    return { lessonPlans: (data || []).map(record => cloneJson(record.data || {})) };
  }

  return { notes: (data || []).map(record => cloneJson(record.data || {})) };
}

async function saveDoc(docId, data, options = {}) {
  if (!isConnected()) return false;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return false;

  try {
    if (normalizedDocId === 'classes') {
      const classes = normalizeClassesPayload(data);
      if (!classes) return false;
      const records = classes.map((record, index) => toStoredClassRecord(record, index, ownerUserId));
      await upsertNormalizedRecords(TABLE_CLASSES, 'class_id', records, 'save', ownerUserId);
      return true;
    }

    if (normalizedDocId === 'lessonPlans') {
      const lessonPlans = normalizeLessonPlansPayload(data);
      if (!lessonPlans) return false;
      const records = lessonPlans.map((record, index) => toStoredLessonPlanRecord(record, index, ownerUserId));
      await upsertNormalizedRecords(TABLE_LESSON_PLANS, 'plan_id', records, 'save', ownerUserId);
      return true;
    }

    if (normalizedDocId === 'notes') {
      const notes = normalizeNotesPayload(data);
      if (!notes) return false;
      const records = notes.map((record, index) => toStoredNoteRecord(record, index, ownerUserId));
      await upsertNormalizedRecords(TABLE_NOTES, 'note_id', records, 'save', ownerUserId);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[Supabase] saveDoc("${docId}") failed:`, err.message);
    return false;
  }
}

async function closeDB() {
  supabaseAdmin = null;
  connected = false;
}

module.exports = {
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
};
