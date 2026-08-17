import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { AuthShell, AuthCard } from '@/components/auth/AuthShell';

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
    <AuthShell>
      <AuthCard>
        {/* Icon */}
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200">
          <ShieldCheck className="size-7 text-violet-600" />
        </div>

        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Check your email</h1>
          <p className="text-sm text-gray-500">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-gray-700">{maskedEmail}</span>
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
                'h-12 w-full rounded-xl border text-center text-xl font-bold text-gray-900',
                'bg-white transition-all duration-150 focus:outline-none',
                digit
                  ? 'border-violet-500 ring-1 ring-violet-300'
                  : 'border-[#e4e0f8] focus:border-violet-400 focus:ring-1 focus:ring-violet-200',
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
          className="w-full h-10 bg-violet-600 text-white hover:bg-violet-700 mb-4 shadow-md shadow-violet-600/25"
        >
          {verifying ? <><Loader2 size={15} className="animate-spin" />Verifying…</> : 'Verify code'}
        </Button>

        {/* Resend */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Didn&apos;t receive it?</span>
          <button
            onClick={resend}
            disabled={resending || cooldown > 0}
            className="flex items-center gap-1.5 font-medium text-violet-600 hover:text-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      </AuthCard>

      <button
        onClick={() => router.push('/auth/login')}
        className="block w-full text-center text-sm text-gray-500 hover:text-violet-600 transition-colors"
      >
        ← Use a different email
      </button>
    </AuthShell>
  );
}
