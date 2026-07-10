import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_EMAIL = 'admin@gmail.com';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = req.query.code as string | undefined;

  if (!code) {
    return res.redirect('/auth/login?error=missing-code');
  }

  const cookiesToWrite: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({
            name,
            value: value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesToWrite.push(serializeCookie(name, value, options));
          });
        },
      },
    }
  );

  // Exchange the magic-link code for a session
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return res.redirect(`/auth/login?error=${encodeURIComponent(exchangeError.message)}`);
  }

  if (cookiesToWrite.length > 0) {
    res.setHeader('Set-Cookie', cookiesToWrite);
  }

  // Password-reset recovery — redirect to the update-password page
  const type = req.query.type as string | undefined;
  if (type === 'recovery') {
    return res.redirect('/reset-password?phase=update');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return res.redirect('/auth/login?error=no-session');
  }

  const adminClient = createAdminClient();

  // ── Admin flow ───────────────────────────────────────────
  if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      await adminClient.from('profiles').insert({
        id: user.id,
        email: user.email,
        full_name: 'Abhiram Sathiraju',
        role: 'admin',
      });
    } else if (existing.role !== 'admin') {
      await adminClient.from('profiles').update({ role: 'admin' }).eq('id', user.id);
    }

    const { data: adminProfile } = await adminClient
      .from('admin_profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminProfile) {
      await adminClient.from('admin_profiles').insert({ id: user.id, onboarding_completed: false });
    }

    const onboarded = adminProfile?.onboarding_completed ?? false;
    return res.redirect(onboarded ? '/admin/dashboard' : '/admin/onboarding');
  }

  // ── Regular user (teacher / student) flow ───────────────
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('role, password_reset_required, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  // Teacher accounts are created by an admin (see /api/admin/teachers) and
  // already have a profile by the time the invite/magic-link is followed —
  // they're pre-vetted, so the self-signup domain gate doesn't apply to them.
  if (!existingProfile || existingProfile.role === 'student') {
    const domain = user.email.split('@')[1].toLowerCase();

    let domainAllowed = true;
    const { data: domainRow, error: domainError } = await adminClient
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
      await adminClient.auth.admin.deleteUser(user.id);
      return res.redirect('/auth/login?error=domain-not-allowed');
    }
  }

  if (!existingProfile) {
    await adminClient.from('profiles').insert({
      id: user.id,
      email: user.email,
      role: 'student',
      full_name: '',
    });
  }

  const profile = (existingProfile ?? { role: 'student', password_reset_required: false, onboarding_completed: false }) as {
    role: string;
    password_reset_required?: boolean;
    onboarding_completed?: boolean;
  };

  if (profile.role === 'teacher' && profile.password_reset_required) {
    return res.redirect('/reset-password?phase=update&first_login=1');
  }

  if (!profile.onboarding_completed) {
    return res.redirect(profile.role === 'teacher' ? '/onboarding/teacher' : '/onboarding/student');
  }

  return res.redirect(
    profile.role === 'admin'   ? '/admin/dashboard' :
    profile.role === 'teacher' ? '/teacher/dashboard' :
                                 '/student/dashboard'
  );
}
