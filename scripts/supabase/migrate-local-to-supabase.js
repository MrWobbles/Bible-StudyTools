/**
 * migrate-local-to-supabase.js
 *
 * Bulk-uploads all local JSON data (classes, lessonPlans, notes) to Supabase.
 * Safe to run multiple times — uses upsert so existing rows are updated, not duplicated.
 *
 * Usage:
 *   node scripts/supabase/migrate-local-to-supabase.js
 */

'use strict';

require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const DATA_DIR = path.resolve(__dirname, '../../assets/data');

const TABLE_CLASSES     = String(process.env.SUPABASE_CLASSES_TABLE      || 'bst_classes').trim();
const TABLE_LESSON_PLANS = String(process.env.SUPABASE_LESSON_PLANS_TABLE || 'bst_lesson_plans').trim();
const TABLE_NOTES       = String(process.env.SUPABASE_NOTES_TABLE         || 'bst_notes').trim();

// ─── helpers ────────────────────────────────────────────────────────────────

function getIdFromRecord(record, index, prefix) {
  const candidates = [record.id, record.classId, record.planId, record.noteId, record.slug, record.title]
    .filter(v => typeof v === 'string' && v.trim());
  return candidates.length > 0 ? candidates[0].trim() : `${prefix}-${index + 1}`;
}

function buildClassRecords(classes) {
  return classes.map((record, index) => ({
    class_id: getIdFromRecord(record, index, 'class'),
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: record
  }));
}

function buildLessonPlanRecords(lessonPlans) {
  return lessonPlans.map((record, index) => ({
    plan_id: getIdFromRecord(record, index, 'lesson-plan'),
    class_ids: Array.isArray(record.classes)
      ? record.classes.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())
      : [],
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: record
  }));
}

function buildNoteRecords(notes) {
  return notes.map((record, index) => ({
    note_id: getIdFromRecord(record, index, 'note'),
    sort_order: index,
    updated_at: new Date().toISOString(),
    data: record
  }));
}

async function readJson(file) {
  const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
  return JSON.parse(raw);
}

async function upsertBatch(client, tableName, keyField, records) {
  if (records.length === 0) {
    console.log(`  [skip] ${tableName} — no records`);
    return;
  }

  // Supabase recommends batches ≤ 1000
  const BATCH = 500;
  let uploaded = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await client
      .from(tableName)
      .upsert(chunk, { onConflict: keyField });

    if (error) {
      throw new Error(`${tableName} upsert failed: ${error.message}`);
    }
    uploaded += chunk.length;
    process.stdout.write(`  [${tableName}] ${uploaded}/${records.length} rows uploaded...\r`);
  }

  console.log(`  [${tableName}] ✓ ${records.length} records uploaded.         `);
}

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exitCode = 1;
    return;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Reading local JSON files...');

  const [classesJson, lessonPlansJson, notesJson] = await Promise.all([
    readJson('classes.json').catch(() => ({ classes: [] })),
    readJson('lessonPlans.json').catch(() => ({ lessonPlans: [] })),
    readJson('notes.json').catch(() => ({ notes: [] }))
  ]);

  const classes     = Array.isArray(classesJson.classes)     ? classesJson.classes     : [];
  const lessonPlans = Array.isArray(lessonPlansJson.lessonPlans) ? lessonPlansJson.lessonPlans : [];
  const notes       = Array.isArray(notesJson.notes)         ? notesJson.notes         : [];

  console.log(`  classes:     ${classes.length} records`);
  console.log(`  lessonPlans: ${lessonPlans.length} records`);
  console.log(`  notes:       ${notes.length} records`);
  console.log('');

  console.log('Uploading to Supabase...');

  await upsertBatch(client, TABLE_CLASSES,      'class_id', buildClassRecords(classes));
  await upsertBatch(client, TABLE_LESSON_PLANS, 'plan_id',  buildLessonPlanRecords(lessonPlans));
  await upsertBatch(client, TABLE_NOTES,        'note_id',  buildNoteRecords(notes));

  console.log('\nMigration complete.');
})();
