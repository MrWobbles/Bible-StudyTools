/**
 * db.js - MongoDB Atlas connection and helper functions
 *
 * Storage layout:
 *   Database : process.env.MONGODB_DB_NAME  (default: "bible-study")
 *   Collections:
 *     - classes:      one document per class
 *     - lessonPlans:  one document per lesson plan
 *     - appDataHistory: append-only snapshots/version records
 *
 * Legacy compatibility:
 *   If old "appData" docs exist ({ _id: "classes" }, { _id: "lessonPlans" })
 *   and normalized collections are empty, we auto-migrate on startup.
 *
 * If MONGODB_URI is not set the module degrades gracefully and every
 * function is a no-op so the server still works with local files only.
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'bible-study';
const LEGACY_COLLECTION = 'appData';
const CLASSES_COLLECTION = 'classes';
const LESSON_PLANS_COLLECTION = 'lessonPlans';
const NOTES_COLLECTION = 'notes';
const HISTORY_COLLECTION = 'appDataHistory';
const SCHEMA_VERSION = 2;

let client = null;
let db = null;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDocId(docId) {
  const normalized = String(docId || '').trim().toLowerCase();
  if (normalized === 'classes') {
    return 'classes';
  }
  if (normalized === 'lessonplans') {
    return 'lessonPlans';
  }
  if (normalized === 'notes') {
    return 'notes';
  }
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

function getNoteRecordIdentity(record, index) {
  const candidates = [record.id, record.noteId, record.slug, record.title]
    .filter(value => typeof value === 'string' && value.trim());
  return candidates.length > 0 ? candidates[0].trim() : buildRecordId('note', index);
}

function toStoredClassRecord(record, index) {
  const classId = getClassRecordIdentity(record, index);
  return {
    classId,
    order: index,
    updatedAt: new Date(),
    data: cloneJson(record)
  };
}

function toStoredLessonPlanRecord(record, index) {
  const planId = getLessonPlanRecordIdentity(record, index);
  return {
    planId,
    classIds: Array.isArray(record.classes)
      ? record.classes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
      : [],
    order: index,
    updatedAt: new Date(),
    data: cloneJson(record)
  };
}

function toStoredNoteRecord(record, index) {
  const noteId = getNoteRecordIdentity(record, index);
  return {
    noteId,
    order: index,
    updatedAt: new Date(),
    data: cloneJson(record)
  };
}

async function appendHistoryRecord(docId, payload, reason = 'save') {
  if (!isConnected()) return;

  try {
    await db.collection(HISTORY_COLLECTION).insertOne({
      docId,
      reason,
      schemaVersion: SCHEMA_VERSION,
      recordedAt: new Date(),
      payload: cloneJson(payload)
    });
  } catch (err) {
    console.warn(`[MongoDB] appendHistoryRecord("${docId}") failed:`, err.message);
  }
}

async function upsertNormalizedRecords(collectionName, keyField, records, reason) {
  const collection = db.collection(collectionName);
  const ids = [];
  const operations = [];

  for (const record of records) {
    const keyValue = record[keyField];
    if (!keyValue) {
      continue;
    }

    ids.push(keyValue);
    operations.push({
      replaceOne: {
        filter: { [keyField]: keyValue },
        replacement: record,
        upsert: true
      }
    });
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }

  await collection.deleteMany({ [keyField]: { $nin: ids } });
  await appendHistoryRecord(collectionName, { count: records.length, items: records.map(record => record.data) }, reason);
}

async function getNextOrderValue(collectionName) {
  const latest = await db.collection(collectionName)
    .find({})
    .sort({ order: -1 })
    .limit(1)
    .toArray();

  if (latest.length === 0 || !Number.isInteger(latest[0].order)) {
    return 0;
  }

  return latest[0].order + 1;
}

async function upsertClassRecord(classId, classData, reason = 'partial-upsert') {
  if (!isConnected()) return null;
  if (!isPlainObject(classData)) return null;

  const normalizedClassId = String(classId || '').trim() || getClassIdFromValue(classData);
  if (!normalizedClassId) return null;

  const collection = db.collection(CLASSES_COLLECTION);
  const existing = await collection.findOne({ classId: normalizedClassId });
  const order = Number.isInteger(existing?.order)
    ? existing.order
    : await getNextOrderValue(CLASSES_COLLECTION);

  const normalizedData = cloneJson(classData);
  if (!normalizedData.id && typeof normalizedClassId === 'string') {
    normalizedData.id = normalizedClassId;
  }

  const record = {
    classId: normalizedClassId,
    order,
    updatedAt: new Date(),
    data: normalizedData
  };

  await collection.replaceOne({ classId: normalizedClassId }, record, { upsert: true });
  await appendHistoryRecord('classes', {
    op: 'upsert',
    classId: normalizedClassId,
    item: normalizedData
  }, reason);

  return normalizedData;
}

async function deleteClassRecord(classId, reason = 'partial-delete') {
  if (!isConnected()) return false;

  const normalizedClassId = String(classId || '').trim();
  if (!normalizedClassId) return false;

  const classDelete = await db.collection(CLASSES_COLLECTION).deleteOne({ classId: normalizedClassId });

  const lessonPlanCollection = db.collection(LESSON_PLANS_COLLECTION);
  const linkedPlans = await lessonPlanCollection.find({ classIds: normalizedClassId }).toArray();
  if (linkedPlans.length > 0) {
    const operations = [];
    const affectedPlanIds = [];

    for (const record of linkedPlans) {
      const updatedClassIds = Array.isArray(record.classIds)
        ? record.classIds.filter(value => value !== normalizedClassId)
        : [];

      const updatedData = cloneJson(record.data || {});
      if (Array.isArray(updatedData.classes)) {
        updatedData.classes = updatedData.classes.filter(value => value !== normalizedClassId);
      }

      operations.push({
        replaceOne: {
          filter: { planId: record.planId },
          replacement: {
            ...record,
            classIds: updatedClassIds,
            updatedAt: new Date(),
            data: updatedData
          }
        }
      });
      affectedPlanIds.push(record.planId);
    }

    if (operations.length > 0) {
      await lessonPlanCollection.bulkWrite(operations, { ordered: false });
      await appendHistoryRecord('lessonPlans', {
        op: 'detach-class',
        classId: normalizedClassId,
        affectedPlanIds
      }, reason);
    }
  }

  await appendHistoryRecord('classes', {
    op: 'delete',
    classId: normalizedClassId,
    deleted: classDelete.deletedCount > 0
  }, reason);

  return classDelete.deletedCount > 0;
}

async function upsertLessonPlanRecord(planId, lessonPlanData, reason = 'partial-upsert') {
  if (!isConnected()) return null;
  if (!isPlainObject(lessonPlanData)) return null;

  const normalizedPlanId = String(planId || '').trim() || getPlanIdFromValue(lessonPlanData);
  if (!normalizedPlanId) return null;

  const collection = db.collection(LESSON_PLANS_COLLECTION);
  const existing = await collection.findOne({ planId: normalizedPlanId });
  const order = Number.isInteger(existing?.order)
    ? existing.order
    : await getNextOrderValue(LESSON_PLANS_COLLECTION);

  const normalizedData = cloneJson(lessonPlanData);
  if (!normalizedData.id && typeof normalizedPlanId === 'string') {
    normalizedData.id = normalizedPlanId;
  }

  const classIds = Array.isArray(normalizedData.classes)
    ? normalizedData.classes.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
    : [];

  const record = {
    planId: normalizedPlanId,
    classIds,
    order,
    updatedAt: new Date(),
    data: normalizedData
  };

  await collection.replaceOne({ planId: normalizedPlanId }, record, { upsert: true });
  await appendHistoryRecord('lessonPlans', {
    op: 'upsert',
    planId: normalizedPlanId,
    item: normalizedData
  }, reason);

  return normalizedData;
}

async function deleteLessonPlanRecord(planId, reason = 'partial-delete') {
  if (!isConnected()) return false;

  const normalizedPlanId = String(planId || '').trim();
  if (!normalizedPlanId) return false;

  const deletion = await db.collection(LESSON_PLANS_COLLECTION).deleteOne({ planId: normalizedPlanId });
  await appendHistoryRecord('lessonPlans', {
    op: 'delete',
    planId: normalizedPlanId,
    deleted: deletion.deletedCount > 0
  }, reason);

  return deletion.deletedCount > 0;
}

async function upsertNoteRecord(noteId, noteData, reason = 'partial-upsert') {
  if (!isConnected()) return null;
  if (!isPlainObject(noteData)) return null;

  const normalizedNoteId = String(noteId || '').trim() || getNoteIdFromValue(noteData);
  if (!normalizedNoteId) return null;

  const collection = db.collection(NOTES_COLLECTION);
  const existing = await collection.findOne({ noteId: normalizedNoteId });
  const order = Number.isInteger(existing?.order)
    ? existing.order
    : await getNextOrderValue(NOTES_COLLECTION);

  const normalizedData = cloneJson(noteData);
  if (!normalizedData.id && typeof normalizedNoteId === 'string') {
    normalizedData.id = normalizedNoteId;
  }

  const record = {
    noteId: normalizedNoteId,
    order,
    updatedAt: new Date(),
    data: normalizedData
  };

  await collection.replaceOne({ noteId: normalizedNoteId }, record, { upsert: true });
  await appendHistoryRecord('notes', {
    op: 'upsert',
    noteId: normalizedNoteId,
    item: normalizedData
  }, reason);

  return normalizedData;
}

async function deleteNoteRecord(noteId, reason = 'partial-delete') {
  if (!isConnected()) return false;

  const normalizedNoteId = String(noteId || '').trim();
  if (!normalizedNoteId) return false;

  const deletion = await db.collection(NOTES_COLLECTION).deleteOne({ noteId: normalizedNoteId });
  await appendHistoryRecord('notes', {
    op: 'delete',
    noteId: normalizedNoteId,
    deleted: deletion.deletedCount > 0
  }, reason);

  return deletion.deletedCount > 0;
}

async function loadFromLegacyDoc(docId) {
  const doc = await db.collection(LEGACY_COLLECTION).findOne({ _id: docId });
  if (!doc) return null;
  const { _id, ...data } = doc;
  return data;
}

async function migrateLegacyDataIfNeeded() {
  if (!isConnected()) return;

  try {
    const [classesCount, lessonPlansCount] = await Promise.all([
      db.collection(CLASSES_COLLECTION).countDocuments(),
      db.collection(LESSON_PLANS_COLLECTION).countDocuments()
    ]);

    if (classesCount > 0 || lessonPlansCount > 0) {
      return;
    }

    const [legacyClasses, legacyLessonPlans] = await Promise.all([
      loadFromLegacyDoc('classes'),
      loadFromLegacyDoc('lessonPlans')
    ]);

    const classRecords = normalizeClassesPayload(legacyClasses);
    if (classRecords && classRecords.length > 0) {
      const records = classRecords.map((record, index) => toStoredClassRecord(record, index));
      await upsertNormalizedRecords(CLASSES_COLLECTION, 'classId', records, 'legacy-migration');
      console.log(`[MongoDB] Migrated ${records.length} class records from legacy appData.`);
    }

    const lessonPlanRecords = normalizeLessonPlansPayload(legacyLessonPlans);
    if (lessonPlanRecords && lessonPlanRecords.length > 0) {
      const records = lessonPlanRecords.map((record, index) => toStoredLessonPlanRecord(record, index));
      await upsertNormalizedRecords(LESSON_PLANS_COLLECTION, 'planId', records, 'legacy-migration');
      console.log(`[MongoDB] Migrated ${records.length} lesson plan records from legacy appData.`);
    }
  } catch (err) {
    console.warn('[MongoDB] Legacy migration skipped due to error:', err.message);
  }
}

// ── Connection ────────────────────────────────────────────────────────────────

/**
 * Connect to MongoDB Atlas.
 * Call once on server startup.  Safe to call multiple times (no-op if already
 * connected or if MONGODB_URI is missing).
 *
 * @returns {boolean} true if the connection succeeded
 */
