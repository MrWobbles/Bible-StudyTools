const express = require('express');
const crypto = require('crypto');
const { getQueueData, saveQueueData } = require('../services/localData');
const { sendApiError } = require('../services/httpHelpers');

const router = express.Router();

router.get('/api/dj/pre-approved', async (req, res) => {
  try {
    const data = await getQueueData();
    res.json(data.preApprovedList || []);
  } catch (err) {
    sendApiError(res, err, 'Failed to fetch pre-approved list');
  }
});

router.post('/api/dj/pre-approved', async (req, res) => {
  try {
    const { list } = req.body;
    if (!Array.isArray(list)) {
      return res.status(400).json({ error: 'Expected an array of tracks in "list" property' });
    }
    const data = await getQueueData();
    data.preApprovedList = list;
    await saveQueueData(data);
    res.json({ success: true, preApprovedList: list });
  } catch (err) {
    sendApiError(res, err, 'Failed to update pre-approved list');
  }
});

router.get('/api/dj/queue', async (req, res) => {
  try {
    const data = await getQueueData();
    res.json(data.queue || []);
  } catch (err) {
    sendApiError(res, err, 'Failed to fetch queue');
  }
});

router.post('/api/dj/request', async (req, res) => {
  try {
    const { id, title, artist, url, requestedBy, dedication, status } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    const data = await getQueueData();
    const newRequest = {
      id: id || crypto.randomUUID(),
      title,
      artist,
      url: url || null,
      requestedBy: requestedBy || 'Guest',
      dedication: dedication || '',
      status: status || 'pending',
      votes: 0
    };
    data.queue = data.queue || [];
    data.queue.push(newRequest);
    await saveQueueData(data);
    res.json({ success: true, request: newRequest });
  } catch (err) {
    sendApiError(res, err, 'Failed to submit request');
  }
});

router.post('/api/dj/queue/:id/upvote', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getQueueData();
    const song = (data.queue || []).find(q => q.id === id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found in queue' });
    }
    song.votes = (song.votes || 0) + 1;
    await saveQueueData(data);
    res.json({ success: true, votes: song.votes });
  } catch (err) {
    sendApiError(res, err, 'Failed to upvote');
  }
});

router.put('/api/dj/queue/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'played', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const data = await getQueueData();
    const song = (data.queue || []).find(q => q.id === id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found in queue' });
    }
    song.status = status;
    await saveQueueData(data);
    res.json({ success: true, song });
  } catch (err) {
    sendApiError(res, err, 'Failed to update status');
  }
});

router.delete('/api/dj/queue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getQueueData();
    const initialLength = (data.queue || []).length;
    data.queue = (data.queue || []).filter(q => q.id !== id);
    if (data.queue.length === initialLength) {
      return res.status(404).json({ error: 'Song not found in queue' });
    }
    await saveQueueData(data);
    res.json({ success: true });
  } catch (err) {
    sendApiError(res, err, 'Failed to delete song');
  }
});

module.exports = router;
