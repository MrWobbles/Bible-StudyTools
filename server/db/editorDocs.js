/**
 * server/db/editorDocs.js - Document-level load/save and optimistic-revision editor saves.
 */

const {
  TABLE_CLASSES,
  TABLE_LESSON_PLANS,
  TABLE_NOTES,
  cloneJson,
  normalizeOwnerUserId,
  toScopedRecordId,
  getOwnerPrefix,
  normalizeDocId,
  getTableForDocId,
  isConnected,
  getClient,
  appendHistoryRecord,
  upsertNormalizedRecords
} = require('./client');
const { normalizeClassesPayload, toStoredClassRecord } = require('./classes');
const { normalizeLessonPlansPayload, toStoredLessonPlanRecord } = require('./lessonPlans');
const { normalizeNotesPayload, toStoredNoteRecord } = require('./notes');
const { recordEditorVersion } = require('./versions');

const DOC_SAVE_CONFIG = {
  classes: {
    tableName: TABLE_CLASSES,
    keyField: 'class_id',
    normalizePayload: normalizeClassesPayload,
    toStoredRecord: toStoredClassRecord
  },
  lessonPlans: {
    tableName: TABLE_LESSON_PLANS,
    keyField: 'plan_id',
    normalizePayload: normalizeLessonPlansPayload,
    toStoredRecord: toStoredLessonPlanRecord
  },
  notes: {
    tableName: TABLE_NOTES,
    keyField: 'note_id',
    normalizePayload: normalizeNotesPayload,
    toStoredRecord: toStoredNoteRecord
  }
};

async function loadDoc(docId, options = {}) {
  if (!isConnected()) return null;

  const supabaseAdmin = getClient();
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return null;

  const tableName = getTableForDocId(normalizedDocId);
  if (!tableName) return null;

  const keyField = DOC_SAVE_CONFIG[normalizedDocId].keyField;

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

  return { [normalizedDocId]: (data || []).map(record => cloneJson(record.data || {})) };
}

async function getEditorRecord(docId, recordId, options = {}) {
  if (!isConnected()) return null;
  options = options || {};

  const normalizedDocId = normalizeDocId(docId);
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedDocId || !normalizedRecordId || normalizedDocId === 'lessonPlans') return null;

  const supabaseAdmin = getClient();
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);
  const tableName = getTableForDocId(normalizedDocId);
  const keyField = normalizedDocId === 'classes' ? 'class_id' : 'note_id';
  const ownerPrefix = getOwnerPrefix(ownerUserId);

  const loadMatchingRow = async (matchField, matchValue) => {
    let query = supabaseAdmin
      .from(tableName)
      .select(`data,${keyField},updated_at`)
      .eq(matchField, matchValue)
      .limit(1);

    if (ownerPrefix) {
      query = query.like(keyField, `${ownerPrefix}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  };

  let row = await loadMatchingRow(keyField, toScopedRecordId(ownerUserId, normalizedRecordId));
  if (!row && normalizedDocId === 'classes') {
    row = await loadMatchingRow('data->>classNumber', normalizedRecordId);
  }
  if (!row) return null;

  return {
    document: cloneJson(row.data || {}),
    recordId: String(row[keyField] || ''),
    revision: String(row.updated_at || '')
  };
}

async function saveEditorRecordIfRevision(docId, recordId, expectedRevision, updates, options = {}) {
  if (!isConnected()) return { status: 'unavailable' };
  options = options || {};

  const normalizedDocId = normalizeDocId(docId);
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedRevision = String(expectedRevision || '').trim();
  if (!normalizedDocId || !normalizedRecordId || !normalizedRevision || normalizedDocId === 'lessonPlans') {
    return { status: 'invalid' };
  }

  const supabaseAdmin = getClient();
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);
  const keyField = normalizedDocId === 'classes' ? 'class_id' : 'note_id';
  const current = await getEditorRecord(normalizedDocId, normalizedRecordId, options);
  if (!current) return { status: 'not-found' };
  if (current.revision !== normalizedRevision) {
    return { status: 'conflict', ...current };
  }

  const nextDocument = { ...current.document };
  if (updates.content !== undefined) {
    nextDocument.content = cloneJson(updates.content);
  }
  if (normalizedDocId === 'classes' && updates.generatedOutline !== undefined) {
    nextDocument.generatedOutline = cloneJson(updates.generatedOutline);
  }
  if (normalizedDocId === 'classes' && updates.outline !== undefined) {
    nextDocument.outline = cloneJson(updates.outline);
  }
  if (normalizedDocId === 'classes' && updates.bibleTranslation !== undefined) {
    nextDocument.bibleTranslation = updates.bibleTranslation;
  }

  const nextRevision = new Date(Math.max(Date.now(), Date.parse(normalizedRevision) + 1)).toISOString();
  const { data, error } = await supabaseAdmin
    .from(getTableForDocId(normalizedDocId))
    .update({ data: nextDocument, updated_at: nextRevision })
    .eq(keyField, current.recordId)
    .eq('updated_at', normalizedRevision)
    .select(`data,${keyField},updated_at`);

  if (error) throw new Error(error.message);
  const savedRow = data?.[0];
  if (!savedRow) {
    const latest = await getEditorRecord(normalizedDocId, normalizedRecordId, options);
    return latest
      ? { status: 'conflict', ...latest }
      : { status: 'not-found' };
  }

  let versionSeq = null;
  if (typeof updates.content?.html === 'string') {
    versionSeq = await recordEditorVersion(
      normalizedDocId,
      current.recordId,
      updates.content.html,
      current.document?.content?.html
    );
  }

  // The full document lives in its own table and in the version chain, so history only notes the event.
  await appendHistoryRecord(normalizedDocId, {
    op: 'editor-content-save',
    recordId: normalizedRecordId,
    versionSeq
  }, 'editor-content-save', ownerUserId);

  return {
    status: 'saved',
    document: cloneJson(savedRow.data || {}),
    recordId: String(savedRow[keyField] || ''),
    revision: String(savedRow.updated_at || nextRevision)
  };
}

async function saveDoc(docId, data, options = {}) {
  if (!isConnected()) return false;

  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);
  const normalizedDocId = normalizeDocId(docId);
  const config = normalizedDocId ? DOC_SAVE_CONFIG[normalizedDocId] : null;
  if (!config) return false;

  try {
    const items = config.normalizePayload(data);
    if (!items) return false;
    const records = items.map((record, index) => config.toStoredRecord(record, index, ownerUserId));
    await upsertNormalizedRecords(config.tableName, config.keyField, records, 'save', ownerUserId);
    return true;
  } catch (err) {
    console.error(`[Supabase] saveDoc("${docId}") failed:`, err.message);
    return false;
  }
}

module.exports = {
  loadDoc,
  saveDoc,
  getEditorRecord,
  saveEditorRecordIfRevision
};
