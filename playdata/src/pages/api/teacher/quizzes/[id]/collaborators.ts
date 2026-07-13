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

// GET  /api/teacher/quizzes/[id]/collaborators — list collaborators (owner or contributor on quiz)
// POST /api/teacher/quizzes/[id]/collaborators — add collaborator (owner only)
//   body: { teacher_id: string }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
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

  // Check user has access to this quiz (owner or collaborator)
  const { data: myRow } = await admin
    .from('quiz_collaborators')
    .select('role')
    .eq('quiz_id', id)
    .eq('teacher_id', user.id)
    .single();

  if (!myRow) return res.status(404).json({ error: 'Quiz not found' });

  // ── GET: list all collaborators with profile info ─────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('quiz_collaborators')
      .select('teacher_id, role, added_at')
      .eq('quiz_id', id)
      .order('added_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const teacherIds = (data ?? []).map((r: { teacher_id: string }) => r.teacher_id);

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', teacherIds.length > 0 ? teacherIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string; email: string }) => [p.id, p])
    );

    const collaborators = (data ?? []).map((r: { teacher_id: string; role: string; added_at: string }) => ({
      teacher_id: r.teacher_id,
      role: r.role,
      added_at: r.added_at,
      full_name: (profileMap.get(r.teacher_id) as { full_name: string } | undefined)?.full_name ?? '',
      email: (profileMap.get(r.teacher_id) as { email: string } | undefined)?.email ?? '',
    }));

    return res.status(200).json({ collaborators });
  }

  // ── POST: add a collaborator (owner only) ─────────────────────────────────
  if (myRow.role !== 'owner') {
    return res.status(403).json({ error: 'Only the quiz owner can add collaborators' });
  }

  const { teacher_id } = req.body as { teacher_id?: string };
  if (!teacher_id) return res.status(400).json({ error: 'teacher_id is required' });

  // Verify the target is a teacher
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', teacher_id)
    .single();

  if (!targetProfile || targetProfile.role !== 'teacher') {
    return res.status(404).json({ error: 'Teacher not found' });
  }

  const { error: insertErr } = await admin
    .from('quiz_collaborators')
    .insert({ quiz_id: id, teacher_id, role: 'contributor' });

  if (insertErr) {
    if (insertErr.code === '23505') {
      return res.status(409).json({ error: 'This teacher is already a collaborator' });
    }
    return res.status(500).json({ error: insertErr.message });
  }

  return res.status(201).json({
    collaborator: {
      teacher_id,
      role: 'contributor',
      added_at: new Date().toISOString(),
      full_name: targetProfile.full_name,
      email: targetProfile.email,
    },
  });
}
