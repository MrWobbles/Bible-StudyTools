const fs = require('fs').promises;
const path = require('path');
const { ROOT_DIR, QUEUE_FILE } = require('../config/env');

// Helper function to load data from local JSON files when Supabase is unavailable
async function loadLocalData(key) {
  try {
    const fileMap = {
      classes: 'data/classes.json',
      lessonplans: 'data/lessonPlans.json',
      notes: 'data/notes.json'
    };
    const filePath = fileMap[key.toLowerCase()];
    if (!filePath) return null;

    const data = await fs.readFile(path.join(ROOT_DIR, filePath), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load local data for "${key}":`, err.message);
    return null;
  }
}

async function getQueueData() {
  try {
    const data = await fs.readFile(QUEUE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // Return default structure if file doesn't exist
    return { preApprovedList: [], queue: [] };
  }
}

async function saveQueueData(data) {
  await fs.writeFile(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  loadLocalData,
  getQueueData,
  saveQueueData
};
