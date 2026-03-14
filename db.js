/**
 * db.js - MongoDB Atlas connection and helper functions
 *
 * Storage layout:
 *   Database : process.env.MONGODB_DB_NAME  (default: "bible-study")
 *   Collection: "appData"
 *   Documents :
 *     { _id: "classes",     classes: [ ... ] }
 *     { _id: "lessonPlans", lessonPlans: [ ... ] }
 *
 * If MONGODB_URI is not set the module degrades gracefully and every
 * function is a no-op so the server still works with local files only.
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI    = process.env.MONGODB_URI;
const DB_NAME        = process.env.MONGODB_DB_NAME || 'bible-study';
const COLLECTION     = 'appData';

let client = null;
let db     = null;

// ── Connection ────────────────────────────────────────────────────────────────

/**
 * Connect to MongoDB Atlas.
 * Call once on server startup.  Safe to call multiple times (no-op if already
 * connected or if MONGODB_URI is missing).
 *
 * @returns {boolean} true if the connection succeeded
 */
async function connectDB() {
  if (!MONGODB_URI || MONGODB_URI.includes('username:password')) {
    console.warn('[MongoDB] MONGODB_URI not configured — running in local-file-only mode.');
    console.warn('[MongoDB] Edit .env and restart to enable cloud sync.');
    return false;
  }

  if (client) return true; // already connected

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);

    // Lightweight ping to verify credentials
    await db.command({ ping: 1 });
    console.log(`[MongoDB] Connected to Atlas — database: "${DB_NAME}"`);
    return true;
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    client = null;
    db     = null;
    return false;
  }
}

/**
 * Returns true when an active connection exists.
 */
function isConnected() {
  return db !== null;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Load a document from the appData collection.
 *
 * @param   {string} docId  'classes' or 'lessonPlans'
 * @returns {object|null}   The stored plain-JS object, or null if not found / not connected
 */
async function loadDoc(docId) {
  if (!isConnected()) return null;

  try {
    const doc = await db.collection(COLLECTION).findOne({ _id: docId });
    if (!doc) return null;

    // Strip the MongoDB _id field before returning
    const { _id, ...data } = doc;
    return data;
  } catch (err) {
    console.error(`[MongoDB] loadDoc("${docId}") failed:`, err.message);
    return null;
  }
}

/**
 * Save (upsert) a document to the appData collection.
 *
 * @param  {string} docId  'classes' or 'lessonPlans'
 * @param  {object} data   Plain JS object to store (the _id field is added automatically)
 * @returns {boolean}      true on success
 */
async function saveDoc(docId, data) {
  if (!isConnected()) return false;

  try {
    await db.collection(COLLECTION).replaceOne(
      { _id: docId },
      { _id: docId, ...data },
      { upsert: true }
    );
    console.log(`[MongoDB] Saved "${docId}"`);
    return true;
  } catch (err) {
    console.error(`[MongoDB] saveDoc("${docId}") failed:`, err.message);
    return false;
  }
}

/**
 * Close the connection (used when shutting down).
 */
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db     = null;
    console.log('[MongoDB] Connection closed.');
  }
}

module.exports = { connectDB, isConnected, loadDoc, saveDoc, closeDB };
