/**
 * db.js - Thin re-export facade for server/db
 */

const path = require('path');

const serverDbDir = path.join(__dirname, 'server', 'db') + path.sep;
for (const cacheKey of Object.keys(require.cache)) {
  if (cacheKey.startsWith(serverDbDir)) {
    delete require.cache[cacheKey];
  }
}

module.exports = require('./server/db');
