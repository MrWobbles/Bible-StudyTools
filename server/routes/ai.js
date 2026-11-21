const express = require('express');
const { GEMINI_API_KEY, GEMINI_MODEL } = require('../config/env');
const { requireAuthenticatedAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/api/ai/status', requireAuthenticatedAccess, (_req, res) => {
  res.json({
    configured: Boolean(GEMINI_API_KEY),
    provider: GEMINI_API_KEY ? 'gemini' : null,
    model: GEMINI_API_KEY ? GEMINI_MODEL : null
  });
});

router.post('/api/ai/generate', requireAuthenticatedAccess, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const system = typeof req.body?.system === 'string' ? req.body.system.trim() : '';
  const rawTemp = req.body?.temperature;
  const temperature = typeof rawTemp === 'number' && Number.isFinite(rawTemp)
    ? Math.max(0, Math.min(2, rawTemp))
    : 0.7;

  if (!prompt || prompt.length > 30000) {
    return res.status(400).json({ error: 'A valid prompt (1-30000 chars) is required.' });
  }

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature }
  };
  if (system) {
    payload.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`Gemini API error (${response.status}): ${detail.slice(0, 300)}`);
      let upstreamMessage = '';
      try {
        const parsed = JSON.parse(detail);
        upstreamMessage = typeof parsed?.error?.message === 'string' ? parsed.error.message : '';
      } catch {
        // ignore non-JSON error body
      }
      return res.status(response.status === 429 ? 429 : 502).json({
        error: upstreamMessage || `Gemini API request failed (${response.status})`,
        upstreamStatus: response.status
      });
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
      : '';

    res.json({
      response: text,
      model: GEMINI_MODEL,
      provider: 'gemini'
    });
  } catch (err) {
    console.error('Error calling Gemini API:', err);
    res.status(502).json({ error: 'Failed to connect to Gemini API' });
  }
});

module.exports = router;
