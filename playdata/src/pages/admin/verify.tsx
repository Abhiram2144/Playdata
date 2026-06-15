import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

const CODE_LENGTH = 6;

export default function AdminVerifyPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_otp_email');
    if (!stored) { router.replace('/admin/login'); return; }
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

      const res = await fetch('/api/auth/admin-post-verify', { method: 'POST' });
      const { redirect, error: postError } = await res.json() as { redirect: string; error?: string };

      if (postError) {
        toast.error(postError);
        await supabase.auth.signOut();
        router.replace('/admin/login?error=not-admin');
        return;
      }

      sessionStorage.removeItem('admin_otp_email');
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
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-linear-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
                P
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Check your email</h1>
            <p className="text-sm text-slate-600">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-slate-800">{maskedEmail}</span>
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
                  'h-12 w-full rounded-xl border text-center text-xl font-bold text-slate-900',
                  'bg-slate-50 transition-all duration-150 focus:outline-none',
                  digit
                    ? 'border-indigo-500 ring-1 ring-indigo-500/40'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30',
                  verifying && 'opacity-50',
                ].join(' ')}
                disabled={verifying}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Verify button */}
          <button
            onClick={() => verify(code.join(''))}
            disabled={verifying || code.some((c) => !c)}
            className="w-full bg-linear-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
          >
            {verifying ? (
              <><Loader2 size={15} className="animate-spin" />Verifying…</>
            ) : (
              <><ShieldCheck size={15} />Verify code</>
            )}
          </button>

          {/* Resend */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Didn&apos;t receive it?</span>
            <button
              onClick={resend}
              disabled={resending || cooldown > 0}
              className="flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          onClick={() => router.push('/admin/login')}
          className="block w-full text-center text-sm text-slate-500 hover:text-indigo-600 transition-colors mt-4"
        >
          ← Back to login
        </button>
      </motion.div>
    </div>
  );
}
