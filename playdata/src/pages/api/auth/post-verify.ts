import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

type Response = { redirect: string; error?: string };

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

export default async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'POST') return res.status(405).end();

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

  if (!user?.email) {
    return res.json({ redirect: '/auth/login?error=no-session' });
  }

  const supabase = createAdminClient();

  // Upsert profile
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('role, password_reset_required')
    .eq('id', user.id)
    .maybeSingle();

  // Teacher accounts are created by an admin (see /api/admin/teachers) and
  // already have a profile by the time they verify their OTP — they're
  // pre-vetted, so the self-signup domain gate doesn't apply to them.
  if (!existingProfile || existingProfile.role === 'student') {
    const domain = user.email.split('@')[1].toLowerCase();

    let domainAllowed = true;
    const { data: domainRow, error: domainError } = await supabase
      .from('organization_email_domains')
      .select('organization_id')
      .eq('domain', domain)
      .eq('applies_to', 'student')
      .maybeSingle();

    if (domainError) {
      const message = domainError.message.toLowerCase();
      if (message.includes('does not exist') || message.includes('relation') || message.includes('column')) {
        domainAllowed = true;
      } else {
        domainAllowed = false;
      }
    } else {
      domainAllowed = Boolean(domainRow);
    }

    if (!domainAllowed) {
      await supabase.auth.admin.deleteUser(user.id);
      return res.json({ redirect: '/auth/login?error=domain-not-allowed' });
    }
  }

  if (!existingProfile) {
    await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      role: 'student',
      full_name: '',
    });
  }

  const profile = existingProfile ?? { role: 'student', password_reset_required: false };

  if (profile.role === 'teacher' && profile.password_reset_required) {
    return res.json({ redirect: '/reset-password?phase=update&first_login=1' });
  }

  const dest =
    profile.role === 'admin' ? '/admin' :
    profile.role === 'teacher' ? '/teacher/dashboard' :
    '/student/dashboard';
  return res.json({ redirect: dest });
}
