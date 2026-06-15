import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
  role: z.enum(['student', 'teacher']),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const [showPw, setShowPw] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'student' },
  });

  const emailValue = watch('email') ?? '';
  const roleValue = watch('role');
  const username = emailValue.includes('@') ? emailValue.split('@')[0].toLowerCase() : '';

  const onSubmit = async (data: FormData) => {
    // Server-side domain check + user creation
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        role: data.role,
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

    router.push(data.role === 'teacher' ? '/onboarding/teacher' : '/onboarding/student');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d18] p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-4 text-violet-400" />
          </div>
          <p className="text-xl font-bold text-white">PlayData</p>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-white">Create account</h1>
          <p className="text-sm text-[#8d8da0]">Join PlayData to get started</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#c9c9d4]">Full name</label>
            <Input placeholder="Abhiram Sathiraju" {...register('fullName')}
              className={cn(errors.fullName && 'border-red-500/70')} />
            {errors.fullName && <p className="text-xs text-red-400">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#c9c9d4]">Email</label>
            <Input type="email" placeholder="as1809@student.le.ac.uk" {...register('email')}
              className={cn(errors.email && 'border-red-500/70')} />
            {username && !errors.email && (
              <p className="text-xs text-[#8d8da0]">Username: <span className="font-semibold text-violet-400">@{username}</span></p>
            )}
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#c9c9d4]">Password</label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} placeholder="Minimum 8 characters"
                {...register('password')} className={cn('pr-10', errors.password && 'border-red-500/70')} />
              <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8d8da0] hover:text-white transition-colors">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#c9c9d4]">Confirm password</label>
            <Input type="password" placeholder="Repeat your password" {...register('confirmPassword')}
              className={cn(errors.confirmPassword && 'border-red-500/70')} />
            {errors.confirmPassword && <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>}
          </div>

          {/* Role toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#c9c9d4]">I am a</label>
            <div className="grid grid-cols-2 gap-2">
              {(['student', 'teacher'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setValue('role', r)}
                  className={cn(
                    'rounded-md border py-2 text-sm font-medium capitalize transition-colors',
                    roleValue === r
                      ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                      : 'border-[#35354a] bg-transparent text-[#8d8da0] hover:border-violet-500/50 hover:text-white'
                  )}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full bg-violet-600 text-white hover:bg-violet-700">
            {isSubmitting ? <><Loader2 size={15} className="animate-spin" />Creating…</> : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-[#8d8da0]">
          Already have an account?{' '}
          <Link href="/loginpage" className="font-medium text-violet-400 hover:text-violet-300 transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
