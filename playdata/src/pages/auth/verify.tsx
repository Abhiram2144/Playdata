import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2, Zap, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

const CODE_LENGTH = 6;

export default function AuthVerifyPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem('otp_email');
    if (!stored) { router.replace('/auth/login'); return; }
    setEmail(stored);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleInput = (i: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[i] = char;
    setCode(next);
    if (char && i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    if (next.every((c) => c) && char) verify(next.join(''));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    const next = [...code];
    pasted.split('').forEach((c, idx) => { next[idx] = c; });
    setCode(next);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    if (pasted.length === CODE_LENGTH) verify(pasted);
  };

  const verify = async (token: string) => {
    if (!email) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) {
        toast.error('Invalid code', { description: 'Please check the code and try again.' });
        setCode(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }

      // Post-verification: domain gate + profile creation
      const res = await fetch('/api/auth/post-verify', { method: 'POST' });
      const { redirect, error: postError } = await res.json() as { redirect: string; error?: string };

      if (postError) { toast.error(postError); return; }
      sessionStorage.removeItem('otp_email');
      router.push(redirect);
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setResending(false);
    if (error) { toast.error('Could not resend', { description: error.message }); return; }
    toast.success('New code sent');
    setCooldown(60);
  };

  const maskedEmail = email
    ? email.replace(/(.{2})(.+)(@.+)/, (_, a, _b, c) => `${a}${'•'.repeat(4)}${c}`)
    : '';

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#0d0d18] px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.12),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full max-w-md space-y-8"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-4 text-violet-400" />
          </div>
          <p className="text-xl font-bold text-white">PlayData</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-8 shadow-xl shadow-black/30 backdrop-blur-xl">
          {/* Icon */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/15 ring-1 ring-violet-500/25">
            <ShieldCheck className="size-7 text-violet-400" />
          </div>

          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-bold text-white">Check your email</h1>
            <p className="text-sm text-[#8d8da0]">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-[#c9c9d4]">{maskedEmail}</span>
            </p>
          </div>

          {/* OTP inputs */}
          <div className="mb-6 flex items-center gap-2" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <motion.input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className={[
                  'h-12 w-full rounded-xl border text-center text-xl font-bold text-white',
                  'bg-[#1a1a2e] transition-all duration-150 focus:outline-none',
                  digit
                    ? 'border-violet-500 ring-1 ring-violet-500/40'
                    : 'border-[#35354a] focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30',
                  verifying && 'opacity-50',
                ].join(' ')}
                disabled={verifying}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Verify button */}
          <Button
            onClick={() => verify(code.join(''))}
            disabled={verifying || code.some((c) => !c)}
            className="w-full bg-violet-600 text-white hover:bg-violet-700 mb-4"
          >
            {verifying ? <><Loader2 size={15} className="animate-spin" />Verifying…</> : 'Verify code'}
          </Button>

          {/* Resend */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6a6a80]">Didn&apos;t receive it?</span>
            <button
              onClick={resend}
              disabled={resending || cooldown > 0}
              className="flex items-center gap-1.5 font-medium text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resending ? (
                <><Loader2 size={13} className="animate-spin" />Sending…</>
              ) : cooldown > 0 ? (
                `Resend in ${cooldown}s`
              ) : (
                <><RefreshCw size={13} />Resend code</>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={() => router.push('/auth/login')}
          className="block w-full text-center text-sm text-[#6a6a80] hover:text-violet-400 transition-colors"
        >
          ← Use a different email
        </button>
      </motion.div>
    </main>
  );
}
