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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data: rows, error } = await admin
      .from('drive_connections')
      .select('id, name, provider, is_approved, approved_at, external_folder_id, created_at, access_token, expires_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const connections = (rows ?? []).map(({ access_token, expires_at, ...rest }) => ({
      ...rest,
      has_token: !!access_token,
      token_expired: expires_at ? new Date(expires_at) < new Date() : false,
    }));

    return res.status(200).json({ connections });
  }

  if (req.method === 'POST') {
    const { name, provider } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Connection name is required' });
    }

    if (!provider || !['google_drive', 'dropbox'].includes(provider)) {
      return res.status(400).json({ error: "Provider must be 'google_drive' or 'dropbox'" });
    }

    const { data: connection, error } = await admin
      .from('drive_connections')
      .insert({
        teacher_id: user.id,
        name: name.trim(),
        provider,
        is_approved: false,
        external_folder_id: null,
      })
      .select('id, name, provider, is_approved, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ connection });
  }
}
