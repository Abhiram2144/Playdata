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
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.push(serializeCookie(name, value, options));
          });
        },
      },
    }
  );

  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.error_description ?? 'Failed to exchange code for tokens');
  }

  return res.json();
}

async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req, res);
  if (!user) return res.redirect('/auth/login?error=session-required');

  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.redirect(`/teacher/datasets?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/teacher/datasets?error=missing-code');
  }

  try {
    const origin = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}`;
    const redirectUri = `${origin}/api/teacher/drive/auth-callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Fetch user info from Google
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);

    // Save drive connection to Supabase with tokens
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: insertError } = await admin.from('drive_connections').insert({
      teacher_id: user.id,
      name: googleUser.email ?? googleUser.name ?? 'Google Drive',
      google_profile_id: googleUser.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      drive_folder_id: null,
      is_approved: false,
    });

    if (insertError) {
      return res.redirect(`/teacher/datasets?error=${encodeURIComponent(insertError.message)}`);
    }

    return res.redirect('/teacher/datasets?success=google-connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during connection';
    return res.redirect(`/teacher/datasets?error=${encodeURIComponent(message)}`);
  }
}
