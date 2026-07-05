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

async function listDriveFiles(accessToken: string, pageToken?: string) {
  const params = new URLSearchParams({
    q: "mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel'",
    spaces: 'drive',
    fields: 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime)',
    pageSize: '50',
  });

  if (pageToken) {
    params.append('pageToken', pageToken);
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to list Drive files');
  }

  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getSessionUser(req, res);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  try {
    const admin = createAdminClient();

    // Verify teacher role
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    // Get latest approved drive connection for teacher
    const { data: connection } = await admin
      .from('drive_connections')
      .select('access_token, expires_at')
      .eq('teacher_id', user.id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!connection || !connection.access_token) {
      return res.status(403).json({ error: 'No approved Google Drive connection' });
    }

    // Check if token is expired
    if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Google Drive token expired' });
    }

    const pageToken = req.query.pageToken as string | undefined;
    const response = await listDriveFiles(connection.access_token, pageToken);

    return res.status(200).json({
      files: response.files ?? [],
      nextPageToken: response.nextPageToken ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

