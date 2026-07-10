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

async function exchangeDropboxCode(code: string, redirectUri: string) {
  const credentials = Buffer.from(
    `${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`
  ).toString('base64');

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).error_description ?? 'Failed to exchange Dropbox code');
  }
  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req, res);
  if (!user) return res.redirect('/auth/login?error=session-required');

  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) return res.redirect(`/teacher/datasets?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect('/teacher/datasets?error=missing-code');

  try {
    const origin = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}`;
    const redirectUri = `${origin}/api/teacher/drive/dropbox-callback`;

    const tokens = await exchangeDropboxCode(code, redirectUri);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();

    // Upsert: one row per (teacher_id, provider)
    const { data: existing } = await admin
      .from('drive_connections')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('provider', 'dropbox')
      .maybeSingle();

    if (existing) {
      const patch: Record<string, unknown> = {
        access_token: tokens.access_token,
        expires_at: expiresAt,
      };
      if (tokens.refresh_token) patch.refresh_token = tokens.refresh_token;

      const { error: updateError } = await admin
        .from('drive_connections')
        .update(patch)
        .eq('id', existing.id);

      if (updateError) {
        return res.redirect(`/teacher/datasets?error=${encodeURIComponent(updateError.message)}`);
      }
    } else {
      const { error: insertError } = await admin
        .from('drive_connections')
        .insert({
          teacher_id: user.id,
          name: 'Dropbox',
          provider: 'dropbox',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          expires_at: expiresAt,
          external_folder_id: null,
          is_approved: true,
        });

      if (insertError) {
        return res.redirect(`/teacher/datasets?error=${encodeURIComponent(insertError.message)}`);
      }
    }

    return res.redirect('/teacher/datasets?success=dropbox-connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.redirect(`/teacher/datasets?error=${encodeURIComponent(message)}`);
  }
}
