import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type TeacherInput = { email: string; full_name?: string };
type ResultItem = { email: string; status: 'invited' | 'skipped' | 'error'; message?: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { teachers } = req.body as { teachers?: TeacherInput[] };
  if (!Array.isArray(teachers) || teachers.length === 0) {
    return res.status(400).json({ error: 'teachers array is required' });
  }

  // De-dupe by lowercased email, keeping the first occurrence
  const seen = new Set<string>();
  const unique = teachers.filter((t) => {
    const email = t.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });

  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'http';
  const origin = `${proto}://${req.headers.host}`;

  const results: ResultItem[] = [];

  for (const t of unique) {
    const email = t.email.trim().toLowerCase();
    const fullName = t.full_name?.trim() ?? '';

    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'error', message: 'Invalid email address' });
      continue;
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      results.push({
        email,
        status: 'skipped',
        message: existing.role === 'teacher' ? 'Already a teacher' : `Already registered as ${existing.role}`,
      });
      continue;
    }

    // Creates the auth user (unconfirmed) and emails them a magic link to
    // accept the invite. The handle_new_user trigger reads role/full_name
    // from this metadata to create their profile immediately.
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role: 'teacher' },
      redirectTo: `${origin}/api/auth/callback`,
    });

    if (inviteError) {
      const msg = inviteError.message.toLowerCase();
      results.push({
        email,
        status: msg.includes('already') ? 'skipped' : 'error',
        message: inviteError.message,
      });
      continue;
    }

    results.push({ email, status: 'invited' });
  }

  return res.json({ results });
}
