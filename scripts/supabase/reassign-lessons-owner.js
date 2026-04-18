/**
 * reassign-lessons-owner.js
 *
 * Reassigns all lesson-related records to a specific owner scope by rewriting
 * primary keys to: <ownerUserId>::<baseId>
 *
 * Targets tables:
 *   - bst_classes (class_id)
 *   - bst_lesson_plans (plan_id)
 *
 * Usage:
 *   node scripts/supabase/reassign-lessons-owner.js --owner <uuid> [--apply]
 *
 * By default this script runs in dry-run mode. Pass --apply to persist changes.
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const TABLE_CLASSES = String(process.env.SUPABASE_CLASSES_TABLE || 'bst_classes').trim();
const TABLE_LESSON_PLANS = String(process.env.SUPABASE_LESSON_PLANS_TABLE || 'bst_lesson_plans').trim();

const OWNER_SCOPE_SEPARATOR = '::';
const PAGE_SIZE = 1000;

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeOwnerUserId(value) {
  return String(value || '').trim();
}

function splitScopedId(value) {
  const raw = String(value || '').trim();
  if (!raw) return { owner: '', baseId: '' };
  const splitIndex = raw.indexOf(OWNER_SCOPE_SEPARATOR);
  if (splitIndex === -1) return { owner: '', baseId: raw };

  return {
    owner: raw.slice(0, splitIndex).trim(),
    baseId: raw.slice(splitIndex + OWNER_SCOPE_SEPARATOR.length).trim()
  };
}

function toScopedId(ownerUserId, value) {
  const { baseId } = splitScopedId(value);
  return `${ownerUserId}${OWNER_SCOPE_SEPARATOR}${baseId}`;
}

function toIso(value) {
  const dt = new Date(String(value || '').trim());
  if (Number.isNaN(dt.getTime())) {
    return '1970-01-01T00:00:00.000Z';
  }
  return dt.toISOString();
}

async function fetchAllRows(client, tableName, fields) {
  const all = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from(tableName)
      .select(fields)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed reading ${tableName}: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return all;
}

function choosePreferredRecord(existing, candidate) {
  if (!existing) return candidate;

  const existingUpdated = toIso(existing.updated_at);
  const candidateUpdated = toIso(candidate.updated_at);
  if (candidateUpdated > existingUpdated) return candidate;
  if (candidateUpdated < existingUpdated) return existing;

  const existingSort = Number.isInteger(existing.sort_order) ? existing.sort_order : -1;
  const candidateSort = Number.isInteger(candidate.sort_order) ? candidate.sort_order : -1;
  if (candidateSort > existingSort) return candidate;

  return existing;
}

function planClassRows(rows, ownerUserId) {
  const upsertById = new Map();
  const deleteIds = new Set();

  for (const row of rows) {
    const sourceId = String(row.class_id || '').trim();
    if (!sourceId) continue;

    const targetId = toScopedId(ownerUserId, sourceId);
    const rewritten = {
      class_id: targetId,
      sort_order: Number.isInteger(row.sort_order) ? row.sort_order : 0,
      updated_at: row.updated_at || new Date().toISOString(),
      data: row.data || {}
    };

    const preferred = choosePreferredRecord(upsertById.get(targetId), rewritten);
    upsertById.set(targetId, preferred);

    if (sourceId !== targetId) {
      deleteIds.add(sourceId);
    }
  }

  return {
    upserts: [...upsertById.values()],
    deleteIds: [...deleteIds]
  };
}

function planLessonPlanRows(rows, ownerUserId) {
  const upsertById = new Map();
  const deleteIds = new Set();

  for (const row of rows) {
    const sourceId = String(row.plan_id || '').trim();
    if (!sourceId) continue;

    const targetId = toScopedId(ownerUserId, sourceId);
    const rewritten = {
      plan_id: targetId,
      class_ids: Array.isArray(row.class_ids) ? row.class_ids : [],
      sort_order: Number.isInteger(row.sort_order) ? row.sort_order : 0,
      updated_at: row.updated_at || new Date().toISOString(),
      data: row.data || {}
    };

    const preferred = choosePreferredRecord(upsertById.get(targetId), rewritten);
    upsertById.set(targetId, preferred);

    if (sourceId !== targetId) {
      deleteIds.add(sourceId);
    }
  }

  return {
    upserts: [...upsertById.values()],
    deleteIds: [...deleteIds]
  };
}

async function upsertInBatches(client, tableName, keyField, rows) {
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const chunk = rows.slice(i, i + PAGE_SIZE);
    if (chunk.length === 0) continue;

    const { error } = await client
      .from(tableName)
      .upsert(chunk, { onConflict: keyField });

    if (error) {
      throw new Error(`Failed upserting ${tableName}: ${error.message}`);
    }
  }
}

async function deleteInBatches(client, tableName, keyField, ids) {
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const chunk = ids.slice(i, i + PAGE_SIZE);
    if (chunk.length === 0) continue;

    const { error } = await client
      .from(tableName)
      .delete()
      .in(keyField, chunk);

    if (error) {
      throw new Error(`Failed deleting from ${tableName}: ${error.message}`);
    }
  }
}

(async () => {
  const ownerUserId = normalizeOwnerUserId(getArgValue('--owner'));
  const apply = hasFlag('--apply');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exitCode = 1;
    return;
  }

  if (!ownerUserId) {
    console.error('ERROR: Missing --owner <uuid>');
    process.exitCode = 1;
    return;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const classRows = await fetchAllRows(client, TABLE_CLASSES, 'class_id,sort_order,updated_at,data');
  const lessonPlanRows = await fetchAllRows(client, TABLE_LESSON_PLANS, 'plan_id,class_ids,sort_order,updated_at,data');

  const classPlan = planClassRows(classRows, ownerUserId);
  const lessonPlanPlan = planLessonPlanRows(lessonPlanRows, ownerUserId);

  console.log('Reassignment plan:');
  console.log(`  classes read: ${classRows.length}`);
  console.log(`  classes upsert: ${classPlan.upserts.length}`);
  console.log(`  classes delete: ${classPlan.deleteIds.length}`);
  console.log(`  lessonPlans read: ${lessonPlanRows.length}`);
  console.log(`  lessonPlans upsert: ${lessonPlanPlan.upserts.length}`);
  console.log(`  lessonPlans delete: ${lessonPlanPlan.deleteIds.length}`);

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to persist changes.');
    return;
  }

  await upsertInBatches(client, TABLE_CLASSES, 'class_id', classPlan.upserts);
  await upsertInBatches(client, TABLE_LESSON_PLANS, 'plan_id', lessonPlanPlan.upserts);

  await deleteInBatches(client, TABLE_CLASSES, 'class_id', classPlan.deleteIds);
  await deleteInBatches(client, TABLE_LESSON_PLANS, 'plan_id', lessonPlanPlan.deleteIds);

  const ownerPrefix = `${ownerUserId}${OWNER_SCOPE_SEPARATOR}`;
  const { count: classesOwnedCount, error: classesCountError } = await client
    .from(TABLE_CLASSES)
    .select('class_id', { count: 'exact', head: true })
    .like('class_id', `${ownerPrefix}%`);

  if (classesCountError) {
    throw new Error(`Failed counting reassigned classes: ${classesCountError.message}`);
  }

  const { count: lessonPlansOwnedCount, error: lessonPlansCountError } = await client
    .from(TABLE_LESSON_PLANS)
    .select('plan_id', { count: 'exact', head: true })
    .like('plan_id', `${ownerPrefix}%`);

  if (lessonPlansCountError) {
    throw new Error(`Failed counting reassigned lesson plans: ${lessonPlansCountError.message}`);
  }

  console.log('Reassignment complete:');
  console.log(`  owner: ${ownerUserId}`);
  console.log(`  classes now owned: ${Number(classesOwnedCount || 0)}`);
  console.log(`  lessonPlans now owned: ${Number(lessonPlansOwnedCount || 0)}`);
})();
