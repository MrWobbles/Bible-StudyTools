/**
 * server/db/versions.js - Compact editor version history storage and retrieval.
 */

const { isSnapshotSeq, getSnapshotSeq, makePatch, rebuildFromRows } = require('../../editor-versions');
const {
  TABLE_EDITOR_VERSIONS,
  MAX_VERSION_LIST,
  normalizeDocId,
  getClient
} = require('./client');

async function loadVersionHtml(docId, recordId, seq) {
  const supabaseAdmin = getClient();
  const baseSeq = getSnapshotSeq(seq);
  const seqs = [];
  for (let value = baseSeq; value <= seq; value += 1) seqs.push(value);

  const { data, error } = await supabaseAdmin
    .from(TABLE_EDITOR_VERSIONS)
    .select('seq,kind,body,created_at')
    .eq('doc_id', docId)
    .eq('record_id', recordId)
    .in('seq', seqs);
  if (error) throw new Error(error.message);

  const rows = data || [];
  const html = rebuildFromRows(rows, seq);
  if (html === null) return null;
  const last = rows.find(row => row.seq === seq);
  return { seq, html, createdAt: String(last?.created_at || '') };
}

async function getLatestVersionSeq(docId, recordId) {
  const supabaseAdmin = getClient();
  const { data, error } = await supabaseAdmin
    .from(TABLE_EDITOR_VERSIONS)
    .select('seq')
    .eq('doc_id', docId)
    .eq('record_id', recordId)
    .order('seq', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ? data[0].seq : null;
}

async function insertVersionRow(docId, recordId, seq, kind, body) {
  const supabaseAdmin = getClient();
  const { error } = await supabaseAdmin
    .from(TABLE_EDITOR_VERSIONS)
    .insert({
      doc_id: docId,
      record_id: recordId,
      seq,
      kind,
      body,
      bytes: Buffer.byteLength(body, 'utf8'),
      created_at: new Date().toISOString()
    });
  if (error) throw new Error(error.message);
}

// Stores the new html as a snapshot (every 5th version) or a patch from the previous version.
// Failures are logged and never block the save itself.
async function recordEditorVersion(docId, recordId, html, previousHtml) {
  try {
    let latestSeq = await getLatestVersionSeq(docId, recordId);

    if (latestSeq === null) {
      if (typeof previousHtml === 'string' && previousHtml !== html) {
        await insertVersionRow(docId, recordId, 0, 'snapshot', previousHtml);
        latestSeq = 0;
      } else {
        await insertVersionRow(docId, recordId, 0, 'snapshot', html);
        return 0;
      }
    }

    const latest = await loadVersionHtml(docId, recordId, latestSeq);
    if (!latest) {
      console.warn(`[Supabase] Version chain for "${docId}/${recordId}" is incomplete; skipping version.`);
      return null;
    }
    if (latest.html === html) return latestSeq;

    const nextSeq = latestSeq + 1;
    if (isSnapshotSeq(nextSeq)) {
      await insertVersionRow(docId, recordId, nextSeq, 'snapshot', html);
    } else {
      await insertVersionRow(docId, recordId, nextSeq, 'delta', makePatch(latest.html, html));
    }
    return nextSeq;
  } catch (err) {
    console.warn(`[Supabase] recordEditorVersion("${docId}/${recordId}") failed:`, err.message);
    return null;
  }
}

async function listEditorVersions(docId, recordId, options = {}) {
  const { getEditorRecord } = require('./editorDocs');
  const current = await getEditorRecord(docId, recordId, options);
  if (!current) return null;

  const supabaseAdmin = getClient();
  const { data, error } = await supabaseAdmin
    .from(TABLE_EDITOR_VERSIONS)
    .select('seq,kind,bytes,created_at')
    .eq('doc_id', normalizeDocId(docId))
    .eq('record_id', current.recordId)
    .order('seq', { ascending: false })
    .limit(MAX_VERSION_LIST);
  if (error) throw new Error(error.message);

  return (data || []).map(row => ({
    seq: row.seq,
    kind: row.kind,
    bytes: row.bytes,
    createdAt: String(row.created_at || '')
  }));
}

async function getEditorVersion(docId, recordId, seq, options = {}) {
  const { getEditorRecord } = require('./editorDocs');
  const current = await getEditorRecord(docId, recordId, options);
  if (!current || !Number.isInteger(seq) || seq < 0) return null;
  return loadVersionHtml(normalizeDocId(docId), current.recordId, seq);
}

module.exports = {
  recordEditorVersion,
  listEditorVersions,
  getEditorVersion
};
