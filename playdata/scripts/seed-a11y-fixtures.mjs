#!/usr/bin/env node
/**
 * Seeds a throwaway teacher + 2 students + a dataset/quiz/classroom/live
 * session, so the accessibility test suite (tests/a11y/*) has real,
 * populated screens to scan instead of empty states.
 *
 * Dev/test-only. Uses obviously-fake @playdata.test addresses (a reserved,
 * non-routable TLD — RFC 2606 — so nothing is ever emailed). Writes a
 * manifest of created row/user IDs to .a11y-fixtures.json so
 * scripts/cleanup-a11y-fixtures.mjs can remove everything afterwards.
 *
 * Usage: node --env-file=.env scripts/seed-a11y-fixtures.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const manifest = { authUsers: [], storageObjects: [] };

async function createAuthUser(email, meta) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  manifest.authUsers.push(data.user.id);
  return data.user;
}

async function main() {
  console.log('Seeding a11y fixtures...');

  // ── Teacher ──────────────────────────────────────────────────────────────
  const teacherAuth = await createAuthUser('a11y-teacher@playdata.test', { full_name: 'A11y Test Teacher' });
  const { error: teacherProfileErr } = await admin.from('profiles').upsert({
    id: teacherAuth.id,
    username: 'a11y_teacher',
    email: teacherAuth.email,
    full_name: 'A11y Test Teacher',
    role: 'teacher',
    onboarding_completed: true,
    subject_taught: 'Statistics',
    institution_role: 'Lecturer',
  });
  if (teacherProfileErr) throw new Error(`teacher profile: ${teacherProfileErr.message}`);

  // ── Students ─────────────────────────────────────────────────────────────
  const student1 = await createAuthUser('a11y-student1@playdata.test', { full_name: 'Priya Student' });
  const student2 = await createAuthUser('a11y-student2@playdata.test', { full_name: 'Sam Student' });
  for (const [s, name] of [[student1, 'Priya Student'], [student2, 'Sam Student']]) {
    const { error } = await admin.from('profiles').upsert({
      id: s.id,
      username: s.email.split('@')[0].replace(/[^a-z0-9]/g, '_'),
      email: s.email,
      full_name: name,
      role: 'student',
      onboarding_completed: true,
    });
    if (error) throw new Error(`student profile ${s.email}: ${error.message}`);
  }

  // ── Dataset + CSV in storage ────────────────────────────────────────────
  const csv = 'player,score,team\nAda,88,Blue\nGrace,92,Red\nAlan,76,Blue\nKatherine,95,Red\nBarbara,81,Blue\nDorothy,69,Red\n';
  const storagePath = `a11y-test/${teacherAuth.id}/players.csv`;
  const { error: uploadErr } = await admin.storage.from('datasets').upload(storagePath, new Blob([csv], { type: 'text/csv' }), { upsert: true });
  if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`);
  manifest.storageObjects.push(storagePath);

  const schema = { columns: [{ name: 'player', type: 'string' }, { name: 'score', type: 'number' }, { name: 'team', type: 'string' }] };
  const { data: dataset, error: dsErr } = await admin.from('datasets').insert({
    teacher_id: teacherAuth.id,
    name: 'A11y Test — Player Scores',
    description: 'Seed dataset for accessibility audit',
    schema,
    row_count: 6,
    storage_path: storagePath,
  }).select('id').single();
  if (dsErr) throw new Error(`dataset insert: ${dsErr.message}`);

  await admin.from('dataset_visible_columns').insert(
    schema.columns.map((c) => ({ dataset_id: dataset.id, column_name: c.name }))
  );

  // ── Visualisation ────────────────────────────────────────────────────────
  const { data: vis, error: visErr } = await admin.from('visualisations').insert({
    teacher_id: teacherAuth.id,
    dataset_id: dataset.id,
    name: 'Team split (pie)',
    chart_type: 'pie',
    config: { title: 'Team split', xAxis: 'team', yAxis: '', aggregation: 'count', filterColumn: '', filterOperator: '==', filterValue: '' },
  }).select('id').single();
  if (visErr) throw new Error(`visualisation insert: ${visErr.message}`);

  // ── Quiz + questions ─────────────────────────────────────────────────────
  const { data: quiz, error: quizErr } = await admin.from('quizzes').insert({
    teacher_id: teacherAuth.id,
    dataset_id: dataset.id,
    title: 'A11y Test Quiz',
    description: 'Seed quiz for accessibility audit',
  }).select('id').single();
  if (quizErr) throw new Error(`quiz insert: ${quizErr.message}`);

  const { data: questions, error: qErr } = await admin.from('questions').insert([
    { quiz_id: quiz.id, order_index: 0, text: 'Which team has more players in the dataset?', type: 'mcq', options: ['Blue', 'Red', 'Tie'], correct_answer: 'Red', dataset_column: 'team', topic_tag: 'categorical-data', time_limit_secs: 30 },
    { quiz_id: quiz.id, order_index: 1, text: "What is Ada's score?", type: 'numerical', correct_answer: '88', answer_tolerance: 0, dataset_column: 'score', topic_tag: 'reading-values', time_limit_secs: 20 },
    { quiz_id: quiz.id, order_index: 2, text: 'In one sentence, describe the score distribution.', type: 'short_answer', correct_answer: 'varied', topic_tag: 'distribution', time_limit_secs: 45 },
  ]).select('id, order_index');
  if (qErr) throw new Error(`questions insert: ${qErr.message}`);
  const q0 = questions.find((q) => q.order_index === 0);
  const q1 = questions.find((q) => q.order_index === 1);

  // ── Classroom + roster ───────────────────────────────────────────────────
  const { data: classroom, error: clsErr } = await admin.from('classrooms').insert({
    teacher_id: teacherAuth.id,
    name: 'A11y Test Classroom',
    description: 'Seed classroom for accessibility audit',
  }).select('id').single();
  if (clsErr) throw new Error(`classroom insert: ${clsErr.message}`);

  await admin.from('classroom_students').insert([
    { classroom_id: classroom.id, student_id: student1.id, email: student1.email, status: 'active', joined_at: new Date().toISOString() },
    { classroom_id: classroom.id, student_id: student2.id, email: student2.email, status: 'active', joined_at: new Date().toISOString() },
    { classroom_id: classroom.id, student_id: null, email: 'a11y-invited@playdata.test', status: 'invited' },
  ]);

  // ── Live session (waiting) + participants + responses ───────────────────
  const joinCode = 'A11YAU'.slice(0, 6);
  const { data: session, error: sessErr } = await admin.from('sessions').insert({
    teacher_id: teacherAuth.id,
    classroom_id: classroom.id,
    title: 'A11y Test Live Session',
    join_code: joinCode,
    status: 'waiting',
  }).select('id').single();
  if (sessErr) throw new Error(`session insert: ${sessErr.message}`);

  await admin.from('session_items').insert([
    { session_id: session.id, type: 'quiz', reference_id: quiz.id, order_index: 0 },
    { session_id: session.id, type: 'visualisation', reference_id: vis.id, order_index: 1 },
  ]);

  await admin.from('session_participants').insert([
    { session_id: session.id, student_id: student1.id, score: 40, current_streak: 2, best_streak: 3 },
    { session_id: session.id, student_id: student2.id, score: 25, current_streak: 0, best_streak: 1 },
  ]);

  await admin.from('student_responses').insert([
    { session_id: session.id, question_id: q0.id, student_id: student1.id, answer: 'Red', is_correct: true },
    { session_id: session.id, question_id: q0.id, student_id: student2.id, answer: 'Blue', is_correct: false },
    { session_id: session.id, question_id: q1.id, student_id: student1.id, answer: '88', is_correct: true },
  ]);

  const result = {
    teacherEmail: teacherAuth.email,
    teacherId: teacherAuth.id,
    student1Id: student1.id,
    student2Id: student2.id,
    datasetId: dataset.id,
    visualisationId: vis.id,
    quizId: quiz.id,
    classroomId: classroom.id,
    sessionId: session.id,
  };
  manifest.rows = result;

  writeFileSync(new URL('../.a11y-fixtures.json', import.meta.url), JSON.stringify(manifest, null, 2));
  console.log('Seeded OK:', result);
}

main().catch((err) => { console.error(err); process.exit(1); });
