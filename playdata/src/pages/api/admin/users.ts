import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

async function getSessionUser(req: NextApiRequest, res: NextApiResponse) {
  const cookiesToWrite: string[] = [];
  const supabaseSession = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesToWrite.push(serializeCookie(name, value, options));
          });
        },
      },
    }
  );
  if (cookiesToWrite.length > 0) res.setHeader('Set-Cookie', cookiesToWrite);
  const { data: { user } } = await supabaseSession.auth.getUser();
  return user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  // GET — list users by role
  if (req.method === 'GET') {
    const { role } = req.query as { role?: string };
    if (!role || !['teacher', 'student'].includes(role)) {
      return res.status(400).json({ error: 'role query param must be "teacher" or "student"' });
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .eq('role', role)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const normalizedUsers = (users ?? []).map((user) => ({
      ...user,
      username: user.email?.split('@')[0]?.toLowerCase() ?? '',
      is_active: true,
    }));

    // Attach session counts for teachers
    if (role === 'teacher' && normalizedUsers) {
      const ids = normalizedUsers.map((u) => u.id);
      const { data: sessionCounts } = await supabase
        .from('sessions')
        .select('teacher_id')
        .in('teacher_id', ids);

      const countMap: Record<string, number> = {};
      (sessionCounts ?? []).forEach((s) => {
        countMap[s.teacher_id] = (countMap[s.teacher_id] ?? 0) + 1;
      });

      return res.json({
        users: normalizedUsers.map((u) => ({ ...u, session_count: countMap[u.id] ?? 0 })),
      });
    }

    return res.json({ users: normalizedUsers });
  }

  // PATCH — update a user (is_active or role)
  if (req.method === 'PATCH') {
    const { userId, is_active, role: newRole } = req.body as {
      userId?: string;
      is_active?: boolean;
      role?: string;
    };

    if (!userId) return res.status(400).json({ error: 'userId required' });

    const patch: Record<string, unknown> = {};
    if (newRole && ['teacher', 'student'].includes(newRole)) patch.role = newRole;

    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true });
  }

  // DELETE — permanently remove a teacher account
  if (req.method === 'DELETE') {
    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Safety: only allow deleting teachers, never admins
    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role !== 'teacher') return res.status(403).json({ error: 'Only teacher accounts can be deleted' });

    // Deleting the auth user cascades to profiles via FK
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true });
  }

  return res.status(405).end();
}