async function connectDB() {
  if (!MONGODB_URI || MONGODB_URI.includes('username:password')) {
    console.warn('[MongoDB] MONGODB_URI not configured — running in local-file-only mode.');
    console.warn('[MongoDB] Edit .env and restart to enable cloud sync.');
    return false;
  }

  if (client) return true; // already connected

  try {
    // Note: Node.js 17+ uses OpenSSL 3 which has stricter TLS defaults
    // The tlsAllowInvalidCertificates option may be needed for some MongoDB Atlas configurations
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    db = client.db(DB_NAME);

    // Lightweight ping to verify credentials
    await db.command({ ping: 1 });

    await Promise.all([
      db.collection(CLASSES_COLLECTION).createIndex({ classId: 1 }, { unique: true }),
      db.collection(CLASSES_COLLECTION).createIndex({ order: 1 }),
      db.collection(LESSON_PLANS_COLLECTION).createIndex({ planId: 1 }, { unique: true }),
      db.collection(LESSON_PLANS_COLLECTION).createIndex({ classIds: 1 }),
      db.collection(LESSON_PLANS_COLLECTION).createIndex({ order: 1 }),
      db.collection(NOTES_COLLECTION).createIndex({ noteId: 1 }, { unique: true }),
      db.collection(NOTES_COLLECTION).createIndex({ order: 1 }),
      db.collection(HISTORY_COLLECTION).createIndex({ docId: 1, recordedAt: -1 })
    ]);

    await migrateLegacyDataIfNeeded();

    console.log(`[MongoDB] Connected to Atlas — database: "${DB_NAME}"`);
    return true;
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    client = null;
    db = null;
    return false;
  }
}

