#!/usr/bin/env node
/**
 * Removes everything scripts/seed-a11y-fixtures.mjs created, using the
 * manifest it wrote to .a11y-fixtures.json. Deletes child rows before
 * parents to satisfy FKs, then the storage object, then the auth users
 * (which cascades the `profiles` row via its FK to auth.users).
 *
 * Usage: node --env-file=.env scripts/cleanup-a11y-fixtures.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const manifestPath = new URL('../.a11y-fixtures.json', import.meta.url);

async function main() {
  if (!existsSync(manifestPath)) {
    console.log('No .a11y-fixtures.json manifest found — nothing to clean up.');
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const r = manifest.rows ?? {};

  if (r.sessionId) {
    await admin.from('student_responses').delete().eq('session_id', r.sessionId);
    await admin.from('session_participants').delete().eq('session_id', r.sessionId);
    await admin.from('session_items').delete().eq('session_id', r.sessionId);
    await admin.from('sessions').delete().eq('id', r.sessionId);
  }
  if (r.classroomId) {
    await admin.from('classroom_students').delete().eq('classroom_id', r.classroomId);
    await admin.from('classrooms').delete().eq('id', r.classroomId);
  }
  if (r.quizId) {
    await admin.from('questions').delete().eq('quiz_id', r.quizId);
    await admin.from('quizzes').delete().eq('id', r.quizId);
  }
  if (r.visualisationId) {
    await admin.from('visualisations').delete().eq('id', r.visualisationId);
  }
  if (r.datasetId) {
    await admin.from('dataset_visible_columns').delete().eq('dataset_id', r.datasetId);
    await admin.from('datasets').delete().eq('id', r.datasetId);
  }
  for (const path of manifest.storageObjects ?? []) {
    await admin.storage.from('datasets').remove([path]);
  }
  for (const userId of manifest.authUsers ?? []) {
    // Deleting the auth user cascades the profiles row (profiles.id -> auth.users.id FK).
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`Could not delete auth user ${userId}: ${error.message}`);
  }

  unlinkSync(manifestPath);
  console.log('Cleanup complete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
