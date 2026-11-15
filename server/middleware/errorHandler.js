const { getHttpStatus } = require('../services/httpHelpers');

function errorHandler(err, req, res, next) {
  console.error('Server error:', err);

  // Body parser limits/format errors
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Try reducing content size or increase server limit.' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const status = getHttpStatus(err);
  const message = status >= 500 ? 'Internal server error' : (err?.message || 'Request failed');
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
