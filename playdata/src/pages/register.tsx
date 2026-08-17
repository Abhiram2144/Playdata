import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { TermsModal } from '@/components/auth/TermsModal';
import { AuthShell, AuthCard } from '@/components/auth/AuthShell';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((v) => v === true, {
    message: 'You must accept the terms and conditions to sign up',
  }),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const emailValue = watch('email') ?? '';
  const username = emailValue.includes('@') ? emailValue.split('@')[0].toLowerCase() : '';

  const onSubmit = async (data: FormData) => {
    // Server-side domain check + user creation (students only — teacher
    // accounts are created by an admin)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
      }),
    });

    const json = await res.json() as { error?: string; success?: boolean };

    if (!res.ok) {
      toast.error('Registration failed', { description: json.error ?? 'Unknown error' });
      return;
    }

    // User created and confirmed — sign in to get a session
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      toast.error('Account created but sign-in failed', { description: signInError.message });
      router.push('/login');
      return;
    }

    router.push('/student/dashboard');
  };

  return (
    <AuthShell maxWidth="max-w-sm">
      <AuthCard>
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create account</h1>
            <p className="text-sm text-gray-500">Join PlayData to get started</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Full name</label>
              <Input placeholder="Abhiram Sathiraju" {...register('fullName')}
                className={cn('h-10', errors.fullName && 'border-red-400')} />
              {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input type="email" placeholder="as1809@student.le.ac.uk" {...register('email')}
                className={cn('h-10', errors.email && 'border-red-400')} />
              {username && !errors.email && (
                <p className="text-xs text-gray-500">Username: <span className="font-semibold text-violet-600">@{username}</span></p>
              )}
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} placeholder="Minimum 8 characters"
                  {...register('password')} className={cn('h-10 pr-10', errors.password && 'border-red-400')} />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Confirm password</label>
              <Input type="password" placeholder="Repeat your password" {...register('confirmPassword')}
                className={cn('h-10', errors.confirmPassword && 'border-red-400')} />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[#e4e0f8] accent-violet-600"
                  {...register('acceptTerms')}
                />
                <span className="text-sm text-gray-500">
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setTermsOpen(true)}
                    className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700 transition-colors"
                  >
                    terms and conditions
                  </button>
                </span>
              </label>
              {errors.acceptTerms && <p className="text-xs text-red-500">{errors.acceptTerms.message}</p>}
            </div>

            <Button type="submit" disabled={isSubmitting}
              className="w-full h-10 bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-600/25">
              {isSubmitting ? <><Loader2 size={15} className="animate-spin" />Creating…</> : 'Create account'}
            </Button>
          </form>
        </div>
      </AuthCard>

      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAgree={() => {
          setValue('acceptTerms', true, { shouldValidate: true });
          setTermsOpen(false);
        }}
      />

      <div className="space-y-2 text-center">
        <p className="text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/loginpage" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">Sign in</Link>
        </p>
        <p className="text-xs text-gray-400">
          Teacher account? Your administrator creates it for you — check your email for an invite link.
        </p>
      </div>
    </AuthShell>
  );
}
