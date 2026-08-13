import { test as setup } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const authFile = 'playwright/.auth/teacher.json';
const TEST_EMAIL = 'a11y-teacher@playdata.test';

/**
 * Authenticates as the throwaway teacher account created by
 * scripts/seed-a11y-fixtures.mjs — without a browser, an email inbox, or
 * hand-rolled cookie parsing.
 *
 * This app has no password login (see src/pages/auth/verify.tsx): the real
 * flow is an email-OTP code verified client-side via `supabase.auth.verifyOtp`.
 * We mint that same OTP server-side (`admin.generateLink` — no email is
 * actually sent), verify it with the anon client to get a real access/refresh
 * token pair, then hand those to a `@supabase/ssr` server client so *it*
 * produces the exact `sb-*-auth-token` cookie(s) the app's own
 * `getServerSideProps` guards expect — same library the app uses, so the
 * format can't drift from what `withAuth()` actually reads.
 */
setup('authenticate as teacher', async ({ page, baseURL, context }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Missing Supabase env vars for auth setup');

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
  });
  if (linkErr) throw linkErr;

  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    email: TEST_EMAIL,
    token: link.properties.email_otp,
    type: 'email',
  });
  if (verifyErr) throw verifyErr;
  const session = verified.session;
  if (!session) throw new Error('verifyOtp did not return a session');

  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  const ssrClient = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (list) => { cookiesToSet.push(...list); },
    },
  });
  const { error: setSessionErr } = await ssrClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setSessionErr) throw setSessionErr;

  const capitalise = (v: unknown): 'Strict' | 'Lax' | 'None' => {
    const s = String(v ?? 'lax').toLowerCase();
    if (s === 'strict') return 'Strict';
    if (s === 'none') return 'None';
    return 'Lax';
  };

  const origin = new URL(baseURL ?? 'http://localhost:3000');
  await context.addCookies(
    cookiesToSet.map(({ name, value, options }) => ({
      name,
      value,
      domain: origin.hostname,
      path: options.path ?? '/',
      httpOnly: options.httpOnly ?? true,
      secure: false, // localhost dev server is http
      sameSite: capitalise(options.sameSite),
    }))
  );

  // Sanity check: a protected teacher route should now render, not redirect to /login.
  await page.goto('/teacher/dashboard');
  await page.waitForURL('**/teacher/dashboard', { timeout: 10_000 });

  await context.storageState({ path: authFile });
});
