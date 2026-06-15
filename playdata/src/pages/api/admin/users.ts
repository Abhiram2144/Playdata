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
      .select('id, full_name, email, username, is_active, created_at, role')
      .eq('role', role)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Attach session counts for teachers
    if (role === 'teacher' && users) {
      const ids = users.map((u) => u.id);
      const { data: sessionCounts } = await supabase
        .from('sessions')
        .select('teacher_id')
        .in('teacher_id', ids);

      const countMap: Record<string, number> = {};
      (sessionCounts ?? []).forEach((s) => {
        countMap[s.teacher_id] = (countMap[s.teacher_id] ?? 0) + 1;
      });

      return res.json({
        users: users.map((u) => ({ ...u, session_count: countMap[u.id] ?? 0 })),
      });
    }

    return res.json({ users: users ?? [] });
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
    if (is_active !== undefined) patch.is_active = is_active;
    if (newRole && ['teacher', 'student'].includes(newRole)) patch.role = newRole;

    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true });
  }

  return res.status(405).end();
}
