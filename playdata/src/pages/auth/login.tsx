import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowRight, Mail, Lock, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { AuthShell, AuthCard } from '@/components/auth/AuthShell';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;

export default function AuthLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);

  const errorParam = router.query.error as string | undefined;
  const errorMsg =
    errorParam === 'domain-not-allowed'
      ? 'Your email domain is not registered with any organisation on PlayData.'
      : errorParam === 'no-session'
      ? 'Session expired. Please try again.'
      : errorParam
      ? decodeURIComponent(errorParam)
      : null;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email, password }: FormData) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error('Sign in failed', { description: error.message });
        return;
      }

      if (!data.user) {
        toast.error('No user returned. Please try again.');
        return;
      }

      // Get profile to determine routing
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, password_reset_required')
        .eq('id', data.user.id)
        .maybeSingle();

      const role = profile?.role ?? 'student';

      if (profile?.password_reset_required) {
        router.push('/reset-password?phase=update&first_login=1');
        return;
      }

      router.push(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell variant="split">
      <AuthCard>
        <div className="space-y-7">
          {/* Heading */}
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sign in</h1>
            <p className="text-sm text-gray-500">
              Use your institutional email and password.
            </p>
          </div>

          {/* Error */}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {errorMsg}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@university.ac.uk"
                  autoComplete="email"
                  className={cn('pl-9 h-10', errors.email && 'border-red-400 focus-visible:ring-red-300')}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn('pl-9 h-10', errors.password && 'border-red-400 focus-visible:ring-red-300')}
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div className="flex justify-end">
              <Link
                href="/reset-password"
                className="text-xs text-gray-500 hover:text-violet-600 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || submitting}
              className="w-full h-10 bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500 shadow-md shadow-violet-600/25"
            >
              {isSubmitting || submitting ? (
                <><Loader2 size={15} className="animate-spin" />Signing in…</>
              ) : (
                <><span>Sign in</span><ArrowRight size={15} /></>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e4e0f8]" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-[#e4e0f8]" />
          </div>

          {/* Guest join */}
          <Link
            href="/guest/join"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e4e0f8] bg-[#f5f3ff] px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            <Users size={15} />
            Join a session as guest
          </Link>

          <div className="space-y-2 text-center text-sm text-gray-500">
            <p>
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">
                Create one
              </Link>
            </p>
            <p>
              Teacher?{' '}
              <Link href="/auth/teacher-login" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">
                Sign in here
              </Link>
            </p>
            <p>
              Administrator?{' '}
              <Link href="/admin/login" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">
                Sign in as admin
              </Link>
            </p>
          </div>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
