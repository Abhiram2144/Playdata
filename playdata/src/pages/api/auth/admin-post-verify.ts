import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_EMAIL = 'abhiram.sathiraju@gmail.com';

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
    return res.json({ redirect: '/admin/login?error=no-session' });
  }

  if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.json({ redirect: '/admin/login?error=not-admin', error: 'Not an admin account' });
  }

  const supabase = createAdminClient();

  // Ensure profile exists with role='admin'
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!existing) {
    await supabase.from('profiles').insert({
      id: user.id,
      username: 'abhiram.sathiraju',
      email: user.email,
      full_name: 'Abhiram Sathiraju',
      role: 'admin',
      onboarding_completed: true,
    });
  } else if (existing.role !== 'admin') {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id);
  }

  // Ensure admin_profiles row exists
  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (!adminProfile) {
    await supabase
      .from('admin_profiles')
      .insert({ id: user.id, onboarding_completed: false });
  }

  const onboarded = adminProfile?.onboarding_completed ?? false;
  return res.json({ redirect: onboarded ? '/admin/dashboard' : '/admin/onboarding' });
}
