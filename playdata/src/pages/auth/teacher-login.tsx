import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowRight, Mail, Lock, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { AuthShell, AuthCard } from '@/components/auth/AuthShell';

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
    <AuthShell>
      <AuthCard>
        <div className="mb-6 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
            <GraduationCap className="size-3.5" /> Teacher
          </span>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Teacher sign in</h1>
            <p className="text-sm text-gray-500">
              Enter your email and password to access your teacher dashboard.
            </p>
          </div>
        </div>

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
                placeholder="Enter your password"
                autoComplete="current-password"
                className={cn('pl-9 h-10', errors.password && 'border-red-400 focus-visible:ring-red-300')}
                {...register('password')}
              />
            </div>
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500 shadow-md shadow-violet-600/25"
          >
            {isSubmitting ? (
              <><Loader2 size={15} className="animate-spin" />Signing in…</>
            ) : (
              <><span>Sign in</span><ArrowRight size={15} /></>
            )}
          </Button>
        </form>
      </AuthCard>

      <p className="text-center text-sm text-gray-500">
        Not a teacher?{' '}
        <Link href="/auth/login" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">
          Sign in as Student
        </Link>
      </p>
    </AuthShell>
  );
}
