import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { AuthShell, AuthCard } from '@/components/auth/AuthShell';

type Phase = 'contact' | 'update';

const updateSchema = z.object({
  full_name: z.string().optional(),
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
const firstLoginSchema = updateSchema.refine(
  (d) => (d.full_name ?? '').trim().length >= 2,
  { message: 'Enter the name you want to be referred as', path: ['full_name'] }
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const phase: Phase = router.query.phase === 'update' ? 'update' : 'contact';
  const isFirstLogin = router.query.first_login === '1';

  const updForm = useForm({ resolver: zodResolver(isFirstLogin ? firstLoginSchema : updateSchema) });

  // Prefill the name field with the admin-entered name, unless it's just the
  // email prefix placeholder — in that case the user should type their own.
  useEffect(() => {
    if (!isFirstLogin || phase !== 'update') return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const emailPrefix = user.email?.split('@')[0].toLowerCase() ?? '';
      const name = (profile?.full_name ?? '').trim();
      if (name && name.toLowerCase() !== emailPrefix) {
        updForm.setValue('full_name', name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstLogin, phase]);

  const handleUpdate = async ({ password, full_name }: { password: string; full_name?: string }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { toast.error(error.message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    let role = 'teacher';
    if (user?.id) {
      const updates: Record<string, unknown> = { password_reset_required: false };
      if (isFirstLogin && full_name?.trim()) updates.full_name = full_name.trim();
      await supabase.from('profiles').update(updates).eq('id', user.id);

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      role = profile?.role ?? 'teacher';
    }

    toast.success(isFirstLogin ? 'You’re all set' : 'Password updated');
    router.push(role === 'student' ? '/student/dashboard' : '/teacher/dashboard');
  };

  return (
    <AuthShell maxWidth="max-w-sm">
      {phase === 'contact' && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Forgot your password?</h1>
            <p className="text-sm text-gray-500">Password resets are handled by your administrator.</p>
          </div>

          <AuthCard className="space-y-4 !p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <ShieldCheck className="size-4 text-violet-600" />
              </div>
              <p className="text-sm leading-relaxed text-gray-600">
                For security, only your organisation&apos;s administrator can reset your password.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                <Mail className="size-4 text-violet-600" />
              </div>
              <p className="text-sm leading-relaxed text-gray-600">
                Contact your administrator by email and ask them to reset it. You&apos;ll then sign in with the
                temporary password they give you and choose a new one.
              </p>
            </div>
          </AuthCard>

          <Link href="/loginpage" className="block text-center text-sm text-gray-500 hover:text-violet-600 transition-colors">Back to sign in</Link>
        </div>
      )}

      {phase === 'update' && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {isFirstLogin ? 'Welcome to PlayData' : 'Set new password'}
            </h1>
            <p className="text-sm text-gray-500">
              {isFirstLogin
                ? 'Choose your own password and tell us what to call you.'
                : 'Choose a strong password.'}
            </p>
          </div>
          <AuthCard>
            <form onSubmit={updForm.handleSubmit(handleUpdate as Parameters<typeof updForm.handleSubmit>[0])} className="space-y-4">
              {isFirstLogin && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Your name</label>
                  <Input className="h-10" placeholder="Name you want to be referred as" {...updForm.register('full_name')} />
                  {updForm.formState.errors.full_name && (
                    <p className="text-xs text-red-500">{updForm.formState.errors.full_name.message as string}</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">New password</label>
                <Input className="h-10" type="password" placeholder="Minimum 8 characters" {...updForm.register('password')} />
                {updForm.formState.errors.password && (
                  <p className="text-xs text-red-500">{updForm.formState.errors.password.message as string}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Confirm password</label>
                <Input className="h-10" type="password" placeholder="Repeat your password" {...updForm.register('confirmPassword')} />
                {updForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-red-500">{updForm.formState.errors.confirmPassword.message as string}</p>
                )}
              </div>
              <Button type="submit" disabled={updForm.formState.isSubmitting}
                className="w-full h-10 bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-600/25">
                {updForm.formState.isSubmitting ? <><Loader2 size={15} className="animate-spin" />Updating…</> : 'Update password'}
              </Button>
            </form>
          </AuthCard>
        </div>
      )}
    </AuthShell>
  );
}
