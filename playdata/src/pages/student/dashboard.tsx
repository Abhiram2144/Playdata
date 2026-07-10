import { GetServerSideProps } from 'next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Trophy, Users, UserCircle,
  Sparkles, BookOpen, BarChart3, Zap, Clock, TrendingUp,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { createClientFromContext } from '@/lib/supabase/server-props';
import type { NavItem } from '@/components/layout/Sidebar';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  education_level: string | null;
  onboarding_completed: boolean | null;
  created_at: string;
}

interface Props { profile: Profile }

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, education_level, onboarding_completed, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return { redirect: { destination: '/onboarding/student', permanent: false } };
  if (profile.role === 'teacher' || profile.role === 'admin') {
    return { redirect: { destination: '/teacher/dashboard', permanent: false } };
  }

  if (!profile.onboarding_completed) {
    return { redirect: { destination: '/onboarding/student', permanent: false } };
  }

  return { props: { profile } };
};

const NAV_ITEMS: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/results', label: 'My Results', icon: Trophy, disabled: true },
  { href: '/student/sessions', label: 'Sessions', icon: Users, disabled: true },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

const COMING_SOON = [
  { icon: BarChart3, title: 'Live Sessions', desc: 'Join teacher-led sessions in real time', color: 'violet' },
  { icon: BookOpen, title: 'Quizzes', desc: 'Answer data-driven maths questions', color: 'indigo' },
  { icon: TrendingUp, title: 'My Results', desc: 'Track your performance over time', color: 'sky' },
  { icon: Sparkles, title: 'AI Explanations', desc: 'Get personalised feedback on answers', color: 'purple' },
];

const colorMap = {
  violet: 'bg-violet-600/10 ring-violet-500/20 text-violet-400',
  indigo: 'bg-indigo-600/10 ring-indigo-500/20 text-indigo-400',
  sky: 'bg-sky-600/10 ring-sky-500/20 text-sky-400',
  purple: 'bg-purple-600/10 ring-purple-500/20 text-purple-400',
};

export default function StudentDashboard({ profile }: Props) {
  const firstName = profile.full_name?.split(' ')[0] || 'Student';
  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <DashboardLayout navItems={NAV_ITEMS} profile={profile}>
      <div className="max-w-5xl space-y-8">

        {/* Welcome card */}
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
              <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Welcome back, {firstName} 👋
            </h1>
            <p className="text-[#8d8da0]">
              Your learning journey continues. More features coming soon.
            </p>
          </div>
        </motion.div>

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Account</h2>
          <div className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 divide-y divide-[#35354a]/40">
            {[
              { label: 'Full name', value: profile.full_name },
              { label: 'Email prefix', value: profile.email.split('@')[0] || '—' },
              { label: 'Email', value: profile.email },
              { label: 'Role', value: 'Student' },
              { label: 'Education level', value: profile.education_level ?? '—' },
              { label: 'Member since', value: joinedDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-[#8d8da0]">{label}</span>
                <span className="text-sm font-medium text-[#f0f0f8]">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Stats placeholders */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Activity</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Sessions joined', value: '—', icon: Users },
              { label: 'Quizzes answered', value: '—', icon: BookOpen },
              { label: 'Best score', value: '—', icon: Trophy },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#252538]">
                    <Icon className="size-4 text-[#6a6a80]" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#35354a]">{value}</p>
                <p className="mt-1 text-xs text-[#6a6a80]">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Coming soon */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Coming soon</h2>
            <div className="flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-600/10 px-2 py-0.5">
              <Clock className="size-3 text-violet-400" />
              <span className="text-[11px] font-medium text-violet-400">In development</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {COMING_SOON.map(({ icon: Icon, title, desc, color }) => (
              <motion.div
                key={title}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/40 p-5 cursor-default"
              >
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${colorMap[color as keyof typeof colorMap]}`}>
                  <Icon className="size-4" />
                </div>
                <h3 className="font-semibold text-[#c9c9d4]">{title}</h3>
                <p className="mt-1 text-sm text-[#6a6a80]">{desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
