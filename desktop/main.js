const { app, BrowserWindow, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const serveStatic = require('serve-static');

let server;
let serverPort = 0;
let mainWindow = null;
let allWindows = new Set();

function createServer() {
  return new Promise((resolve, reject) => {
    const siteRoot = path.join(process.resourcesPath, 'site');
    const exists = require('fs').existsSync(siteRoot);
    const staticRoot = exists ? siteRoot : path.join(__dirname, '..');

    const appServer = express();
    // Enable static file caching for faster subsequent loads
    appServer.use(serveStatic(staticRoot, {
      index: ['index.html'],
      maxAge: '1d',
      etag: true
    }));

    const http = require('http').createServer(appServer);
    // Use a fixed port in production for faster binding
    const port = app.isPackaged ? 45678 : 0;
    http.listen(port, '127.0.0.1', () => {
      server = http;
      serverPort = http.address().port;
      resolve(serverPort);
    });
    http.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && app.isPackaged) {
        // Fallback to random port if fixed port is taken
        http.listen(0, '127.0.0.1', () => {
          server = http;
          serverPort = http.address().port;
          resolve(serverPort);
        });
      } else {
        reject(err);
      }
    });
  });
}

function createWindow() {
  const packagedIcon = path.join(process.resourcesPath, 'site', 'assets', 'images', 'icon.png');
  const devIcon = path.join(__dirname, '..', 'assets', 'images', 'icon.png');
  const chosenIconPath = app.isPackaged ? packagedIcon : devIcon;
  const iconImg = nativeImage.createFromPath(chosenIconPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconImg,
    show: false, // Don't show until ready
    backgroundColor: '#0f1419', // Match app background to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Need to disable sandbox for localStorage to work across windows
    }
  });

  // Track all windows for IPC relay
  allWindows.add(mainWindow);

  // Show window when ready to avoid blank screen
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const url = `http://localhost:${serverPort}/`;
  mainWindow.loadURL(url);

  // Function to set up handlers for a window
  function setupWindowHandlers(window) {
    // Handle new windows (e.g., View Student/Teacher links)
    window.webContents.setWindowOpenHandler(({ url }) => {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
          }
        }
      };
    });

    // Track new windows for IPC relay and set up their handlers too
    window.webContents.on('did-create-window', (newWindow) => {
      allWindows.add(newWindow);
      setupWindowHandlers(newWindow); // Recursively set up handlers for new windows
      newWindow.on('closed', () => {
        allWindows.delete(newWindow);
      });
    });

    window.on('closed', () => {
      allWindows.delete(window);
      if (window === mainWindow) {
        mainWindow = null;
      }
    });
  }

  // Set up handlers for main window
  setupWindowHandlers(mainWindow);
}

// Start server early, before app is fully ready
let serverPromise = null;
app.on('will-finish-launching', () => {
  serverPromise = createServer().catch(err => {
    console.error('Failed to start local server:', err);
    return null;
  });
});

// Set up IPC relay for cross-window communication
ipcMain.on('broadcast-channel-message', (event, message) => {
  console.log('[IPC Relay] Received message:', message);
  console.log('[IPC Relay] Active windows:', allWindows.size);
  // Relay message to all windows except sender
  let relayed = 0;
  allWindows.forEach(win => {
    if (win && !win.isDestroyed() && win.webContents !== event.sender) {
      console.log('[IPC Relay] Relaying to window');
      win.webContents.send('broadcast-channel-relay', message);
      relayed++;
    }
  });
  console.log('[IPC Relay] Relayed to', relayed, 'windows');
});

