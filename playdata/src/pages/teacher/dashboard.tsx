import { useEffect, useState } from 'react';
import { GetServerSideProps, GetServerSidePropsResult } from 'next';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, Zap, UploadCloud, ArrowRight, Play,
  X, ChevronRight, ChevronLeft, Gamepad2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { withAuth } from '@/lib/auth';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { createAdminClient } from '@/lib/supabase/admin';
import type { NavItem } from '@/components/layout/Sidebar';
import { TEACHER_NAV } from '@/lib/teacher-nav';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface Stats {
  datasetCount: number;
  quizCount: number;
  sessionCount: number;
  studentCount: number;
}

interface Props { profile: Profile; stats: Stats }

export const getServerSideProps = withAuth(
  async (context, userId): Promise<GetServerSidePropsResult<Props>> => {
    const supabase = createClientFromContext(context);
    const admin = createAdminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, subject_taught, institution_role, created_at')
      .eq('id', userId)
      .single();

    if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

    const [
      { count: datasetCount },
      { count: quizCount },
      { count: sessionCount },
      { data: participantRows },
    ] = await Promise.all([
      admin.from('datasets').select('*', { count: 'exact', head: true }).eq('teacher_id', userId),
      admin.from('quizzes').select('*', { count: 'exact', head: true }).eq('teacher_id', userId),
      admin.from('sessions').select('*', { count: 'exact', head: true }).eq('teacher_id', userId),
      admin
        .from('sessions')
        .select('session_participants(student_id)')
        .eq('teacher_id', userId),
    ]);

    // Unique students across all this teacher's sessions
    const studentIds = new Set<string>();
    (participantRows ?? []).forEach((s: { session_participants: { student_id: string }[] }) => {
      s.session_participants?.forEach((p) => studentIds.add(p.student_id));
    });

    const stats: Stats = {
      datasetCount: datasetCount ?? 0,
      quizCount: quizCount ?? 0,
      sessionCount: sessionCount ?? 0,
      studentCount: studentIds.size,
    };

    return { props: { profile, stats } };
  },
  { allowedRoles: ['teacher'] }
) as GetServerSideProps<Props>;

const NAV_ITEMS = TEACHER_NAV;

const WALKTHROUGH_STEPS = [
  {
    icon: Gamepad2,
    title: 'Welcome to PlayData!',
    body: 'PlayData brings esports energy to maths education. Here\'s a quick tour to get you started in under 2 minutes.',
    colour: 'text-violet-400 bg-violet-500/10 ring-violet-500/20',
  },
  {
    icon: UploadCloud,
    title: 'Upload your first dataset',
    body: 'Go to Datasets → Upload to bring in a CSV or Excel file. You can also connect Google Drive or Dropbox.',
    colour: 'text-indigo-400 bg-indigo-500/10 ring-indigo-500/20',
  },
  {
    icon: BarChart3,
    title: 'Build a visualisation',
    body: 'Turn your dataset into bar charts, scatter plots, and more in the Visualisations section. Charts link directly to quiz questions.',
    colour: 'text-sky-400 bg-sky-500/10 ring-sky-500/20',
  },
  {
    icon: BookOpen,
    title: 'Create a quiz',
    body: 'Build MCQ, short answer, and numerical questions. Attach charts to questions and set per-question timers.',
    colour: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20',
  },
  {
    icon: Users,
    title: 'Run a live session',
    body: 'Go to Sessions → create a session, add your quiz, then Go Live. Students join with a 6-character code or QR scan.',
    colour: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
  },
];

const WALKTHROUGH_KEY = 'playdata_walkthrough_seen_v1';

