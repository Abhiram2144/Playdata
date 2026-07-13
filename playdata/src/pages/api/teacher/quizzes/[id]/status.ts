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

const VALID_STATUS = new Set(['draft', 'in_progress', 'assigned', 'completed']);

// PATCH /api/teacher/quizzes/[id]/status
// Owner, collaborator, or assignee can update status.
// body: { status: string }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Quiz ID required' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  // Check user has access: collaborator or assignee
  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, teacher_id, assigned_to, status')
    .eq('id', id)
    .single();

  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const { data: collabRow } = await admin
    .from('quiz_collaborators')
    .select('role')
    .eq('quiz_id', id)
    .eq('teacher_id', user.id)
    .single();

  const isCollaborator = !!collabRow;
  const isAssignee = quiz.assigned_to === user.id;

  if (!isCollaborator && !isAssignee) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { status } = req.body as { status?: string };
  if (!status || !VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Non-owners can only mark complete; owners can set any status
  const isOwner = collabRow?.role === 'owner';
  if (!isOwner && status !== 'completed') {
    return res.status(403).json({ error: 'Only the quiz owner can change status other than completing it' });
  }

  const { error } = await admin
    .from('quizzes')
    .update({ status })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, status });
}
