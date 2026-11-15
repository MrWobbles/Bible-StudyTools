/**
 * Bible Study Tools - Web Server with API
 * Serves static files and provides API endpoints for saving JSON data and downloading videos
 */

const { app, startServer, stopServer, paths } = require('./server/app');
const { closeDB } = require('./server/db');

if (require.main === module) {
  startServer().catch(async (err) => {
    console.error('Failed to start server:', err);
    await closeDB();
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  stopServer,
  paths
};
