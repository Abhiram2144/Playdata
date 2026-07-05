import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type User = { id: string } | null;

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

async function getSessionUser(req: NextApiRequest, res: NextApiResponse<User>) {
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

function buildGoogleAuthUrl(origin: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: `${origin}/api/teacher/drive/auth-callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value ?? '' }));
        },
        setAll() {
          return;
        },
      },
    }
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const origin = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}`;
  const authUrl = buildGoogleAuthUrl(origin);

  return res.redirect(authUrl);
}
