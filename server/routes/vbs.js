const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { ROOT_DIR, TABLE_VBS_SCENES } = require('../config/env');
const { requireAuthenticatedAccess } = require('../middleware/auth');
const { supabaseServiceClient } = require('../services/supabaseClient');
const { sendApiError } = require('../services/httpHelpers');

const router = express.Router();
let vbsClients = [];

router.get('/api/vbs/scenes', requireAuthenticatedAccess, async (req, res) => {
  if (!supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase is disconnected. Cannot fetch VBS scenes.' });
  }

  try {
    const { data, error } = await supabaseServiceClient
      .from(TABLE_VBS_SCENES)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    res.json({ success: true, scenes: data || [] });
  } catch (err) {
    sendApiError(res, err, 'Failed to fetch scenes');
  }
});

router.post('/api/vbs/scenes', requireAuthenticatedAccess, async (req, res) => {
  if (!supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase is disconnected.' });
  }

  try {
    const { title, video_url, sound_effects, display_texts, sort_order, script_content, script_links, google_doc_url } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Scene title is required' });
    }

    const { data, error } = await supabaseServiceClient
      .from(TABLE_VBS_SCENES)
      .insert([{
        title,
        video_url: video_url || null,
        sound_effects: Array.isArray(sound_effects) ? sound_effects : [],
        display_texts: Array.isArray(display_texts) ? display_texts : [],
        script_content: script_content || '',
        script_links: Array.isArray(script_links) ? script_links : [],
        google_doc_url: google_doc_url || null,
        sort_order: typeof sort_order === 'number' ? sort_order : 0
      }])
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);

    res.json({ success: true, scene: data });
  } catch (err) {
    sendApiError(res, err, 'Failed to create scene');
  }
});

router.put('/api/vbs/scenes/:id', requireAuthenticatedAccess, async (req, res) => {
  if (!supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase is disconnected.' });
  }

  try {
    const { id } = req.params;
    const { title, video_url, sound_effects, display_texts, sort_order, script_content, script_links, google_doc_url } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (video_url !== undefined) updateData.video_url = video_url;
    if (sound_effects !== undefined) updateData.sound_effects = Array.isArray(sound_effects) ? sound_effects : [];
    if (display_texts !== undefined) updateData.display_texts = Array.isArray(display_texts) ? display_texts : [];
    if (script_content !== undefined) updateData.script_content = script_content || '';
    if (script_links !== undefined) updateData.script_links = Array.isArray(script_links) ? script_links : [];
    if (google_doc_url !== undefined) updateData.google_doc_url = google_doc_url || null;
    if (typeof sort_order === 'number') updateData.sort_order = sort_order;

    const { data, error } = await supabaseServiceClient
      .from(TABLE_VBS_SCENES)
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Scene not found' });

    res.json({ success: true, scene: data });
  } catch (err) {
    sendApiError(res, err, 'Failed to update scene');
  }
});

router.delete('/api/vbs/scenes/:id', requireAuthenticatedAccess, async (req, res) => {
  if (!supabaseServiceClient) {
    return res.status(503).json({ error: 'Supabase is disconnected.' });
  }

  try {
    const { id } = req.params;
    const { error } = await supabaseServiceClient
      .from(TABLE_VBS_SCENES)
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    res.json({ success: true });
  } catch (err) {
    sendApiError(res, err, 'Failed to delete scene');
  }
});

router.get('/api/vbs/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  vbsClients.push(res);

  req.on('close', () => {
    vbsClients = vbsClients.filter(client => client !== res);
  });
});

router.post('/api/vbs/command', requireAuthenticatedAccess, (req, res) => {
  const { type, payload } = req.body;
  if (!type) return res.status(400).json({ error: 'Command type required' });

  const eventData = JSON.stringify({ type, payload });
  vbsClients.forEach(client => {
    client.write(`data: ${eventData}\n\n`);
  });

  res.json({ success: true, clientsNotified: vbsClients.length });
});

router.get('/api/vbs/media', requireAuthenticatedAccess, async (req, res) => {
  try {
    const videoDir = path.join(ROOT_DIR, 'assets', 'video');
    const audioDir = path.join(ROOT_DIR, 'assets', 'audio');

    let videos = [];
    let audio = [];

    try {
      const vFiles = await fs.readdir(videoDir);
      videos = vFiles.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.ogg') || f.endsWith('.mov'));
    } catch (e) { }

    try {
      const aFiles = await fs.readdir(audioDir);
      audio = aFiles.filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg') || f.endsWith('.m4a'));
    } catch (e) { }

    res.json({ success: true, videos, audio });
  } catch (err) {
    sendApiError(res, err, 'Failed to fetch media');
  }
});

module.exports = router;
