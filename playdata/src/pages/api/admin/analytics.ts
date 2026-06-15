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

export interface TeacherAnalytics {
  id: string;
  full_name: string;
  email: string;
  session_count: number;
  total_students: number;
  avg_score: number | null;
  last_session_at: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  // Fetch all teachers
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'teacher')
    .order('full_name');

  if (!teachers || teachers.length === 0) {
    return res.json({ analytics: [] });
  }

  const teacherIds = teachers.map((t) => t.id);

  // Fetch sessions for those teachers
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, teacher_id, started_at')
    .in('teacher_id', teacherIds);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  // Fetch participants (unique students per session)
  const { data: participants } = sessionIds.length > 0
    ? await supabase
        .from('session_participants')
        .select('session_id, student_id')
        .in('session_id', sessionIds)
    : { data: [] };

  // Fetch student_responses for score calculation
  const { data: responses } = sessionIds.length > 0
    ? await supabase
        .from('student_responses')
        .select('session_id, is_correct')
        .in('session_id', sessionIds)
    : { data: [] };

  // Build analytics per teacher
  const analytics: TeacherAnalytics[] = teachers.map((teacher) => {
    const teacherSessions = (sessions ?? []).filter((s) => s.teacher_id === teacher.id);
    const teacherSessionIds = new Set(teacherSessions.map((s) => s.id));

    const teacherParticipants = (participants ?? []).filter((p) =>
      teacherSessionIds.has(p.session_id)
    );
    const uniqueStudents = new Set(teacherParticipants.map((p) => p.student_id)).size;

    const teacherResponses = (responses ?? []).filter((r) => teacherSessionIds.has(r.session_id));
    const avgScore =
      teacherResponses.length > 0
        ? Math.round(
            (teacherResponses.filter((r) => r.is_correct).length / teacherResponses.length) * 100
          )
        : null;

    const lastSession = teacherSessions
      .map((s) => s.started_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      id: teacher.id,
      full_name: teacher.full_name || teacher.email,
      email: teacher.email,
      session_count: teacherSessions.length,
      total_students: uniqueStudents,
      avg_score: avgScore,
      last_session_at: lastSession,
    };
  });

  return res.json({ analytics });
}
