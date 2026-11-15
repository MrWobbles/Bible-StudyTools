const express = require('express');
const path = require('path');
const {
  ROOT_DIR,
  PUBLIC_HTML_FILES,
  PUBLIC_ASSET_DIRS,
  AUTH_PUBLIC_HTML_FILES,
  ADMIN_HTML_FILES
} = require('../config/env');
const { requireAuthenticatedPage, requireAdminPage } = require('../middleware/auth');

const router = express.Router();

PUBLIC_ASSET_DIRS.forEach((dirName) => {
  router.use(`/assets/${dirName}`, express.static(path.join(ROOT_DIR, 'assets', dirName)));
});

// VBS Domain Host Routing
router.use((req, res, next) => {
  const host = String(req.get('host') || '').toLowerCase().split(':')[0];
  const vbsDomains = String(process.env.VBS_DOMAIN || 'vbc.mrwobbles.dev,vbs.mrwobbles.dev')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  if (vbsDomains.includes(host) && req.method === 'GET') {
    // Let API, assets, the control page, and the auth page pass through to normal routing
    const pathStr = req.path;
    const isPassthrough =
      pathStr.startsWith('/api/') ||
      pathStr.startsWith('/assets/') ||
      pathStr.includes('control') ||
      pathStr.includes('auth');

    if (!isPassthrough) {
      return res.sendFile(path.join(ROOT_DIR, 'vbs.html'));
    }
  }
  next();
});

['auth.html', ...PUBLIC_HTML_FILES].forEach((fileName) => {
  const baseName = fileName.replace('.html', '');
  const routePaths = fileName === 'index.html' ? ['/', '/index.html'] : [`/${fileName}`, `/${baseName}`];
  routePaths.forEach((routePath) => {
    const middleware = AUTH_PUBLIC_HTML_FILES.has(fileName)
      ? []
      : ADMIN_HTML_FILES.has(fileName)
        ? [requireAdminPage]
        : [requireAuthenticatedPage];

    router.get(routePath, ...middleware, (req, res) => {
      if (fileName === 'index.html') {
        return res.redirect('/admin');
      }
      return res.sendFile(path.join(ROOT_DIR, fileName));
    });
  });
});

module.exports = router;
