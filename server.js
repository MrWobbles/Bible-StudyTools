#!/usr/bin/env node
/**
 * Bible Study Tools - Web Server with API
 * Serves static files and provides API endpoints for saving JSON data and downloading videos
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const ytdl = require('ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - JSON parsing first
// classes.json can exceed the default 100kb when outlines/content are expanded
app.use(express.json({ limit: '10mb' }));

// Data directory
const DATA_DIR = path.join(__dirname, 'assets', 'data');
const VIDEO_DIR = path.join(__dirname, 'assets', 'video');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Backup settings
const MAX_BACKUPS_PER_FILE = 50; // Keep last 50 backups per file
const BACKUP_THROTTLE_MS = 60000; // Don't create backups more than once per minute for same file

// Track last backup time per file to avoid excessive backups
const lastBackupTime = {};

// ===== BACKUP FUNCTIONS =====

/**
 * Create a backup of a file before saving
 */
async function createBackup(fileName, data) {
  try {
    // Ensure backup directory exists
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // Check throttle - don't backup if we just did one
    const now = Date.now();
    const lastTime = lastBackupTime[fileName] || 0;
    if (now - lastTime < BACKUP_THROTTLE_MS) {
      console.log(`[!] Backup throttled for ${fileName} (last backup ${Math.round((now - lastTime) / 1000)}s ago)`);
      return null;
    }

    // Create timestamp-based backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${path.basename(fileName, '.json')}_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Write backup
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf8');
    lastBackupTime[fileName] = now;
    console.log(`[✓] Backup created: ${backupFileName}`);

    // Clean old backups
    await cleanOldBackups(fileName);

    return backupFileName;
  } catch (err) {
    console.error('Error creating backup:', err);
    return null;
  }
}

/**
 * Clean old backups, keeping only the most recent ones
 */
