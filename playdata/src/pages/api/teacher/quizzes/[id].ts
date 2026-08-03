import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

type QuestionType = 'mcq' | 'short_answer' | 'numerical';
const VALID_TYPES = new Set<QuestionType>(['mcq', 'short_answer', 'numerical']);
const VALID_STATUS = new Set(['draft', 'in_progress', 'assigned', 'completed']);

interface QuestionInput {
  text: string;
  type: QuestionType;
  options?: string[] | null;
  correct_answer: string;
  answer_tolerance?: number | string | null;
  dataset_column?: string | null;
  visualisation_ids?: string[] | null;
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
  if (!['GET', 'PUT', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Quiz ID required' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // Check access: user must be a collaborator (owner or contributor)
  const { data: collabRow } = await admin
    .from('quiz_collaborators')
    .select('role')
    .eq('quiz_id', id)
    .eq('teacher_id', user.id)
    .single();

  if (!collabRow) return res.status(404).json({ error: 'Quiz not found' });

  const isOwner = collabRow.role === 'owner';

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('quizzes')
      .select(`
        id, title, description, status, dataset_id, teacher_id, is_timed, allow_student_charts,
        assigned_to, last_edited_by, last_edited_at, created_at, updated_at,
        datasets(id, name, schema),
        questions(id, order_index, text, type, options, correct_answer,
                  answer_tolerance, dataset_column, visualisation_ids, explanation, time_limit_secs)
      `)
      .eq('id', id)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (data && Array.isArray((data as Record<string, unknown>).questions)) {
      (data as Record<string, unknown[]>).questions.sort(
        (a, b) => (a as Record<string, number>).order_index - (b as Record<string, number>).order_index
      );
    }

    return res.status(200).json({ quiz: data, isOwner });
  }

  // ── DELETE (owner only) ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!isOwner) return res.status(403).json({ error: 'Only the quiz owner can delete it' });
    const { error } = await admin.from('quizzes').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // ── PUT: update quiz + atomically replace all questions ───────────────────
  const {
    title,
    description,
    dataset_id,
    status,
    is_timed,
    allow_student_charts,
    questions = [],
  } = req.body as {
    title?: string;
    description?: string;
    dataset_id?: string | null;
    status?: string;
    is_timed?: boolean;
    allow_student_charts?: boolean;
    questions?: QuestionInput[];
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (status && !VALID_STATUS.has(status)) return res.status(400).json({ error: 'Invalid status' });

  for (const [i, q] of questions.entries()) {
    if (!q.text?.trim()) return res.status(400).json({ error: `Question ${i + 1}: text is required` });
    if (!q.correct_answer?.trim()) return res.status(400).json({ error: `Question ${i + 1}: correct_answer is required` });
    if (!VALID_TYPES.has(q.type)) return res.status(400).json({ error: `Question ${i + 1}: invalid type` });
  }

  if (status && status !== 'draft') {
    const errs = validateForPublish(questions);
    if (errs.length > 0) return res.status(422).json({ error: errs[0], errors: errs });
  }

  if (dataset_id) {
    const { data: ds } = await admin.from('datasets').select('id, teacher_id').eq('id', dataset_id).single();
    if (!ds || ds.teacher_id !== user.id) return res.status(404).json({ error: 'Dataset not found' });
  }

  const { error: updateErr } = await admin
    .from('quizzes')
    .update({
      title: title.trim(),
      description: description?.trim() || null,
      dataset_id: dataset_id || null,
      ...(status ? { status } : {}),
      ...(is_timed !== undefined ? { is_timed } : {}),
      ...(allow_student_charts !== undefined ? { allow_student_charts } : {}),
      last_edited_by: user.id,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Replace questions atomically
  await admin.from('questions').delete().eq('quiz_id', id);

  if (questions.length > 0) {
    const rows = questions.map((q, idx) => ({
      quiz_id: id,
      order_index: idx,
      text: q.text,
      type: q.type,
      options: q.type === 'mcq' ? (q.options ?? null) : null,
      correct_answer: q.correct_answer,
      answer_tolerance: q.type === 'numerical'
        ? (q.answer_tolerance != null ? Number(q.answer_tolerance) : null)
        : null,
      dataset_column: q.dataset_column || null,
      visualisation_ids: q.visualisation_ids ?? [],
      explanation: q.explanation || null,
      time_limit_secs: q.time_limit_secs ?? 30,
    }));

    const { error: qErr } = await admin.from('questions').insert(rows);
    if (qErr) return res.status(500).json({ error: qErr.message });
  }

  return res.status(200).json({ ok: true });
}
