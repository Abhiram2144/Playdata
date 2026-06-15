import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // /api/* must never be blocked
  if (pathname.startsWith('/api/')) return supabaseResponse;

  // Routes that authenticated users should not revisit
  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/loginpage' ||
    pathname === '/register' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/');

  // Routes protected by Supabase session (teachers/students)
  const isProtectedRoute =
    pathname.startsWith('/teacher') ||
    pathname.startsWith('/student') ||
    pathname.startsWith('/onboarding') ||
    pathname === '/profile';

  // Admin pages that require a Supabase session
  const isAdminProtectedRoute =
    pathname === '/admin/dashboard' ||
    pathname === '/admin/onboarding';

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  if (!user && isAdminProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
