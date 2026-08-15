import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap, ArrowRight, Mail, Lock, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;

function AnimatedPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.4 + i * 0.03,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="h-full w-full text-violet-500/20" viewBox="0 0 696 316" fill="none">
        {paths.map((p) => (
          <motion.path
            key={p.id}
            d={p.d}
            stroke="currentColor"
            strokeWidth={p.width}
            initial={{ pathLength: 0.3, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: [0.2, 0.5, 0.2], pathOffset: [0, 1, 0] }}
            transition={{ duration: 18 + (p.id % 5) * 3, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </svg>
    </div>
  );
}

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

      if (role === 'teacher' && profile?.password_reset_required) {
        router.push('/reset-password?phase=update&first_login=1');
        return;
      }

      router.push(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d0d18]">
      {/* Background panels */}
      <div className="absolute inset-0 lg:grid lg:grid-cols-2">
        <div className="relative hidden overflow-hidden border-r border-white/5 bg-[#0d0d18] lg:block">
          <AnimatedPaths position={1} />
          <AnimatedPaths position={-1} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.15),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(79,70,229,0.12),transparent_35%)]" />
          <div className="relative z-10 flex h-full flex-col p-10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
                <Zap className="size-4 text-violet-400" />
              </div>
              <p className="text-xl font-bold text-white">PlayData</p>
            </div>
            
          </div>
        </div>
        <div className="relative bg-[#0d0d18]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.15),transparent_30%)]" />
        </div>
      </div>

      {/* Form */}
      <div className="relative flex min-h-screen items-center px-6 py-12 lg:py-0">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative mx-auto w-full max-w-md rounded-4xl border border-white/8 bg-white/4 p-8 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-3xl lg:p-10"
        >
          <div className="absolute inset-0 rounded-4xl bg-[#0d0d18]/60" />
          <div className="relative space-y-8">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30">
                <Zap className="size-4 text-violet-300" />
              </div>
              <p className="text-xl font-semibold text-white">PlayData</p>
            </div>

            {/* Heading */}
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-white">Sign in</h1>
              <p className="text-sm text-[#8d8da0]">
                Use your institutional email and password.
              </p>
            </div>

            {/* Error */}
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm text-red-300"
              >
                {errorMsg}
              </motion.div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-[#c9c9d4]">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8d8da0]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@university.ac.uk"
                    autoComplete="email"
                    className={cn('pl-9', errors.email && 'border-red-500/70 focus-visible:ring-red-500/40')}
                    {...register('email')}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-[#c9c9d4]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8d8da0]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={cn('pl-9', errors.password && 'border-red-500/70 focus-visible:ring-red-500/40')}
                    {...register('password')}
                  />
                </div>
                {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
              </div>

              <div className="flex justify-end">
                <Link
                  href="/reset-password"
                  className="text-xs text-[#8d8da0] hover:text-violet-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || submitting}
                className="w-full bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500"
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
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-xs text-[#4a4a60]">or</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>

            {/* Guest join */}
            <Link
              href="/guest/join"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-medium text-[#c9c9d4] transition hover:border-violet-500/40 hover:bg-violet-600/10 hover:text-violet-300"
            >
              <Users size={15} />
              Join a session as guest
            </Link>

            <p className="text-center text-sm text-[#6a6a80]">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
            <p className="text-center text-sm text-[#6a6a80]">
              Teacher?{' '}
              <Link href="/auth/teacher-login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                Sign in here
              </Link>
            </p>
            <p className="text-center text-sm text-[#6a6a80]">
              Administrator?{' '}
              <Link href="/admin/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                Sign in as admin
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
