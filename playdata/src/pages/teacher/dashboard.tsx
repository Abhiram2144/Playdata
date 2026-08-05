import { useEffect, useState } from 'react';
import { GetServerSideProps, GetServerSidePropsResult } from 'next';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, BarChart3, BookOpen, Users,
  TrendingUp, Zap, UploadCloud, ArrowRight, Play,
  ChevronRight, Gamepad2, CheckCircle2, X,
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

const WALKTHROUGH_KEY = 'playdata_walkthrough_seen_v1';

const STEPS = [
  {
    num: 1,
    icon: UploadCloud,
    title: 'Upload a dataset',
    body: 'Import a CSV or XLSX file. You can also connect Google Drive or Dropbox.',
    href: '/teacher/datasets/new',
    colour: 'text-violet-700 bg-violet-100 ring-violet-200',
    hue: 'violet',
  },
  {
    num: 2,
    icon: BarChart3,
    title: 'Build a visualisation',
    body: 'Turn your data into bar charts, scatter plots, and more — linked to quiz questions.',
    href: '/teacher/visualisations',
    colour: 'text-sky-700 bg-sky-100 ring-sky-200',
    hue: 'sky',
  },
  {
    num: 3,
    icon: BookOpen,
    title: 'Create a quiz',
    body: 'Build MCQ, short answer, and numerical questions. Attach charts and set timers.',
    href: '/teacher/quizzes',
    colour: 'text-emerald-700 bg-emerald-100 ring-emerald-200',
    hue: 'emerald',
  },
  {
    num: 4,
    icon: Users,
    title: 'Run a live session',
    body: 'Start a session and share a 6-character code. Students join in real time.',
    href: '/teacher/sessions',
    colour: 'text-amber-700 bg-amber-100 ring-amber-200',
    hue: 'amber',
  },
  {
    num: 5,
    icon: TrendingUp,
    title: 'Review results',
    body: 'See scores, participation rates, and question breakdowns after the session ends.',
    href: '/teacher/analytics',
    colour: 'text-rose-700 bg-rose-100 ring-rose-200',
    hue: 'rose',
  },
];