/**
 * Returns true when an active connection exists.
 */
function isConnected() {
  return db !== null;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Load app data in legacy-compatible shape.
 *
 * @param   {string} docId  'classes', 'lessonPlans', or 'notes'
 * @returns {object|null}   The stored plain-JS object, or null if not found / not connected
 */
async function loadDoc(docId) {
  if (!isConnected()) return null;

  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return null;

  try {
    if (normalizedDocId === 'classes') {
      const records = await db.collection(CLASSES_COLLECTION).find({}).sort({ order: 1, classId: 1 }).toArray();
      if (records.length > 0) {
        return {
          classes: records.map(record => cloneJson(record.data))
        };
      }

      return await loadFromLegacyDoc('classes');
    }

    if (normalizedDocId === 'lessonPlans') {
      const records = await db.collection(LESSON_PLANS_COLLECTION).find({}).sort({ order: 1, planId: 1 }).toArray();
      if (records.length > 0) {
        return {
          lessonPlans: records.map(record => cloneJson(record.data))
        };
      }

      return await loadFromLegacyDoc('lessonPlans');
    }

    if (normalizedDocId === 'notes') {
      const records = await db.collection(NOTES_COLLECTION).find({}).sort({ order: 1, noteId: 1 }).toArray();
      if (records.length > 0) {
        return {
          notes: records.map(record => cloneJson(record.data))
        };
      }

      return { notes: [] };
    }

    return null;
  } catch (err) {
    console.error(`[MongoDB] loadDoc("${docId}") failed:`, err.message);
    return null;
  }
}

/**
 * Save app data using normalized collections.
 *
 * @param  {string} docId  'classes', 'lessonPlans', or 'notes'
 * @param  {object} data   Plain JS object to store
 * @returns {boolean}      true on success
 */
async function saveDoc(docId, data) {
  if (!isConnected()) return false;

  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) return false;

  try {
    if (normalizedDocId === 'classes') {
      const classes = normalizeClassesPayload(data);
      if (!classes) return false;

      const records = classes.map((record, index) => toStoredClassRecord(record, index));
      await upsertNormalizedRecords(CLASSES_COLLECTION, 'classId', records, 'save');
      console.log(`[MongoDB] Saved "${docId}" to normalized classes collection (${records.length} records)`);
      return true;
    }

    if (normalizedDocId === 'lessonPlans') {
      const lessonPlans = normalizeLessonPlansPayload(data);
      if (!lessonPlans) return false;

      const records = lessonPlans.map((record, index) => toStoredLessonPlanRecord(record, index));
      await upsertNormalizedRecords(LESSON_PLANS_COLLECTION, 'planId', records, 'save');
      console.log(`[MongoDB] Saved "${docId}" to normalized lessonPlans collection (${records.length} records)`);
      return true;
    }

    if (normalizedDocId === 'notes') {
      const notes = normalizeNotesPayload(data);
      if (!notes) return false;

      const records = notes.map((record, index) => toStoredNoteRecord(record, index));
      await upsertNormalizedRecords(NOTES_COLLECTION, 'noteId', records, 'save');
      console.log(`[MongoDB] Saved "${docId}" to normalized notes collection (${records.length} records)`);
      return true;
    }

    return true;
  } catch (err) {
    console.error(`[MongoDB] saveDoc("${docId}") failed:`, err.message);
    return false;
  }
}

/**
 * Close the connection (used when shutting down).
 */
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Connection closed.');
  }
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
