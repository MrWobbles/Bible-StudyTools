const express = require('express');
const {
  isConnected,
  getEditorRecord,
  saveEditorRecordIfRevision,
  listEditorVersions,
  getEditorVersion
} = require('../db');
const { editorSaveSchema, parseBodyWithSchema } = require('../config/schemas');
const { requireAuthenticatedAccess } = require('../middleware/auth');
const { getRequestOwnerOptions, sendApiError } = require('../services/httpHelpers');

const router = express.Router();

router.get('/api/editor/:docType/:recordId', requireAuthenticatedAccess, async (req, res) => {
  const docType = String(req.params.docType || '');
  if (!['classes', 'notes'].includes(docType)) {
    return res.status(400).json({ error: 'Editor document type must be "classes" or "notes".' });
  }
  if (!isConnected()) {
    return res.status(503).json({ error: 'Supabase is disconnected. Editor revisions are unavailable.' });
  }

  try {
    const result = await getEditorRecord(docType, req.params.recordId, getRequestOwnerOptions(req));
    if (!result) {
      return res.status(404).json({ error: 'Editor document not found.' });
    }
    return res.json(result);
  } catch (err) {
    return sendApiError(res, err, 'Failed to load editor document');
  }
});

router.get('/api/editor/:docType/:recordId/versions', requireAuthenticatedAccess, async (req, res) => {
  const docType = String(req.params.docType || '');
  if (!['classes', 'notes'].includes(docType)) {
    return res.status(400).json({ error: 'Editor document type must be "classes" or "notes".' });
  }
  if (!isConnected()) {
    return res.status(503).json({ error: 'Supabase is disconnected. Version history is unavailable.' });
  }

  try {
    const versions = await listEditorVersions(docType, req.params.recordId, getRequestOwnerOptions(req));
    if (!versions) {
      return res.status(404).json({ error: 'Editor document not found.' });
    }
    return res.json({ versions });
  } catch (err) {
    return sendApiError(res, err, 'Failed to load version history');
  }
});

router.get('/api/editor/:docType/:recordId/versions/:seq', requireAuthenticatedAccess, async (req, res) => {
  const docType = String(req.params.docType || '');
  if (!['classes', 'notes'].includes(docType)) {
    return res.status(400).json({ error: 'Editor document type must be "classes" or "notes".' });
  }
  if (!/^\d{1,9}$/.test(String(req.params.seq || ''))) {
    return res.status(400).json({ error: 'Version must be a non-negative integer.' });
  }
  if (!isConnected()) {
    return res.status(503).json({ error: 'Supabase is disconnected. Version history is unavailable.' });
  }

  try {
    const version = await getEditorVersion(
      docType,
      req.params.recordId,
      Number(req.params.seq),
      getRequestOwnerOptions(req)
    );
    if (!version) {
      return res.status(404).json({ error: 'Version not found.' });
    }
    return res.json(version);
  } catch (err) {
    return sendApiError(res, err, 'Failed to load version');
  }
});

router.put('/api/editor/:docType/:recordId', requireAuthenticatedAccess, async (req, res) => {
  const docType = String(req.params.docType || '');
  if (!['classes', 'notes'].includes(docType)) {
    return res.status(400).json({ error: 'Editor document type must be "classes" or "notes".' });
  }
  if (!isConnected()) {
    return res.status(503).json({ error: 'Supabase is disconnected. Editor revisions are unavailable.' });
  }

  const parsed = parseBodyWithSchema(editorSaveSchema, req.body, 'Invalid editor save payload');
  if (!parsed.ok) {
    return res.status(parsed.status).json({ error: parsed.error, details: parsed.details });
  }

  try {
    const result = await saveEditorRecordIfRevision(
      docType,
      req.params.recordId,
      parsed.data.expectedRevision,
      parsed.data,
      getRequestOwnerOptions(req)
    );

    if (result.status === 'conflict') {
      return res.status(409).json({
        error: 'This document changed in another session. Compare versions before saving.',
        latestDocument: result.document,
        latestRevision: result.revision
      });
    }
    if (result.status === 'not-found') {
      return res.status(404).json({ error: 'Editor document not found.' });
    }
    if (result.status === 'unavailable') {
      return res.status(503).json({ error: 'Supabase is disconnected. Editor revisions are unavailable.' });
    }
    if (result.status !== 'saved') {
      return res.status(400).json({ error: 'Editor save requires a valid revision.' });
    }

    return res.json({ success: true, document: result.document, revision: result.revision });
  } catch (err) {
    return sendApiError(res, err, 'Failed to save editor document');
  }
});

module.exports = router;
