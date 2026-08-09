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

function normalizeTopic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;
  return collapsed
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PATCH'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    .select('id')
    .eq('teacher_id', user.id);

  const quizIds = (teacherQuizzes ?? []).map((q: { id: string }) => q.id);

  // ── PATCH: rename a tag across all teacher's questions ──────────────────────
  if (req.method === 'PATCH') {
    const { from, to } = req.body as { from?: string; to?: string };
    if (!from?.trim()) return res.status(400).json({ error: '"from" is required' });
    if (!to?.trim()) return res.status(400).json({ error: '"to" is required' });

    const normalized = normalizeTopic(to);
    if (!normalized) return res.status(400).json({ error: 'Invalid tag name' });

    if (quizIds.length === 0) return res.status(200).json({ updated: 0 });

    const { data: updated, error } = await admin
      .from('questions')
      .update({ topic_tag: normalized })
      .in('quiz_id', quizIds)
      .eq('topic_tag', from)
      .select('id');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ updated: updated?.length ?? 0, tag: normalized });
  }

  // ── GET: list distinct tags with question counts ────────────────────────────
  if (quizIds.length === 0) return res.status(200).json({ tags: [] });

  const { data: rows, error } = await admin
    .from('questions')
    .select('topic_tag')
    .in('quiz_id', quizIds)
    .not('topic_tag', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const tag = r.topic_tag as string;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  const tags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  return res.status(200).json({ tags });
}