export default function TeacherDashboard({ profile, stats }: Props) {
  const firstName = profile.full_name?.split(' ')[0] || 'Teacher';
  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const [showGuide, setShowGuide] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(WALKTHROUGH_KEY);
    if (!seen) setShowGuide(true);
  }, []);

  const dismissGuide = () => {
    localStorage.setItem(WALKTHROUGH_KEY, '1');
    setShowGuide(false);
  };

  const QUICK_STATS = [
    {
      label: 'Datasets', value: stats.datasetCount, icon: Database,
      sub: stats.datasetCount === 0 ? 'No datasets yet' : `${stats.datasetCount} uploaded`,
      href: '/teacher/datasets',
      colour: 'text-violet-600', iconBg: 'bg-violet-100 ring-1 ring-violet-200',
    },
    {
      label: 'Quizzes', value: stats.quizCount, icon: BookOpen,
      sub: stats.quizCount === 0 ? 'No quizzes yet' : `${stats.quizCount} created`,
      href: '/teacher/quizzes',
      colour: 'text-emerald-600', iconBg: 'bg-emerald-100 ring-1 ring-emerald-200',
    },
    {
      label: 'Sessions', value: stats.sessionCount, icon: Play,
      sub: stats.sessionCount === 0 ? 'No sessions yet' : `${stats.sessionCount} run`,
      href: '/teacher/sessions',
      colour: 'text-sky-600', iconBg: 'bg-sky-100 ring-1 ring-sky-200',
    },
    {
      label: 'Students', value: stats.studentCount, icon: Users,
      sub: stats.studentCount === 0 ? 'Across all sessions' : `Across ${stats.sessionCount} session${stats.sessionCount !== 1 ? 's' : ''}`,
      href: null,
      colour: 'text-amber-600', iconBg: 'bg-amber-100 ring-1 ring-amber-200',
    },
  ];

  const QUICK_ACTIONS = [
    {
      icon: UploadCloud,
      title: 'Upload a dataset',
      desc: 'Import a CSV or XLSX file to get started.',
      href: '/teacher/datasets/new',
      colour: 'text-violet-600 bg-violet-50 ring-violet-200',
      available: true,
    },
    {
      icon: Database,
      title: 'View datasets',
      desc: `You have ${stats.datasetCount} dataset${stats.datasetCount !== 1 ? 's' : ''} uploaded.`,
      href: '/teacher/datasets',
      colour: 'text-indigo-600 bg-indigo-50 ring-indigo-200',
      available: true,
    },
    {
      icon: BarChart3,
      title: 'Build a visualisation',
      desc: 'Create charts from your dataset columns.',
      href: '/teacher/visualisations',
      colour: 'text-sky-600 bg-sky-50 ring-sky-200',
      available: true,
    },
    {
      icon: BookOpen,
      title: 'Create a quiz',
      desc: 'Build questions from your data.',
      href: '/teacher/quizzes',
      colour: 'text-emerald-600 bg-emerald-50 ring-emerald-200',
      available: true,
    },
    {
      icon: Users,
      title: 'Start a live session',
      desc: 'Run a real-time classroom session.',
      href: '/teacher/sessions',
      colour: 'text-amber-600 bg-amber-50 ring-amber-200',
      available: true,
    },
    {
      icon: TrendingUp,
      title: 'View analytics',
      desc: 'Track performance and engagement.',
      href: '/teacher/analytics',
      colour: 'text-rose-600 bg-rose-50 ring-rose-200',
      available: true,
    },
  ];

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-5 sm:p-8 shadow-sm"
        >
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(124,58,237,1) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,1) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="absolute -right-8 -top-8 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-12 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              <Zap className="size-3.5 text-violet-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Teacher Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold mb-1 sm:text-3xl">
              <span className="text-gray-900">Good day, </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-500">{firstName}</span>
              <span className="ml-1">👋</span>
            </h1>
            <p className="text-gray-500 max-w-lg">
              {stats.datasetCount === 0
                ? 'Start by uploading a dataset — then build visualisations, quizzes, and live sessions.'
                : `You have ${stats.datasetCount} dataset${stats.datasetCount !== 1 ? 's' : ''} ready. Build a quiz or run a live session next.`}
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {profile.subject_taught && (
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-100 px-3 py-1">
                  <BookOpen className="size-3.5 text-violet-600" />
                  <span className="text-xs font-medium text-violet-700">{profile.subject_taught}</span>
                </div>
              )}
              <button
                onClick={() => { setShowGuide(true); setActiveStep(0); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-gray-500 hover:text-violet-700 hover:border-violet-300 transition"
              >
                <Gamepad2 className="size-3" /> Getting started
              </button>
            </div>
          </div>
        </motion.div>

        {/* Inline Getting Started Guide */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
                      <Gamepad2 className="size-4 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Getting Started</p>
                      <p className="text-xs text-gray-400">Follow these 5 steps to get the most out of PlayData</p>
                    </div>
                  </div>
                  <button onClick={dismissGuide} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                    <X className="size-4" />
                  </button>
                </div>

                {/* Steps */}
                <div className="p-6">
                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mb-6">
                    {STEPS.map((s, i) => (
                      <div key={s.num} className="flex items-center gap-2 flex-1">
                        <button
                          onClick={() => setActiveStep(i)}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                            i === activeStep
                              ? 'bg-violet-600 text-white ring-2 ring-violet-200 ring-offset-1'
                              : 'bg-gray-100 text-gray-400 hover:bg-violet-50 hover:text-violet-600'
                          }`}
                        >
                          {s.num}
                        </button>
                        {i < STEPS.length - 1 && (
                          <div className="flex-1 h-0.5 bg-gray-100" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Active step detail */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStep}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-start gap-4"
                    >
                      {(() => {
                        const step = STEPS[activeStep];
                        const Icon = step.icon;
                        return (
                          <>
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${step.colour}`}>
                              <Icon className="size-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                              <p className="mt-1 text-sm text-gray-500 leading-relaxed">{step.body}</p>
                              <div className="mt-3 flex items-center gap-3">
                                <Link
                                  href={step.href}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                                >
                                  Go <ArrowRight className="size-3.5" />
                                </Link>
                                {activeStep < STEPS.length - 1 && (
                                  <button
                                    onClick={() => setActiveStep((s) => s + 1)}
                                    className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition"
                                  >
                                    Next step <ChevronRight className="size-4" />
                                  </button>
                                )}
                                {activeStep === STEPS.length - 1 && (
                                  <button
                                    onClick={dismissGuide}
                                    className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition"
                                  >
                                    <CheckCircle2 className="size-4 text-emerald-500" /> Done
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </motion.div>
                  </AnimatePresence>

                  {/* All steps mini list */}
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {STEPS.map((s, i) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.num}
                          onClick={() => setActiveStep(i)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center transition ${
                            i === activeStep
                              ? 'bg-violet-50 ring-1 ring-violet-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${s.colour}`}>
                            <Icon className="size-3.5" />
                          </div>
                          <span className="text-[10px] font-medium text-gray-500 leading-tight">{s.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Overview</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {QUICK_STATS.map(({ label, value, icon: Icon, sub, href, colour, iconBg }) => {
              const inner = (
                <div className={`rounded-2xl border border-gray-100 bg-white p-5 h-full shadow-sm transition-all duration-200 ${href ? 'hover:border-violet-200 hover:shadow-md cursor-pointer' : ''}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
                      <Icon className={`size-4 ${colour}`} />
                    </div>
                    {href && <ArrowRight className="size-3.5 text-gray-300" />}
                  </div>
                  <p className={`text-2xl font-bold ${value > 0 ? colour : 'text-gray-200'}`}>
                    {value}
                  </p>
                  <p className="text-sm font-medium text-gray-500 mt-0.5">{label}</p>
                  <p className="text-xs text-gray-400 mt-1">{sub}</p>
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
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Quick actions</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {QUICK_ACTIONS.map(({ icon: Icon, title, desc, href, colour }) => {
              const card = (
                <div className="rounded-2xl border border-gray-100 bg-white p-5 h-full shadow-sm transition-all duration-200 hover:border-violet-200 hover:shadow-md cursor-pointer">
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${colour}`}>
                    <Icon className="size-4" />
                  </div>
                  <h3 className="font-semibold text-gray-800">{title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-bold text-violet-600 uppercase tracking-wider">
                    Open <ArrowRight className="size-3" />
                  </div>
                </div>
              );
              return href
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
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Account</h2>
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
            {[
              { label: 'Full name',    value: profile.full_name },
              { label: 'Email',        value: profile.email },
              { label: 'Role',         value: profile.institution_role ?? 'Teacher' },
              { label: 'Subject',      value: profile.subject_taught ?? '—' },
              { label: 'Member since', value: joinedDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}