function Walkthrough({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = WALKTHROUGH_STEPS[step];
  const Icon = current.icon;
  const isLast = step === WALKTHROUGH_STEPS.length - 1;

  const finish = () => {
    localStorage.setItem(WALKTHROUGH_KEY, '1');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <motion.div
        key={step}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-md rounded-3xl border border-[#35354a]/60 bg-[#0d0d18] p-8 shadow-2xl"
      >
        {/* Close */}
        <button onClick={finish} className="absolute top-4 right-4 rounded-lg p-1.5 text-[#4a4a60] hover:text-white transition">
          <X className="size-4" />
        </button>

        {/* Icon */}
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-1 mb-6 ${current.colour}`}>
          <Icon className="size-7" />
        </div>

        {/* Content */}
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6a6a80] mb-2">
          Step {step + 1} of {WALKTHROUGH_STEPS.length}
        </p>
        <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
        <p className="text-sm text-[#8d8da0] leading-relaxed">{current.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-6 mb-6">
          {WALKTHROUGH_STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all ${i === step ? 'w-6 h-2 bg-violet-500' : i < step ? 'w-2 h-2 bg-[#4a4a6a]' : 'w-2 h-2 bg-[#35354a]'}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 rounded-xl border border-[#35354a] px-4 py-2.5 text-sm text-[#8d8da0] transition hover:text-white"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
          )}
          {isLast ? (
            <button
              onClick={finish}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              <Zap className="size-4" /> Let&apos;s go!
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Next <ChevronRight className="size-4" />
            </button>
          )}
        </div>

        <button onClick={finish} className="mt-3 w-full text-center text-xs text-[#4a4a60] hover:text-[#6a6a80] transition">
          Skip tour
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function TeacherDashboard({ profile, stats }: Props) {
  const firstName = profile.full_name?.split(' ')[0] || 'Teacher';
  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const [showWalkthrough, setShowWalkthrough] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem(WALKTHROUGH_KEY);
    if (!seen) setShowWalkthrough(true);
  }, []);

  const QUICK_STATS = [
    {
      label: 'Datasets', value: stats.datasetCount, icon: Database,
      sub: stats.datasetCount === 0 ? 'No datasets yet' : `${stats.datasetCount} uploaded`,
      href: '/teacher/datasets',
      colour: 'text-violet-400', iconBg: 'bg-violet-500/10 ring-1 ring-violet-500/25', glow: '139,92,246',
    },
    {
      label: 'Quizzes', value: stats.quizCount, icon: BookOpen,
      sub: stats.quizCount === 0 ? 'No quizzes yet' : `${stats.quizCount} created`,
      href: null,
      colour: 'text-emerald-400', iconBg: 'bg-emerald-500/10 ring-1 ring-emerald-500/25', glow: '16,185,129',
    },
    {
      label: 'Sessions', value: stats.sessionCount, icon: Play,
      sub: stats.sessionCount === 0 ? 'No sessions yet' : `${stats.sessionCount} run`,
      href: null,
      colour: 'text-sky-400', iconBg: 'bg-sky-500/10 ring-1 ring-sky-500/25', glow: '14,165,233',
    },
    {
      label: 'Students', value: stats.studentCount, icon: Users,
      sub: stats.studentCount === 0 ? 'Across all sessions' : `Across ${stats.sessionCount} session${stats.sessionCount !== 1 ? 's' : ''}`,
      href: null,
      colour: 'text-amber-400', iconBg: 'bg-amber-500/10 ring-1 ring-amber-500/25', glow: '245,158,11',
    },
  ];

  const QUICK_ACTIONS = [
    {
      icon: UploadCloud,
      title: 'Upload a dataset',
      desc: 'Import a CSV or XLSX file to get started.',
      href: '/teacher/datasets/new',
      colour: 'text-violet-400 bg-violet-600/10 ring-violet-500/20',
      available: true,
    },
    {
      icon: Database,
      title: 'View datasets',
      desc: `You have ${stats.datasetCount} dataset${stats.datasetCount !== 1 ? 's' : ''} uploaded.`,
      href: '/teacher/datasets',
      colour: 'text-indigo-400 bg-indigo-600/10 ring-indigo-500/20',
      available: true,
    },
    {
      icon: BarChart3,
      title: 'Build a visualisation',
      desc: 'Create charts from your dataset columns.',
      href: '/teacher/visualisations',
      colour: 'text-sky-400 bg-sky-600/10 ring-sky-500/20',
      available: true,
    },
    {
      icon: BookOpen,
      title: 'Create a quiz',
      desc: 'Build AI-assisted questions from your data.',
      href: '/teacher/quizzes',
      colour: 'text-emerald-400 bg-emerald-600/10 ring-emerald-500/20',
      available: true,
    },
    {
      icon: Users,
      title: 'Start a live session',
      desc: 'Run a real-time classroom session.',
      href: '/teacher/sessions',
      colour: 'text-amber-400 bg-amber-600/10 ring-amber-500/20',
      available: true,
    },
    {
      icon: TrendingUp,
      title: 'View analytics',
      desc: 'Track performance and engagement.',
      href: null,
      colour: 'text-rose-400 bg-rose-600/10 ring-rose-500/20',
      available: false,
    },
  ];

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <AnimatePresence>
        {showWalkthrough && <Walkthrough onClose={() => setShowWalkthrough(false)} />}
      </AnimatePresence>
      <div className="max-w-5xl space-y-8">

        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-linear-to-br from-[#180b2e] via-[#0e0d1c] to-[#080d1a] p-8 shadow-[0_0_50px_rgba(139,92,246,0.18)]"
        >
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,1) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,1) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="absolute -right-8 -top-8 h-56 w-56 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-12 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              <Zap className="size-3.5 text-violet-400" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-400">Teacher Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold mb-1">
              <span className="text-white">Good day, </span>
              <span className="text-transparent bg-clip-text bg-linear-to-r from-violet-300 to-cyan-300">{firstName}</span>
              <span className="ml-1">👋</span>
            </h1>
            <p className="text-[#8d8da0] max-w-lg">
              {stats.datasetCount === 0
                ? 'Start by uploading a dataset — then build visualisations, quizzes, and live sessions.'
                : `You have ${stats.datasetCount} dataset${stats.datasetCount !== 1 ? 's' : ''} ready. Build a quiz or run a live session next.`}
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {profile.subject_taught && (
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-600/10 px-3 py-1">
                  <BookOpen className="size-3.5 text-violet-400" />
                  <span className="text-xs font-medium text-violet-300">{profile.subject_taught}</span>
                </div>
              )}
              <button
                onClick={() => setShowWalkthrough(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#35354a]/60 bg-[#1a1a2e]/60 px-3 py-1 text-xs text-[#6a6a80] hover:text-white hover:border-violet-500/30 transition"
              >
                <Gamepad2 className="size-3" /> Tour
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Overview</h2>
          <div className="grid grid-cols-4 gap-4">
            {QUICK_STATS.map(({ label, value, icon: Icon, sub, href, colour, iconBg, glow }) => {
              const inner = (
                <div className={`rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 p-5 h-full transition-all duration-200 ${href ? `hover:border-violet-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.12)]` : ''}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
                      <Icon className={`size-4 ${colour}`} />
                    </div>
                    {href && <ArrowRight className="size-3.5 text-[#3a3a4a]" />}
                  </div>
                  <p
                    className={`text-2xl font-bold ${value > 0 ? colour : 'text-[#35354a]'}`}
                    style={value > 0 ? { filter: `drop-shadow(0 0 10px rgba(${glow},0.5))` } : undefined}
                  >
                    {value}
                  </p>
                  <p className="text-sm font-medium text-[#8d8da0] mt-0.5">{label}</p>
                  <p className="text-xs text-[#4a4a5a] mt-1">{sub}</p>
                </div>
              );
              return href
                ? <Link key={label} href={href}>{inner}</Link>
                : <div key={label}>{inner}</div>;
            })}
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Quick actions</h2>
          <div className="grid grid-cols-3 gap-4">
            {QUICK_ACTIONS.map(({ icon: Icon, title, desc, href, colour, available }) => {
              const card = (
                <div className={`rounded-2xl border p-5 h-full transition-all duration-200 ${
                  available
                    ? 'border-[#35354a]/60 bg-[#1a1a2e]/60 hover:border-violet-500/40 hover:shadow-[0_0_24px_rgba(139,92,246,0.15)] cursor-pointer'
                    : 'border-[#2a2a38]/60 bg-[#0f0f1a]/60 opacity-40 cursor-default'
                }`}>
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${colour}`}>
                    <Icon className="size-4" />
                  </div>
                  <h3 className="font-semibold text-[#c9c9d4]">{title}</h3>
                  <p className="mt-1 text-sm text-[#6a6a80]">{desc}</p>
                  {available && (
                    <div className="mt-3 flex items-center gap-1 text-xs font-bold text-violet-400 uppercase tracking-wider">
                      Open <ArrowRight className="size-3" />
                    </div>
                  )}
                  {!available && (
                    <p className="mt-3 text-xs text-[#3a3a4a]">Coming soon</p>
                  )}
                </div>
              );
              return available && href
                ? <Link key={title} href={href}>{card}</Link>
                : <div key={title}>{card}</div>;
            })}
          </div>
        </motion.div>

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Account</h2>
          <div className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 divide-y divide-[#35354a]/40">
            {[
              { label: 'Full name',    value: profile.full_name },
              { label: 'Email',        value: profile.email },
              { label: 'Role',         value: profile.institution_role ?? 'Teacher' },
              { label: 'Subject',      value: profile.subject_taught ?? '—' },
              { label: 'Member since', value: joinedDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-[#8d8da0]">{label}</span>
                <span className="text-sm font-medium text-[#f0f0f8]">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}
