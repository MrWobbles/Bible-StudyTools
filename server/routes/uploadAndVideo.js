const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const { VIDEO_DIR } = require('../config/env');
const { requireAdminAccess } = require('../middleware/auth');
const { isDriveConfigured, uploadImageToDrive } = require('../services/googleDrive');

const router = express.Router();

/**
 * POST /api/drive/upload-image
 * Upload an editor image to Google Drive in a folder named after the notebook.
 * Body: { folderName, fileName, mimeType, dataBase64 }
 */
router.post('/api/drive/upload-image', requireAdminAccess, async (req, res) => {
  try {
    if (!isDriveConfigured()) {
      return res.status(501).json({ error: 'Google Drive is not configured on the server' });
    }

    const { folderName, fileName, mimeType, dataBase64 } = req.body || {};
    if (typeof dataBase64 !== 'string' || !dataBase64) {
      return res.status(400).json({ error: 'dataBase64 is required' });
    }
    if (typeof mimeType !== 'string' || !/^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(mimeType)) {
      return res.status(400).json({ error: 'Unsupported image type' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (!buffer.length || buffer.length > 7 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image must be between 1 byte and 7 MB' });
    }

    const uploaded = await uploadImageToDrive({ folderName, fileName, mimeType, buffer });
    res.json(uploaded);
  } catch (err) {
    console.error('Drive upload failed:', err.message);
    res.status(502).json({ error: err.message || 'Drive upload failed' });
  }
});

/**
 * POST /api/download/youtube
 * Download YouTube video
 * Body: { videoUrl: "https://www.youtube.com/watch?v=..." }
 */
router.post('/api/download/youtube', requireAdminAccess, async (req, res) => {
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
        localPath: `assets/video/${fileName}`
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
        error: 'Could not retrieve video information. YouTube may have blocked the request. Try again later or download manually.'
      });
    }

    const duration = parseInt(info.videoDetails.lengthSeconds);

    // Download video
    const writeStream = fsSync.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      ytdl(fullUrl, {
        quality: 'highest',
        filter: (format) => format.container === 'mp4'
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
      duration
    });
  } catch (err) {
    console.error('YouTube download error:', err);
    res.status(500).json({
      error: 'Failed to download video'
    });
  }
});

module.exports = router;