// Handle fullscreen toggle requests
ipcMain.on('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

// Handle file save requests
ipcMain.handle('save-file', async (event, filename, data) => {
  try {
    const siteRoot = path.join(process.resourcesPath, 'site');
    const exists = require('fs').existsSync(siteRoot);
    const staticRoot = exists ? siteRoot : path.join(__dirname, '..');

    const filePath = path.join(staticRoot, 'assets', 'data', filename);
    await fs.writeFile(filePath, data, 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save file:', err);
    throw new Error('Failed to save file: ' + err.message);
  }
});

// Handle media upload requests
ipcMain.handle('upload-media', async (event, mediaType, filename, arrayBuffer) => {
  try {
    const siteRoot = path.join(process.resourcesPath, 'site');
    const exists = require('fs').existsSync(siteRoot);
    const staticRoot = exists ? siteRoot : path.join(__dirname, '..');

    // Determine subdirectory based on media type
    let subdir;
    if (mediaType === 'video') subdir = 'video';
    else if (mediaType === 'pdf') subdir = 'documents';
    else if (mediaType === 'images') subdir = 'images';
    else if (mediaType === 'audio') subdir = 'audio';
    else if (mediaType === 'document') subdir = 'documents';
    else subdir = 'media';

    const mediaDir = path.join(staticRoot, 'assets', subdir);

    // Create directory if it doesn't exist
    await fs.mkdir(mediaDir, { recursive: true });

    // Generate safe filename
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(mediaDir, safeFilename);

    // Write the file
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    // Return the relative path
    return `assets/${subdir}/${safeFilename}`;
  } catch (err) {
    console.error('Failed to upload media:', err);
    throw new Error('Failed to upload media: ' + err.message);
  }
});

// Handle media download requests (download from URL and save locally)
ipcMain.handle('download-media', async (event, mediaType, url) => {
  try {
    const siteRoot = path.join(process.resourcesPath, 'site');
    const exists = require('fs').existsSync(siteRoot);
    const staticRoot = exists ? siteRoot : path.join(__dirname, '..');

    // Check if it's a YouTube URL
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    if (isYouTube && mediaType === 'video') {
      // Handle YouTube download using yt-dlp command line tool
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      return new Promise(async (resolve, reject) => {
        try {
          const mediaDir = path.join(staticRoot, 'assets', 'video');
          require('fs').mkdirSync(mediaDir, { recursive: true });

          // Extract video ID from URL
          let videoId;
          if (url.includes('youtube.com')) {
            const urlObj = new URL(url);
            videoId = urlObj.searchParams.get('v');
          } else if (url.includes('youtu.be')) {
            videoId = url.split('/').pop().split('?')[0];
          }

          if (!videoId) {
            reject(new Error('Invalid YouTube URL'));
            return;
          }

          const filename = `youtube_${videoId}.mp4`;
          const filePath = path.join(mediaDir, filename);

          // Check if yt-dlp is installed
          try {
            await execAsync('yt-dlp --version');
          } catch (err) {
            reject(new Error('yt-dlp is not installed. Please install it with: brew install yt-dlp'));
            return;
          }

          // Download video using yt-dlp
          const command = `yt-dlp -f "best[ext=mp4]" -o "${filePath}" "${url}"`;

          await execAsync(command, { maxBuffer: 1024 * 1024 * 100 }); // 100MB buffer
          resolve(`assets/video/${filename}`);
        } catch (err) {
          reject(new Error('Failed to download YouTube video: ' + err.message));
        }
      });
    }

    // Regular file download
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');

    const parsedUrl = urlModule.parse(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        // Determine filename from URL or content-disposition
        let filename = path.basename(parsedUrl.pathname) || 'download';

        // Determine subdirectory
        let subdir;
        if (mediaType === 'video') subdir = 'video';
        else if (mediaType === 'pdf') subdir = 'documents';
        else if (mediaType === 'images') subdir = 'images';
        else if (mediaType === 'audio') subdir = 'audio';
        else if (mediaType === 'document') subdir = 'documents';
        else subdir = 'media';

        const mediaDir = path.join(staticRoot, 'assets', subdir);

        // Create directory
        require('fs').mkdirSync(mediaDir, { recursive: true });

        const filePath = path.join(mediaDir, filename);
        const fileStream = require('fs').createWriteStream(filePath);

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(`assets/${subdir}/${filename}`);
        });

        fileStream.on('error', (err) => {
          require('fs').unlinkSync(filePath);
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  } catch (err) {
    console.error('Failed to download media:', err);
    throw new Error('Failed to download media: ' + err.message);
  }
});


app.whenReady().then(async () => {
  try {
    // Wait for server if not already started
    if (!serverPort && serverPromise) {
      await serverPromise;
    } else if (!serverPort) {
      await createServer();
    }

    if (serverPort) {
      createWindow();
    } else {
      app.quit();
    }
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (server) server.close();
    app.quit();
  }
});