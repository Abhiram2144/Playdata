import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { GetServerSidePropsContext } from 'next';

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

export function createClientFromContext(context: GetServerSidePropsContext) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.entries(context.req.cookies).map(([name, value]) => ({
            name,
            value: value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          const serialized = cookiesToSet.map(({ name, value, options }) =>
            serializeCookie(name, value, options)
          );
          const existing = context.res.getHeader('Set-Cookie');
          const prev = Array.isArray(existing)
            ? existing
            : existing
            ? [existing as string]
            : [];
          context.res.setHeader('Set-Cookie', [...prev, ...serialized]);
        },
      },
    }
  );
}
