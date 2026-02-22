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

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Data directory
const DATA_DIR = path.join(__dirname, 'assets', 'data');
const VIDEO_DIR = path.join(__dirname, 'assets', 'video');

// ===== API ENDPOINTS =====

/**
 * POST /api/save/classes
 * Save classes.json
 */
app.post('/api/save/classes', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'classes.json');
    const data = req.body;

    // Validate that it has the expected structure
    if (!data.classes || !Array.isArray(data.classes)) {
      return res.status(400).json({ error: 'Invalid classes data structure' });
    }

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log('[✓] Saved classes.json');

    res.json({ success: true, message: 'Classes saved successfully' });
  } catch (err) {
    console.error('Error saving classes:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/save/lessonplans
 * Save lessonPlans.json
 */
app.post('/api/save/lessonplans', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'lessonPlans.json');
    const data = req.body;

    // Validate that it has the expected structure
    if (!data.lessonPlans || !Array.isArray(data.lessonPlans)) {
      return res.status(400).json({ error: 'Invalid lesson plans data structure' });
    }

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log('[✓] Saved lessonPlans.json');

    res.json({ success: true, message: 'Lesson plans saved successfully' });
  } catch (err) {
    console.error('Error saving lesson plans:', err);
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

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ===== START SERVER =====

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Bible Study Tools - Web Server       ║
╚════════════════════════════════════════╝

Server running at: http://localhost:${PORT}
Static files: ./
Data saved to: ${DATA_DIR}

Open in browser:
  - Admin:   http://localhost:${PORT}/admin.html
  - Student: http://localhost:${PORT}/student.html
  - Teacher: http://localhost:${PORT}/teacher.html

API Endpoints:
  - POST /api/save/classes       - Save classes.json
  - POST /api/save/lessonplans   - Save lessonPlans.json
  - GET  /api/status             - Health check

Press Ctrl+C to stop
  `);
});
