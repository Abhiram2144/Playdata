import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Database, BarChart3, BookOpen, Users,
  TrendingUp, UserCircle, Zap, UploadCloud, ArrowRight, Play,
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
  async (context, userId): Promise<ReturnType<GetServerSideProps<Props>>> => {
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

export default function TeacherDashboard({ profile, stats }: Props) {
  const firstName = profile.full_name?.split(' ')[0] || 'Teacher';
  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const QUICK_STATS = [
    {
      label: 'Datasets', value: stats.datasetCount, icon: Database,
      sub: stats.datasetCount === 0 ? 'No datasets yet' : `${stats.datasetCount} uploaded`,
      href: '/teacher/datasets',
    },
    {
      label: 'Quizzes', value: stats.quizCount, icon: BookOpen,
      sub: stats.quizCount === 0 ? 'No quizzes yet' : `${stats.quizCount} created`,
      href: null,
    },
    {
      label: 'Sessions', value: stats.sessionCount, icon: Play,
      sub: stats.sessionCount === 0 ? 'No sessions yet' : `${stats.sessionCount} run`,
      href: null,
    },
    {
      label: 'Students', value: stats.studentCount, icon: Users,
      sub: stats.studentCount === 0 ? 'Across all sessions' : `Across ${stats.sessionCount} session${stats.sessionCount !== 1 ? 's' : ''}`,
      href: null,
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
      href: null,
      colour: 'text-sky-400 bg-sky-600/10 ring-sky-500/20',
      available: false,
    },
    {
      icon: BookOpen,
      title: 'Create a quiz',
      desc: 'Build AI-assisted questions from your data.',
      href: null,
      colour: 'text-emerald-400 bg-emerald-600/10 ring-emerald-500/20',
      available: false,
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
      <div className="max-w-5xl space-y-8">

        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-600/15 via-violet-600/5 to-transparent p-8"
        >
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="size-4 text-violet-400" />
              <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Teacher Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">Good day, {firstName} 👋</h1>
            <p className="text-[#8d8da0] max-w-lg">
              {stats.datasetCount === 0
                ? 'Start by uploading a dataset — then build visualisations, quizzes, and live sessions.'
                : `You have ${stats.datasetCount} dataset${stats.datasetCount !== 1 ? 's' : ''} ready. Build a quiz or run a live session next.`}
            </p>
            {profile.subject_taught && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-600/10 px-3 py-1">
                <BookOpen className="size-3.5 text-violet-400" />
                <span className="text-xs font-medium text-violet-300">{profile.subject_taught}</span>
              </div>
            )}
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
            {QUICK_STATS.map(({ label, value, icon: Icon, sub, href }) => {
              const inner = (
                <div className={`rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 p-5 h-full ${href ? 'hover:border-violet-500/40 transition-colors' : ''}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#252538]">
                      <Icon className="size-4 text-[#6a6a80]" />
                    </div>
                    {href && <ArrowRight className="size-3.5 text-[#3a3a4a]" />}
                  </div>
                  <p className={`text-2xl font-bold ${value > 0 ? 'text-white' : 'text-[#35354a]'}`}>{value}</p>
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
                <div className={`rounded-2xl border p-5 h-full transition-all duration-150 ${
                  available
                    ? 'border-[#35354a]/60 bg-[#1a1a2e]/60 hover:border-violet-500/40 cursor-pointer'
                    : 'border-[#2a2a38]/60 bg-[#0f0f1a]/60 opacity-50 cursor-default'
                }`}>
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${colour}`}>
                    <Icon className="size-4" />
                  </div>
                  <h3 className="font-semibold text-[#c9c9d4]">{title}</h3>
                  <p className="mt-1 text-sm text-[#6a6a80]">{desc}</p>
                  {available && (
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-violet-400">
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
