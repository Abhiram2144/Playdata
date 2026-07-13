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

// GET /api/teacher/quizzes/search-teachers?q=<search>&quizId=<id>
// Returns up to 10 teachers matching name/email, excluding the current user
// and (if quizId given) existing collaborators on that quiz.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const quizId = typeof req.query.quizId === 'string' ? req.query.quizId : null;

  // Collect IDs to exclude: current user + existing collaborators
  const excludeIds = new Set<string>([user.id]);

  if (quizId) {
    const { data: collabs } = await admin
      .from('quiz_collaborators')
      .select('teacher_id')
      .eq('quiz_id', quizId);
    (collabs ?? []).forEach((c: { teacher_id: string }) => excludeIds.add(c.teacher_id));
  }

  let query = admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'teacher')
    .limit(10);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: teachers, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const filtered = (teachers ?? []).filter(
    (t: { id: string }) => !excludeIds.has(t.id)
  );

  return res.status(200).json({ teachers: filtered });
}
