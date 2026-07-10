import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

type Phase = 'request' | 'sent' | 'update';

const requestSchema = z.object({ email: z.string().email('Enter a valid email') });
const updateSchema = z.object({
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('request');
  const supabase = createClient();

  useEffect(() => {
    if (router.query.phase === 'update') setPhase('update');
  }, [router.query.phase]);

  const reqForm = useForm({ resolver: zodResolver(requestSchema) });
  const updForm = useForm({ resolver: zodResolver(updateSchema) });

  const handleRequest = async ({ email }: { email: string }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?type=recovery`,
    });
    if (error) { toast.error(error.message); return; }
    setPhase('sent');
  };

  const handleUpdate = async ({ password }: { password: string }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { toast.error(error.message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from('profiles').update({ password_reset_required: false }).eq('id', user.id);
    }

    toast.success('Password updated');
    const isFirstLogin = router.query.first_login === '1';
    router.push(isFirstLogin ? '/teacher/dashboard' : '/loginpage');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d18] p-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-4 text-violet-400" />
          </div>
          <p className="text-xl font-bold text-white">PlayData</p>
        </div>

        {phase === 'request' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-white">Reset password</h1>
              <p className="text-sm text-[#8d8da0]">We&apos;ll send a reset link to your email.</p>
            </div>
            <form onSubmit={reqForm.handleSubmit(handleRequest as Parameters<typeof reqForm.handleSubmit>[0])} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#c9c9d4]">Email</label>
                <Input type="email" placeholder="you@example.com" {...reqForm.register('email')} />
                {reqForm.formState.errors.email && (
                  <p className="text-xs text-red-400">{reqForm.formState.errors.email.message as string}</p>
                )}
              </div>
              <Button type="submit" disabled={reqForm.formState.isSubmitting} className="w-full bg-violet-600 text-white hover:bg-violet-700">
                {reqForm.formState.isSubmitting ? <><Loader2 size={15} className="animate-spin" />Sending…</> : 'Send reset link'}
              </Button>
            </form>
            <Link href="/loginpage" className="block text-center text-sm text-[#8d8da0] hover:text-violet-400 transition-colors">Back to sign in</Link>
          </div>
        )}

        {phase === 'sent' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-600/20 ring-1 ring-violet-500/30">
              <svg className="size-8 text-violet-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Check your email</h2>
            <p className="text-sm text-[#8d8da0]">Reset link sent. Click it to set a new password.</p>
            <Link href="/loginpage" className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors">Back to sign in →</Link>
          </div>
        )}

        {phase === 'update' && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-white">Set new password</h1>
              <p className="text-sm text-[#8d8da0]">Choose a strong password.</p>
            </div>
            <form onSubmit={updForm.handleSubmit(handleUpdate as Parameters<typeof updForm.handleSubmit>[0])} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#c9c9d4]">New password</label>
                <Input type="password" placeholder="Minimum 8 characters" {...updForm.register('password')} />
                {updForm.formState.errors.password && (
                  <p className="text-xs text-red-400">{updForm.formState.errors.password.message as string}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#c9c9d4]">Confirm password</label>
                <Input type="password" placeholder="Repeat your password" {...updForm.register('confirmPassword')} />
                {updForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-400">{updForm.formState.errors.confirmPassword.message as string}</p>
                )}
              </div>
              <Button type="submit" disabled={updForm.formState.isSubmitting} className="w-full bg-violet-600 text-white hover:bg-violet-700">
                {updForm.formState.isSubmitting ? <><Loader2 size={15} className="animate-spin" />Updating…</> : 'Update password'}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
