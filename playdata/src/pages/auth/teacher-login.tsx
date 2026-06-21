import { useState } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap, ArrowRight, Mail, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type FormData = z.infer<typeof schema>;

export default function TeacherLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email }: FormData) => {
    // shouldCreateUser is false — teacher accounts only exist once an admin
    // invites them, so this never lets a random email self-register.
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

    // Always show the same confirmation, whether or not the account exists,
    // so this can't be used to probe which emails have teacher accounts.
    setSentEmail(email);
    setSent(true);
  };

  const goToVerify = () => {
    sessionStorage.setItem('otp_email', sentEmail);
    router.push('/auth/verify');
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
          {sent ? (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/15 ring-1 ring-violet-500/25">
                <Sparkles className="size-7 text-violet-400" />
              </div>
              <div className="mb-6 space-y-1.5">
                <h1 className="text-2xl font-bold text-white">Check your email</h1>
                <p className="text-sm text-[#8d8da0]">
                  If <span className="font-medium text-[#c9c9d4]">{sentEmail}</span> has a teacher account,
                  we&apos;ve sent a magic link to sign in. You can click it directly, or enter the code from the
                  same email.
                </p>
              </div>
              <Button onClick={goToVerify} className="w-full bg-violet-600 text-white hover:bg-violet-700">
                I have a code <ArrowRight size={15} />
              </Button>
            </>
          ) : (
            <>
              <div className="mb-6 space-y-1.5">
                <h1 className="text-2xl font-bold text-white">Teacher sign in</h1>
                <p className="text-sm text-[#8d8da0]">
                  Enter the email your administrator invited you with. We&apos;ll send you a magic link —
                  no password needed.
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

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-violet-500"
                >
                  {isSubmitting ? (
                    <><Loader2 size={15} className="animate-spin" />Sending…</>
                  ) : (
                    <><span>Send magic link</span><ArrowRight size={15} /></>
                  )}
                </Button>
              </form>
            </>
          )}
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