async function cleanOldBackups(fileName) {
  try {
    const baseName = path.basename(fileName, '.json');
    const files = await fs.readdir(BACKUP_DIR);

    // Filter backups for this file
    const backups = files
      .filter(f => f.startsWith(baseName + '_') && f.endsWith('.json'))
      .sort()
      .reverse(); // Newest first (ISO timestamp sorts correctly)

    // Remove old backups beyond the limit
    if (backups.length > MAX_BACKUPS_PER_FILE) {
      const toDelete = backups.slice(MAX_BACKUPS_PER_FILE);
      for (const file of toDelete) {
        await fs.unlink(path.join(BACKUP_DIR, file));
        console.log(`[✓] Deleted old backup: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error cleaning old backups:', err);
  }
}

/**
 * List all backups for a specific file
 */
async function listBackups(fileName) {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const baseName = path.basename(fileName, '.json');
    const files = await fs.readdir(BACKUP_DIR);

    const backups = files
      .filter(f => f.startsWith(baseName + '_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        // Parse timestamp from filename
        const match = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
        const timestamp = match ? match[1].replace(/-/g, (m, i) => i > 9 ? ':' : '-').replace('T', ' ') : 'Unknown';
        return {
          fileName: f,
          timestamp,
          displayName: timestamp.replace('T', ' ').substring(0, 19)
        };
      });

    return backups;
  } catch (err) {
    console.error('Error listing backups:', err);
    return [];
  }
}

// ===== API ENDPOINTS =====

/**
 * POST /api/save/classes
 * Save classes.json with automatic backup
 */
app.post('/api/save/classes', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'classes.json');
    const data = req.body;

    // Validate that it has the expected structure
    if (!data.classes || !Array.isArray(data.classes)) {
      return res.status(400).json({ error: 'Invalid classes data structure' });
    }

    // Create backup before saving
    const backupFile = await createBackup('classes.json', data);

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log('[✓] Saved classes.json');

    res.json({
      success: true,
      message: 'Classes saved successfully',
      backup: backupFile
    });
  } catch (err) {
    console.error('Error saving classes:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/save/lessonplans
 * Save lessonPlans.json with automatic backup
 */
app.post('/api/save/lessonplans', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'lessonPlans.json');
    const data = req.body;

    // Validate that it has the expected structure
    if (!data.lessonPlans || !Array.isArray(data.lessonPlans)) {
      return res.status(400).json({ error: 'Invalid lesson plans data structure' });
    }

    // Create backup before saving
    const backupFile = await createBackup('lessonPlans.json', data);

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log('[✓] Saved lessonPlans.json');

    res.json({
      success: true,
      message: 'Lesson plans saved successfully',
      backup: backupFile
    });
  } catch (err) {
    console.error('Error saving lesson plans:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/backups/:fileName
 * List all backups for a specific file (classes or lessonPlans)
 */
app.get('/api/backups/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;

    // Validate fileName
    if (!['classes', 'lessonPlans'].includes(fileName)) {
      return res.status(400).json({ error: 'Invalid file name. Use "classes" or "lessonPlans"' });
    }

    const backups = await listBackups(`${fileName}.json`);
    res.json({ success: true, backups });
  } catch (err) {
    console.error('Error listing backups:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups/restore
 * Restore a specific backup
 * Body: { backupFileName: "classes_2026-02-28T10-30-00.json" }
 */
app.post('/api/backups/restore', async (req, res) => {
  try {
    const { backupFileName } = req.body;

    if (!backupFileName) {
      return res.status(400).json({ error: 'backupFileName is required' });
    }

    // Validate the backup file name pattern for security
    if (!backupFileName.match(/^(classes|lessonPlans)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.json$/)) {
      return res.status(400).json({ error: 'Invalid backup file name format' });
    }

    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Check if backup exists
    try {
      await fs.stat(backupPath);
    } catch (err) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Read backup content
    const backupContent = await fs.readFile(backupPath, 'utf8');
    const backupData = JSON.parse(backupContent);

    // Determine target file
    const targetFileName = backupFileName.startsWith('classes') ? 'classes.json' : 'lessonPlans.json';
    const targetPath = path.join(DATA_DIR, targetFileName);

    // Read current file and backup it before restoring
    try {
      const currentContent = await fs.readFile(targetPath, 'utf8');
      const currentData = JSON.parse(currentContent);
      await createBackup(targetFileName, currentData);
    } catch (err) {
      // Current file might not exist, that's ok
    }

    // Restore the backup
    await fs.writeFile(targetPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`[✓] Restored ${targetFileName} from ${backupFileName}`);

    res.json({
      success: true,
      message: `Restored ${targetFileName} from backup`,
      restoredFrom: backupFileName
    });
  } catch (err) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/backups/:backupFileName
 * Delete a specific backup
 */
app.delete('/api/backups/:backupFileName', async (req, res) => {
  try {
    const { backupFileName } = req.params;

    // Validate the backup file name pattern for security
    if (!backupFileName.match(/^(classes|lessonPlans)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.json$/)) {
      return res.status(400).json({ error: 'Invalid backup file name format' });
    }

    const backupPath = path.join(BACKUP_DIR, backupFileName);

    await fs.unlink(backupPath);
    console.log(`[✓] Deleted backup: ${backupFileName}`);

    res.json({ success: true, message: 'Backup deleted' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    console.error('Error deleting backup:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/backups/create
 * Manually create a backup of current data
 * Body: { fileName: "classes" or "lessonPlans" }
 */
app.post('/api/backups/create', async (req, res) => {
  try {
    const { fileName } = req.body;

    // Validate fileName
    if (!['classes', 'lessonPlans'].includes(fileName)) {
      return res.status(400).json({ error: 'Invalid file name. Use "classes" or "lessonPlans"' });
    }

    const sourceFile = `${fileName}.json`;
    const sourcePath = path.join(DATA_DIR, sourceFile);

    // Read current data
    const content = await fs.readFile(sourcePath, 'utf8');
    const data = JSON.parse(content);

    // Force create backup (bypass throttle for manual backups)
    delete lastBackupTime[sourceFile];
    const backupFile = await createBackup(sourceFile, data);

    if (backupFile) {
      res.json({
        success: true,
        message: 'Backup created successfully',
        backupFileName: backupFile
      });
    } else {
      res.status(500).json({ error: 'Failed to create backup' });
    }
  } catch (err) {
    console.error('Error creating manual backup:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/status
 * Health check endpoint
 */
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

/**
 * POST /api/download/youtube
 * Download YouTube video
 * Body: { videoUrl: "https://www.youtube.com/watch?v=..." }
 */
app.post('/api/download/youtube', async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    console.log('Download request for:', videoUrl);

    // Validate it's a YouTube URL
    if (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Extract video ID - handle both full URLs and just the ID
    let videoId = videoUrl;

    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      try {
        videoId = ytdl.getVideoID(videoUrl);
      } catch (err) {
        console.error('Error extracting video ID:', err.message);
        return res.status(400).json({ error: 'Could not extract video ID from URL' });
      }
    }

    console.log('Video ID:', videoId);

    const fileName = `${videoId}.mp4`;
    const filePath = path.join(VIDEO_DIR, fileName);

    // Create video directory if it doesn't exist
    try {
      await fs.mkdir(VIDEO_DIR, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }

    // Check if video already downloaded
    try {
      await fs.stat(filePath);
      console.log(`[✓] Video already exists: ${fileName}`);
      return res.json({
        success: true,
        message: 'Video already downloaded',
        fileName,
        localPath: `assets/video/${fileName}`,
      });
    } catch (err) {
      // File doesn't exist, proceed with download
    }

    console.log(`Downloading YouTube video: ${videoId}...`);

    // Construct full URL if just ID was provided
    const fullUrl = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
      ? videoUrl
      : `https://www.youtube.com/watch?v=${videoId}`;

    // Get video info
    let info;
    try {
      info = await ytdl.getInfo(fullUrl);
    } catch (err) {
      console.error('Failed to get video info:', err.message);
      return res.status(500).json({
        error: 'Could not retrieve video information. YouTube may have blocked the request. Try again later or download manually.',
      });
    }

    const duration = parseInt(info.videoDetails.lengthSeconds);

    // Download video
    const writeStream = require('fs').createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      ytdl(fullUrl, {
        quality: 'highest',
        filter: (format) => format.container === 'mp4',
      })
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log(`[✓] Downloaded: ${fileName}`);

    res.json({
      success: true,
      message: 'Video downloaded successfully',
      fileName,
      localPath: `assets/video/${fileName}`,
      duration,
    });
  } catch (err) {
    console.error('YouTube download error:', err);
    res.status(500).json({
      error: 'Failed to download video: ' + err.message,
    });
  }
});

// ===== STATIC FILES (must be after API routes) =====
app.use(express.static('.'));

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Server error:', err);

  // Body parser limits/format errors
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Try reducing content size or increase server limit.' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  const message = err?.message || 'Internal server error';
  res.status(status).json({ error: message });
});

// ===== START SERVER =====

app.listen(PORT, async () => {
  // Ensure backup directory exists on startup
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }

  console.log(`
╔════════════════════════════════════════╗
║   Bible Study Tools - Web Server       ║
╚════════════════════════════════════════╝

Server running at: http://localhost:${PORT}
Static files: ./
Data saved to: ${DATA_DIR}
Backups saved to: ${BACKUP_DIR}

Open in browser:
  - Admin:   http://localhost:${PORT}/admin.html
  - Student: http://localhost:${PORT}/student.html
  - Teacher: http://localhost:${PORT}/teacher.html

API Endpoints:
  - POST /api/save/classes       - Save classes.json (auto-backup)
  - POST /api/save/lessonplans   - Save lessonPlans.json (auto-backup)
  - GET  /api/backups/:fileName  - List backups (classes/lessonPlans)
  - POST /api/backups/restore    - Restore from backup
  - POST /api/backups/create     - Create manual backup
  - DELETE /api/backups/:file    - Delete a backup
  - GET  /api/status             - Health check

Press Ctrl+C to stop
  `);
});
