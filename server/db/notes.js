/**
 * server/db/notes.js - Note record normalization and persistence helpers.
 */

const {
  TABLE_NOTES,
  cloneJson,
  isPlainObject,
  toScopedRecordId,
  buildRecordId,
  getFirstNonEmptyString,
  upsertScopedRecord,
  deleteScopedRecord
} = require('./client');

const NOTE_ID_FIELDS = ['id', 'noteId', 'slug', 'title'];

const NOTE_RECORD_CONFIG = {
  tableName: TABLE_NOTES,
  keyField: 'note_id',
  docId: 'notes',
  historyIdKey: 'noteId',
  idFields: NOTE_ID_FIELDS
};

function normalizeNotesPayload(data) {
  if (!isPlainObject(data) || !Array.isArray(data.notes)) {
    return null;
  }
  return data.notes.map((item) => (isPlainObject(item) ? cloneJson(item) : { value: item }));
}

function getNoteRecordIdentity(record, index) {
  return getFirstNonEmptyString(record, NOTE_ID_FIELDS) || buildRecordId('note', index);
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

async function upsertNoteRecord(noteId, noteData, reason = 'partial-upsert', options = {}) {
  return upsertScopedRecord(NOTE_RECORD_CONFIG, noteId, noteData, reason, options);
}

async function deleteNoteRecord(noteId, reason = 'partial-delete', options = {}) {
  return deleteScopedRecord(NOTE_RECORD_CONFIG, noteId, reason, options);
}

module.exports = {
  normalizeNotesPayload,
  toStoredNoteRecord,
  upsertNoteRecord,
  deleteNoteRecord
};
