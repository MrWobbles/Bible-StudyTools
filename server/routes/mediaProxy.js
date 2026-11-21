const express = require('express');
const {
  API_BIBLE_KEY,
  API_BIBLE_BASE_URL,
  UNSPLASH_ACCESS_KEY,
  UNSPLASH_CACHE_TTL_MS
} = require('../config/env');
const { sendApiError } = require('../services/httpHelpers');
const { parseUsfmPassageId } = require('../services/bibleRef');

const router = express.Router();
const unsplashCache = new Map();

router.get('/api/background/random', async (req, res) => {
  if (!UNSPLASH_ACCESS_KEY) {
    return res.status(503).json({ error: 'UNSPLASH_ACCESS_KEY is not configured on the server.' });
  }

  const query = String(req.query.query || 'landscape scenery nature').trim().slice(0, 100);
  const cacheKey = query.toLowerCase();
  const cached = unsplashCache.get(cacheKey);
  if (cached && Date.now() - cached.at < UNSPLASH_CACHE_TTL_MS && req.query.refresh !== '1') {
    return res.json(cached.photo);
  }

  try {
    const url = `https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`Unsplash request failed: ${response.status} ${detail.slice(0, 200)}`);
      return res.status(response.status === 403 ? 429 : 502).json({
        error: 'Unsplash request failed',
        upstreamStatus: response.status
      });
    }
    const data = await response.json();
    const photo = {
      id: data.id,
      url: data.urls?.regular || '',
      thumbUrl: data.urls?.small || '',
      color: data.color || null,
      description: data.alt_description || data.description || '',
      photographer: data.user?.name || '',
      photographerUrl: data.user?.links?.html ? `${data.user.links.html}?utm_source=bible_study_tools&utm_medium=referral` : '',
      photoUrl: data.links?.html ? `${data.links.html}?utm_source=bible_study_tools&utm_medium=referral` : '',
      downloadLocation: data.links?.download_location || ''
    };
    unsplashCache.set(cacheKey, { at: Date.now(), photo });

    // Unsplash API guidelines require reporting a download when a photo is used.
    if (photo.downloadLocation) {
      fetch(photo.downloadLocation, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
    }
    res.json(photo);
  } catch (err) {
    console.error('Error fetching Unsplash photo:', err);
    res.status(502).json({ error: 'Failed to fetch background image' });
  }
});

router.get('/api/bible/bibles', async (req, res) => {
  if (!API_BIBLE_KEY) {
    return res.status(503).json({ error: 'API_BIBLE_KEY is not configured on the server.' });
  }

  try {
    const response = await fetch(`${API_BIBLE_BASE_URL}/bibles`, {
      headers: { 'api-key': API_BIBLE_KEY }
    });

    const body = await response.text();
    res.status(response.status).type('application/json').send(body);
  } catch (err) {
    console.error('Error proxying API.Bible bibles request:', err);
    res.status(500).json({ error: 'Failed to fetch Bible list from API.Bible' });
  }
});

router.get('/api/bible/simple', async (req, res) => {
  const reference = String(req.query.reference || '').trim();
  const translation = String(req.query.translation || 'web').trim().toLowerCase();

  if (!reference || reference.length > 200 || !/^[a-z0-9-]{1,20}$/.test(translation)) {
    return res.status(400).json({ error: 'valid reference and translation are required' });
  }

  try {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(translation)}`;
    const response = await fetch(url);
    const body = await response.text();
    res.status(response.status).type('application/json').send(body);
  } catch (err) {
    console.error('Error proxying bible-api.com request:', err);
    res.status(502).json({ error: 'Failed to fetch passage from bible-api.com' });
  }
});

router.get('/api/bible/passages', async (req, res) => {
  if (!API_BIBLE_KEY) {
    return res.status(503).json({ error: 'API_BIBLE_KEY is not configured on the server.' });
  }

  const bibleId = String(req.query.bibleId || '').trim();
  const reference = String(req.query.reference || '').trim();

  if (!bibleId || !reference) {
    return res.status(400).json({ error: 'bibleId and reference are required' });
  }

  try {
    const passageId = parseUsfmPassageId(reference);
    if (passageId) {
      const passageUrl = `${API_BIBLE_BASE_URL}/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(passageId)}?content-type=html&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true`;
      const passageRes = await fetch(passageUrl, {
        headers: { 'api-key': API_BIBLE_KEY }
      });
      if (passageRes.ok) {
        const body = await passageRes.text();
        return res.status(passageRes.status).type('application/json').send(body);
      }
    }

    const searchUrl = `${API_BIBLE_BASE_URL}/bibles/${encodeURIComponent(bibleId)}/search?query=${encodeURIComponent(reference)}`;
    const response = await fetch(searchUrl, {
      headers: { 'api-key': API_BIBLE_KEY }
    });

    const body = await response.text();
    res.status(response.status).type('application/json').send(body);
  } catch (err) {
    console.error('Error proxying API.Bible passages request:', err);
    res.status(500).json({ error: 'Failed to fetch passage from API.Bible' });
  }
});

router.get('/api/music/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from iTunes' });
    }
    const data = await response.json();
    const results = (data.results || []).map(track => ({
      id: String(track.trackId),
      title: track.trackName,
      artist: track.artistName,
      thumbnail: track.artworkUrl100 || track.artworkUrl60,
      url: track.trackViewUrl
    }));
    res.json({ results });
  } catch (err) {
    sendApiError(res, err, 'Search failed');
  }
});

module.exports = router;
