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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const { data: teacherQuizzes } = await admin
    .from('quizzes')
    .select('id, title')
    .eq('teacher_id', user.id);

  const quizMap = new Map(
    (teacherQuizzes ?? []).map((q: { id: string; title: string }) => [q.id, q.title])
  );
  const quizIds = [...quizMap.keys()];

  if (quizIds.length === 0) return res.status(200).json({ questions: [] });

  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
  const excludeQuiz = typeof req.query.exclude_quiz === 'string' ? req.query.exclude_quiz : undefined;

  let query = admin
    .from('questions')
    .select('id, quiz_id, text, type, topic_tag, options, correct_answer, answer_tolerance, dataset_column, explanation, time_limit_secs, visualisation_ids')
    .in('quiz_id', quizIds)
    .order('topic_tag', { ascending: true, nullsFirst: false })
    .order('text', { ascending: true });

  if (tag) query = query.eq('topic_tag', tag);
  if (search) query = query.ilike('text', `%${search}%`);
  if (excludeQuiz) query = query.neq('quiz_id', excludeQuiz);

  const { data: questions, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const result = (questions ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    quiz_title: quizMap.get(row.quiz_id as string) ?? null,
  }));

  return res.status(200).json({ questions: result });
}
