import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Quiz ID required' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // Fetch original quiz + questions
  const { data: original, error: fetchErr } = await admin
    .from('quizzes')
    .select(`
      id, title, description, dataset_id, teacher_id, is_timed,
      questions(order_index, text, type, options, correct_answer,
                answer_tolerance, dataset_column, visualisation_ids, explanation, time_limit_secs)
    `)
    .eq('id', id)
    .single();

  if (fetchErr || !original) return res.status(404).json({ error: 'Quiz not found' });

  // Owner or collaborator can duplicate
  const { data: collabRow } = await admin
    .from('quiz_collaborators')
    .select('role')
    .eq('quiz_id', id)
    .eq('teacher_id', user.id)
    .single();

  if (!collabRow) return res.status(404).json({ error: 'Quiz not found' });

  // Clone quiz (duplicator becomes owner of the copy)
  const { data: copy, error: copyErr } = await admin
    .from('quizzes')
    .insert({
      teacher_id: user.id,
      title: `(Copy) ${original.title}`,
      description: original.description,
      dataset_id: original.dataset_id,
      is_timed: (original as Record<string, unknown>).is_timed ?? true,
      status: 'draft',
    })
    .select('id')
    .single();

  if (copyErr || !copy) return res.status(500).json({ error: copyErr?.message ?? 'Failed to duplicate quiz' });

  // Insert owner row for the duplicator
  await admin
    .from('quiz_collaborators')
    .insert({ quiz_id: copy.id, teacher_id: user.id, role: 'owner' });

  // Clone questions
  const questions: Record<string, unknown>[] = Array.isArray(original.questions)
    ? (original.questions as Record<string, unknown>[])
    : [];

  if (questions.length > 0) {
    const rows = questions.map((q) => ({
      quiz_id: copy.id,
      order_index: q.order_index,
      text: q.text,
      type: q.type,
      options: q.options ?? null,
      correct_answer: q.correct_answer,
      answer_tolerance: q.answer_tolerance ?? null,
      dataset_column: q.dataset_column ?? null,
      visualisation_ids: q.visualisation_ids ?? [],
      explanation: q.explanation ?? null,
      time_limit_secs: q.time_limit_secs ?? 30,
    }));

    const { error: qErr } = await admin.from('questions').insert(rows);
    if (qErr) {
      await admin.from('quizzes').delete().eq('id', copy.id);
      return res.status(500).json({ error: qErr.message });
    }
  }

  return res.status(201).json({ quizId: copy.id });
}
