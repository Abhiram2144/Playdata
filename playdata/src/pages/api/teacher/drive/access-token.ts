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
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function refreshGoogleToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error('Google token refresh failed');
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function refreshDropboxToken(refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`
  ).toString('base64');
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error('Dropbox token refresh failed');
  return res.json() as Promise<{ access_token: string; expires_in?: number }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const { provider } = req.query;
  if (!provider || !['google_drive', 'dropbox'].includes(provider as string)) {
    return res.status(400).json({ error: 'provider must be google_drive or dropbox' });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  const { data: conn } = await admin
    .from('drive_connections')
    .select('id, provider, access_token, refresh_token, expires_at, external_folder_id')
    .eq('teacher_id', user.id)
    .eq('provider', provider as string)
    .maybeSingle();

  if (!conn || !conn.access_token) {
    return res.status(401).json({ needs_reconnect: true, error: 'Not connected' });
  }

  const isExpired = conn.expires_at ? new Date(conn.expires_at) < new Date() : false;

  if (isExpired) {
    if (!conn.refresh_token) {
      return res.status(401).json({ needs_reconnect: true, error: 'Token expired and no refresh token' });
    }
    try {
      const refreshed = conn.provider === 'google_drive'
        ? await refreshGoogleToken(conn.refresh_token)
        : await refreshDropboxToken(conn.refresh_token);

      const newExpiry = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;

      await admin
        .from('drive_connections')
        .update({ access_token: refreshed.access_token, expires_at: newExpiry })
        .eq('id', conn.id);

      return res.status(200).json({
        accessToken: refreshed.access_token,
        externalFolderId: conn.external_folder_id ?? null,
      });
    } catch {
      return res.status(401).json({ needs_reconnect: true, error: 'Token refresh failed — please reconnect' });
    }
  }

  return res.status(200).json({
    accessToken: conn.access_token,
    externalFolderId: conn.external_folder_id ?? null,
  });
}
