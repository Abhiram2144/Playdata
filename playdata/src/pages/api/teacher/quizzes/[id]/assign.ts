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

// POST /api/teacher/quizzes/[id]/assign
// Owner only. Sets assigned_to + status='assigned'.
// body: { assigned_to: string | null }
// Pass assigned_to: null to clear the assignment (reverts to 'in_progress').
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

  // Only owner can assign
  const { data: ownerRow } = await admin
    .from('quiz_collaborators')
    .select('role')
    .eq('quiz_id', id)
    .eq('teacher_id', user.id)
    .single();

  if (!ownerRow) return res.status(404).json({ error: 'Quiz not found' });
  if (ownerRow.role !== 'owner') {
    return res.status(403).json({ error: 'Only the quiz owner can assign it' });
  }

  const { assigned_to } = req.body as { assigned_to?: string | null };

  if (assigned_to) {
    // Verify target is a teacher
    const { data: target } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', assigned_to)
      .single();

    if (!target || target.role !== 'teacher') {
      return res.status(404).json({ error: 'Target teacher not found' });
    }

    const { error } = await admin
      .from('quizzes')
      .update({ assigned_to, status: 'assigned' })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, assigned_to, assigned_name: target.full_name });
  } else {
    // Clear assignment
    const { error } = await admin
      .from('quizzes')
      .update({ assigned_to: null, status: 'in_progress' })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, assigned_to: null });
  }
}
