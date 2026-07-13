import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

type QuestionType = 'mcq' | 'short_answer' | 'numerical';
const VALID_TYPES = new Set<QuestionType>(['mcq', 'short_answer', 'numerical']);
const VALID_STATUS = new Set(['draft', 'in_progress', 'assigned', 'completed']);

interface QuestionInput {
  order_index?: number;
  text: string;
  type: QuestionType;
  options?: string[] | null;
  correct_answer: string;
  answer_tolerance?: number | string | null;
  dataset_column?: string | null;
  visualisation_id?: string | null;
  explanation?: string | null;
  time_limit_secs?: number;
}

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookies: string[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' })); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookies.push(serializeCookie(name, value, options))); },
      },
    }
  );
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function buildQuestionRow(q: QuestionInput, quizId: string, idx: number) {
  return {
    quiz_id: quizId,
    order_index: q.order_index ?? idx,
    text: q.text,
    type: q.type,
    options: q.type === 'mcq' ? (q.options ?? null) : null,
    correct_answer: q.correct_answer,
    answer_tolerance: q.type === 'numerical'
      ? (q.answer_tolerance != null ? Number(q.answer_tolerance) : null)
      : null,
    dataset_column: q.dataset_column || null,
    visualisation_id: q.visualisation_id || null,
    explanation: q.explanation || null,
    time_limit_secs: q.time_limit_secs ?? 30,
  };
}

function validateForPublish(questions: QuestionInput[]): string[] {
  const errs: string[] = [];
  if (questions.length === 0) errs.push('Add at least one question before publishing.');
  questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text?.trim()) errs.push(`Question ${n}: question text is required.`);
    if (!q.correct_answer?.trim()) errs.push(`Question ${n}: correct answer is required.`);
    if (q.type === 'mcq') {
      const opts = (q.options ?? []).filter((o) => String(o).trim());
      if (opts.length < 2) errs.push(`Question ${n}: MCQ needs at least 2 non-empty options.`);
      if (q.correct_answer && !opts.includes(q.correct_answer)) {
        errs.push(`Question ${n}: correct answer must match one of the MCQ options.`);
      }
    }
  });
  return errs;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // ── GET: list quizzes (owned, collaborated, and assigned to me) ───────────
  if (req.method === 'GET') {
    // Step 1: find all quiz IDs where user is a collaborator (owner or contributor)
    const { data: collabRows } = await admin
      .from('quiz_collaborators')
      .select('quiz_id, role')
      .eq('teacher_id', user.id);

    const collabQuizIds = (collabRows ?? []).map((r: { quiz_id: string }) => r.quiz_id);
    const roleMap = new Map(
      (collabRows ?? []).map((r: { quiz_id: string; role: string }) => [r.quiz_id, r.role])
    );

    // Step 2: fetch owned/collaborated quizzes + assigned-to-me quizzes (two separate queries to avoid OR complexity)
    const selectFields = 'id, title, description, status, dataset_id, teacher_id, assigned_to, last_edited_by, last_edited_at, created_at, updated_at, datasets(name), questions(id)';

    const [ownedResult, assignedResult] = await Promise.all([
      collabQuizIds.length > 0
        ? admin.from('quizzes').select(selectFields).in('id', collabQuizIds).order('created_at', { ascending: false })
        : { data: [], error: null },
      admin.from('quizzes').select(selectFields).eq('assigned_to', user.id).order('created_at', { ascending: false }),
    ]);

    // Step 3: merge and deduplicate
    const seen = new Set<string>();
    const combined: Record<string, unknown>[] = [];
    for (const q of [...(ownedResult.data ?? []), ...(assignedResult.data ?? [])]) {
      const quiz = q as Record<string, unknown>;
      if (!seen.has(quiz.id as string)) {
        seen.add(quiz.id as string);
        combined.push(quiz);
      }
    }
    combined.sort((a, b) =>
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );

    // Step 4: resolve profile names for last_edited_by and assigned_to
    const profileIds = new Set<string>();
    combined.forEach((q) => {
      if (q.last_edited_by) profileIds.add(q.last_edited_by as string);
      if (q.assigned_to) profileIds.add(q.assigned_to as string);
      if (q.teacher_id) profileIds.add(q.teacher_id as string);
    });

    const { data: profileRows } = profileIds.size > 0
      ? await admin.from('profiles').select('id, full_name').in('id', [...profileIds])
      : { data: [] };

    const nameMap = new Map(
      (profileRows ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])
    );

    const formatted = combined.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      status: q.status,
      dataset_id: q.dataset_id,
      dataset_name: (q.datasets as { name: string } | null)?.name ?? null,
      question_count: Array.isArray(q.questions) ? (q.questions as unknown[]).length : 0,
      teacher_id: q.teacher_id,
      assigned_to: q.assigned_to,
      assigned_to_name: q.assigned_to ? (nameMap.get(q.assigned_to as string) ?? null) : null,
      last_edited_by: q.last_edited_by,
      last_edited_by_name: q.last_edited_by ? (nameMap.get(q.last_edited_by as string) ?? null) : null,
      last_edited_at: q.last_edited_at,
      created_at: q.created_at,
      updated_at: q.updated_at,
      is_owner: q.teacher_id === user.id,
      is_assigned: q.assigned_to === user.id,
      my_role: roleMap.get(q.id as string) ?? (q.assigned_to === user.id ? null : 'contributor'),
    }));

    return res.status(200).json({ quizzes: formatted });
  }

  // ── POST: create quiz with questions ──────────────────────────────────────
  const {
    title,
    description,
    dataset_id,
    status = 'draft',
    questions = [],
  } = req.body as {
    title?: string;
    description?: string;
    dataset_id?: string | null;
    status?: string;
    questions?: QuestionInput[];
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!VALID_STATUS.has(status)) return res.status(400).json({ error: 'Invalid status' });

  for (const [i, q] of questions.entries()) {
    if (!q.text?.trim()) return res.status(400).json({ error: `Question ${i + 1}: text is required` });
    if (!q.correct_answer?.trim()) return res.status(400).json({ error: `Question ${i + 1}: correct_answer is required` });
    if (!VALID_TYPES.has(q.type)) return res.status(400).json({ error: `Question ${i + 1}: invalid type` });
  }

  if (status !== 'draft') {
    const publishErrors = validateForPublish(questions);
    if (publishErrors.length > 0) return res.status(422).json({ error: publishErrors[0], errors: publishErrors });
  }

  if (dataset_id) {
    const { data: ds } = await admin.from('datasets').select('id, teacher_id').eq('id', dataset_id).single();
    if (!ds || ds.teacher_id !== user.id) return res.status(404).json({ error: 'Dataset not found' });
  }

  const { data: quiz, error: quizErr } = await admin
    .from('quizzes')
    .insert({
      teacher_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      dataset_id: dataset_id || null,
      status,
    })
    .select('id')
    .single();

  if (quizErr || !quiz) return res.status(500).json({ error: quizErr?.message ?? 'Failed to create quiz' });

  // Insert owner row into quiz_collaborators
  await admin
    .from('quiz_collaborators')
    .insert({ quiz_id: quiz.id, teacher_id: user.id, role: 'owner' });

  if (questions.length > 0) {
    const rows = questions.map((q, idx) => buildQuestionRow(q, quiz.id, idx));
    const { error: qErr } = await admin.from('questions').insert(rows);
    if (qErr) {
      await admin.from('quizzes').delete().eq('id', quiz.id);
      return res.status(500).json({ error: qErr.message });
    }
  }

  return res.status(201).json({ quizId: quiz.id });
}
