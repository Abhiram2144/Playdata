import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function TeacherLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [errorMessage, setErrorMessage] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email, password }: FormData) => {
    setErrorMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMessage(error.message || 'Unable to sign in. Please check your email and password.');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, password_reset_required')
      .eq('id', data.user?.id)
      .maybeSingle();

    if (profile?.role === 'teacher' && profile.password_reset_required) {
      router.push('/reset-password?phase=update&first_login=1');
      return;
    }

    router.push('/teacher/dashboard');
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0d18] px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.12),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full max-w-md space-y-8"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-4 text-violet-400" />
          </div>
          <p className="text-xl font-bold text-white">PlayData</p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/3 p-8 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-bold text-white">Teacher sign in</h1>
            <p className="text-sm text-[#8d8da0]">
              Enter your email and password to access your teacher dashboard.
            </p>
          </div>

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
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={cn('pl-9', errors.password && 'border-red-500/70 focus-visible:ring-red-500/40')}
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500"
            >
              {isSubmitting ? (
                <><Loader2 size={15} className="animate-spin" />Signing in…</>
              ) : (
                <><span>Sign in</span><ArrowRight size={15} /></>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#6a6a80]">
          Not a teacher?{' '}
          <Link href="/auth/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
            Sign in with password
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
