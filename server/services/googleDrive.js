const crypto = require('crypto');

const driveFolderCache = new Map();
let driveTokenCache = { token: null, expiresAt: 0 };

function isDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

async function getDriveAccessToken() {
  if (driveTokenCache.token && Date.now() < driveTokenCache.expiresAt - 60000) {
    return driveTokenCache.token;
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(`Google token refresh failed: ${data.error_description || data.error || resp.status}`);
  }
  driveTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return driveTokenCache.token;
}

async function driveRequest(url, token, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Google Drive error: ${data?.error?.message || resp.status}`);
  }
  return data;
}

async function ensureDriveFolder(token, folderName) {
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || 'root';
  const cacheKey = `${parentId}/${folderName}`;
  if (driveFolderCache.has(cacheKey)) return driveFolderCache.get(cacheKey);

  const escaped = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, token);
  let folderId = found.files?.[0]?.id;
  if (!folderId) {
    const created = await driveRequest('https://www.googleapis.com/drive/v3/files?fields=id', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    folderId = created.id;
  }
  driveFolderCache.set(cacheKey, folderId);
  return folderId;
}

async function uploadImageToDrive({ folderName, fileName, mimeType, buffer }) {
  const safeFolder = String(folderName || 'Bible Study Images').replace(/[\\/\x00-\x1f]/g, ' ').trim().slice(0, 120) || 'Bible Study Images';
  const safeFile = String(fileName || 'image').replace(/[\\/\x00-\x1f]/g, '_').trim().slice(0, 150) || 'image';

  const token = await getDriveAccessToken();
  const folderId = await ensureDriveFolder(token, safeFolder);

  const boundary = `bst${crypto.randomBytes(8).toString('hex')}`;
  const metadata = JSON.stringify({ name: safeFile, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const file = await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });

  await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return { id: file.id, url: `https://lh3.googleusercontent.com/d/${file.id}`, folder: safeFolder };
}

module.exports = {
  isDriveConfigured,
  getDriveAccessToken,
  driveRequest,
  ensureDriveFolder,
  uploadImageToDrive
};
