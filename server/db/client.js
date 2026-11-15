/**
 * server/db/client.js - Supabase connection, configuration, and shared record helpers.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_SCHEMA = String(process.env.SUPABASE_DB_SCHEMA || 'public').trim() || 'public';

const TABLE_CLASSES = String(process.env.SUPABASE_CLASSES_TABLE || 'bst_classes').trim();
const TABLE_LESSON_PLANS = String(process.env.SUPABASE_LESSON_PLANS_TABLE || 'bst_lesson_plans').trim();
const TABLE_NOTES = String(process.env.SUPABASE_NOTES_TABLE || 'bst_notes').trim();
const TABLE_HISTORY = String(process.env.SUPABASE_HISTORY_TABLE || 'bst_app_data_history').trim();
const TABLE_EDITOR_VERSIONS = String(process.env.SUPABASE_EDITOR_VERSIONS_TABLE || 'bst_editor_versions').trim();
const MAX_VERSION_LIST = 200;
const SCHEMA_VERSION = 1;
const OWNER_SCOPE_SEPARATOR = '::';

let supabaseAdmin = null;
let connected = false;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function getTableForDocId(docId) {
  if (docId === 'classes') return TABLE_CLASSES;
  if (docId === 'lessonPlans') return TABLE_LESSON_PLANS;
  if (docId === 'notes') return TABLE_NOTES;
  return null;
}

function buildRecordId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function getFirstNonEmptyString(record, fields) {
  if (!isPlainObject(record)) return null;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isConnected() {
  return connected && !!supabaseAdmin;
}

function getClient() {
  return supabaseAdmin;
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

async function closeDB() {
  supabaseAdmin = null;
  connected = false;
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

async function upsertScopedRecord(config, recordId, recordData, reason = 'partial-upsert', options = {}) {
  if (!isConnected()) return null;
  if (!isPlainObject(recordData)) return null;

  const { tableName, keyField, docId, historyIdKey, idFields, buildExtraFields } = config;
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedRecordId = String(recordId || '').trim() || getFirstNonEmptyString(recordData, idFields);
  if (!normalizedRecordId) return null;
  const scopedRecordId = toScopedRecordId(ownerUserId, normalizedRecordId);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from(tableName)
    .select('sort_order')
    .eq(keyField, scopedRecordId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
  const order = Number.isInteger(existing?.sort_order)
    ? existing.sort_order
    : await getNextOrderValue(tableName, keyField, ownerUserId);

  const normalizedData = cloneJson(recordData);
  if (!normalizedData.id) {
    normalizedData.id = normalizedRecordId;
  }

  const extraFields = buildExtraFields ? buildExtraFields(normalizedData) : {};
  const record = {
    [keyField]: scopedRecordId,
    ...extraFields,
    sort_order: order,
    updated_at: new Date().toISOString(),
    data: normalizedData
  };

  const { error } = await supabaseAdmin
    .from(tableName)
    .upsert(record, { onConflict: keyField });

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord(docId, {
    op: 'upsert',
    [historyIdKey]: normalizedRecordId,
    item: normalizedData
  }, reason, ownerUserId);

  return normalizedData;
}

async function deleteScopedRecord(config, recordId, reason = 'partial-delete', options = {}) {
  if (!isConnected()) return false;

  const { tableName, keyField, docId, historyIdKey } = config;
  const ownerUserId = normalizeOwnerUserId(options.ownerUserId);

  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedRecordId) return false;
  const scopedRecordId = toScopedRecordId(ownerUserId, normalizedRecordId);

  const { error, count } = await supabaseAdmin
    .from(tableName)
    .delete({ count: 'exact' })
    .eq(keyField, scopedRecordId);

  if (error) {
    throw new Error(error.message);
  }

  await appendHistoryRecord(docId, {
    op: 'delete',
    [historyIdKey]: normalizedRecordId,
    deleted: Number(count || 0) > 0
  }, reason, ownerUserId);

  return Number(count || 0) > 0;
}

module.exports = {
  TABLE_CLASSES,
  TABLE_LESSON_PLANS,
  TABLE_NOTES,
  TABLE_HISTORY,
  TABLE_EDITOR_VERSIONS,
  MAX_VERSION_LIST,
  cloneJson,
  isPlainObject,
  normalizeOwnerUserId,
  toScopedRecordId,
  getOwnerPrefix,
  normalizeDocId,
  getTableForDocId,
  buildRecordId,
  getFirstNonEmptyString,
  isConnected,
  getClient,
  connectDB,
  closeDB,
  appendHistoryRecord,
  upsertNormalizedRecords,
  upsertScopedRecord,
  deleteScopedRecord
};
