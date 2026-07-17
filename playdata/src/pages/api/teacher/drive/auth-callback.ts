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

async function exchangeCode(code: string, redirectUri: string) {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req, res);
  if (!user) return res.redirect('/auth/login?error=session-required');

  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) return res.redirect(`/teacher/datasets?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect('/teacher/datasets?error=missing-code');

  // Extract connectionId and returnTo from OAuth state if present
  let connectionId: string | null = null;
  let returnTo: string | null = null;
  const stateParam = req.query.state as string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      connectionId = parsed.connectionId ?? null;
      returnTo = parsed.returnTo ?? null;
    } catch { /* ignore malformed state */ }
  }

  try {
    const origin = `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers.host}`;
    const redirectUri = `${origin}/api/teacher/drive/auth-callback`;

    const tokens = await exchangeCode(code, redirectUri);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();

    if (connectionId) {
      // Update the specific connection row (reconnect or connect different account)
      const patch: Record<string, unknown> = {
        access_token: tokens.access_token,
        expires_at: expiresAt,
      };
      if (tokens.refresh_token) patch.refresh_token = tokens.refresh_token;

      const { error: updateError } = await admin
        .from('drive_connections')
        .update(patch)
        .eq('id', connectionId)
        .eq('teacher_id', user.id); // safety: only own connections

      if (updateError) {
        return res.redirect(`/teacher/connections?error=${encodeURIComponent(updateError.message)}`);
      }
    } else {
      // Legacy path: find existing connection by teacher+provider or insert new
      const { data: existing } = await admin
        .from('drive_connections')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('provider', 'google_drive')
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
          return res.redirect(`/teacher/connections?error=${encodeURIComponent(updateError.message)}`);
        }
      } else {
        const { error: insertError } = await admin
          .from('drive_connections')
          .insert({
            teacher_id: user.id,
            name: 'Google Drive',
            provider: 'google_drive',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            expires_at: expiresAt,
            external_folder_id: null,
            is_approved: true,
          });

        if (insertError) {
          return res.redirect(`/teacher/connections?error=${encodeURIComponent(insertError.message)}`);
        }
      }
    }

    const successDest = returnTo ? `${returnTo}?success=google-connected` : '/teacher/connections?success=google-connected';
    return res.redirect(successDest);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const errorDest = returnTo ? `${returnTo}?error=${encodeURIComponent(message)}` : `/teacher/connections?error=${encodeURIComponent(message)}`;
    return res.redirect(errorDest);
  }
}
