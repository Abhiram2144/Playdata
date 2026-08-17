import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, BarChart3, Users, Sparkles } from 'lucide-react';

/* Decorative rising bar chart in the Okabe-Ito palette used by the app's
   real charts — ties the auth pages to the product's data identity. */
function DataMotif() {
  const bars = [
    { h: 34, c: '#E69F00' },
    { h: 58, c: '#56B4E9' },
    { h: 44, c: '#009E73' },
    { h: 78, c: '#0072B2' },
    { h: 62, c: '#CC79A7' },
    { h: 92, c: '#7c3aed' },
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none flex items-end gap-3 h-28">
      {bars.map((b, i) => (
        <motion.div
          key={i}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: b.h, opacity: 1 }}
          transition={{ delay: 0.35 + i * 0.08, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-7 rounded-t-lg"
          style={{ backgroundColor: b.c }}
        />
      ))}
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.10),transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(86,180,233,0.10),transparent_45%)]" />
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle, #c4b5fd 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Blurred orbs */}
      <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
    </div>
  );
}

export function AuthBrand({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shadow-md shadow-violet-600/30">
        <Zap className="size-4 text-white" />
      </span>
      <span className={`text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
        PlayData
      </span>
    </Link>
  );
}

export function AuthCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`rounded-3xl border border-[#e4e0f8] bg-white p-8 shadow-xl shadow-violet-900/5 ${className}`}
    >
      {children}
    </motion.div>
  );
}

interface AuthShellProps {
  children: React.ReactNode;
  /** 'split' renders the brand/feature panel on the left at lg+. */
  variant?: 'split' | 'centered';
  maxWidth?: string;
}

const FEATURES = [
  { icon: BarChart3, title: 'Real data, real charts', body: 'Learn statistics through esports datasets you actually care about.' },
  { icon: Users, title: 'Live classroom sessions', body: 'Join with a 6-character code and answer quizzes in real time.' },
  { icon: Sparkles, title: 'AI-assisted teaching', body: 'Teachers generate quizzes and explanations with AI help.' },
];

export function AuthShell({ children, variant = 'centered', maxWidth = 'max-w-md' }: AuthShellProps) {
  if (variant === 'split') {
    return (
      <main className="relative min-h-screen bg-[#f5f3ff]">
        <Backdrop />
        <div className="relative mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
          {/* Brand panel — a real sibling column, so it can never sit on top
              of the form and swallow clicks. */}
          <div className="hidden flex-col justify-between p-12 lg:flex">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <AuthBrand />
            </motion.div>

            <div className="space-y-10">
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="text-4xl font-black leading-tight tracking-tight text-gray-900"
              >
                Learn maths through{' '}
                <span className="text-violet-600 underline decoration-violet-300 decoration-4 underline-offset-4">
                  the games
                </span>{' '}
                you love.
              </motion.h1>

              <div className="space-y-5">
                {FEATURES.map((f, i) => (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                    className="flex items-start gap-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[#e4e0f8] shadow-sm">
                      <f.icon className="size-4 text-violet-600" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{f.body}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <DataMotif />
          </div>

          {/* Form column */}
          <div className="flex items-center justify-center px-6 py-12">
            <div className={`w-full ${maxWidth}`}>
              <div className="mb-6 lg:hidden">
                <AuthBrand />
              </div>
              {children}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f5f3ff] px-6 py-12">
      <Backdrop />
      <div className={`relative w-full ${maxWidth} space-y-6`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <AuthBrand />
        </motion.div>
        {children}
      </div>
    </main>
  );
}
