import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Trophy, Loader2, CheckCircle2, AlertCircle,
  LayoutDashboard, Users, UserCircle, Zap,
} from 'lucide-react';
import { ConnectionsSection } from '@/components/teacher/ConnectionsSection';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { createClient } from '@/lib/supabase/client';
import { createClientFromContext } from '@/lib/supabase/server-props';
import type { NavItem } from '@/components/layout/Sidebar';
import { TEACHER_NAV } from '@/lib/teacher-nav';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  education_level: string | null;
  subject_taught: string | null;
  institution_role: string | null;
  created_at: string;
}

interface Props { profile: Profile }

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/auth/login', permanent: false } };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, education_level, subject_taught, institution_role, created_at')
    .eq('id', user.id)
    .single();

  if (!profile) return { redirect: { destination: '/auth/login', permanent: false } };

  return { props: { profile } };
};

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
});
type FormData = z.infer<typeof schema>;

const STUDENT_NAV: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/join', label: 'Join Session', icon: Users },
  { href: '/student/results', label: 'My Results', icon: Trophy },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

export default function ProfilePage({ profile }: Props) {
  const supabase = createClient();
  const [saved, setSaved] = useState(false);

  const navItems = profile.role === 'teacher' || profile.role === 'admin' ? TEACHER_NAV : STUDENT_NAV;

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: profile.full_name },
  });

  const onSubmit = async (data: FormData) => {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: data.full_name.trim(), updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (error) {
      toast.error('Update failed', { description: error.message });
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast.success('Profile updated');
  };

  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const initial = profile.full_name?.[0]?.toUpperCase() ?? '?';

  const roleColors: Record<string, string> = {
    student: 'bg-violet-100 text-violet-700 ring-violet-200',
    teacher: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
    admin: 'bg-red-100 text-red-700 ring-red-200',
  };

  return (
    <DashboardLayout navItems={navItems} profile={profile}>
      <div className="max-w-2xl space-y-8">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="size-3.5 text-violet-600" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Settings</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your personal information</p>
        </motion.div>

        {/* Avatar + identity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white shadow-sm p-6"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 ring-1 ring-violet-200 text-2xl font-bold text-violet-700 select-none shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{profile.full_name}</p>
            <p className="text-sm text-gray-400 truncate">{profile.email}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${roleColors[profile.role] ?? roleColors.student}`}>
                {profile.role}
              </span>
              <span className="text-xs text-gray-400">Member since {joinedDate}</span>
            </div>
          </div>
        </motion.div>

        {/* Edit name */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6"
        >
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-gray-400">Edit profile</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Full name</label>
              <input
                placeholder="Your full name"
                className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-100 shadow-sm transition ${
                  errors.full_name
                    ? 'border-red-300 focus:border-red-400'
                    : 'border-gray-200 focus:border-violet-400'
                }`}
                {...register('full_name')}
              />
              {errors.full_name && (
                <p className="text-xs text-red-500">{errors.full_name.message}</p>
              )}
            </div>

            <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-400">
              Your account uses your email address for sign-in. You can update your display name above.
            </p>

            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                saved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500'
              }`}
            >
              {isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" />Saving…</>
              ) : saved ? (
                <><CheckCircle2 className="size-4" />Saved</>
              ) : (
                'Save changes'
              )}
            </button>
          </form>
        </motion.div>

        {/* Account details (read-only) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">Account details</h2>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {[
              { label: 'Email', value: profile.email },
              { label: 'Account type', value: profile.role.charAt(0).toUpperCase() + profile.role.slice(1) },
              ...(profile.role === 'teacher'
                ? [
                    { label: 'Subject taught', value: profile.subject_taught ?? '—' },
                    { label: 'Institution role', value: profile.institution_role ?? '—' },
                  ]
                : [{ label: 'Education level', value: profile.education_level ?? '—' }]
              ),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-gray-400">{label}</span>
                <span className="text-sm font-medium text-gray-700">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Drive connections — teachers only */}
        {(profile.role === 'teacher' || profile.role === 'admin') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6"
          >
            <ConnectionsSection />
          </motion.div>
        )}

        {/* Student upgrade notice */}
        {profile.role === 'student' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5"
          >
            <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">
              Teacher accounts are approved manually. Contact your institution administrator if you need elevated access.
            </p>
          </motion.div>
        )}

      </div>
    </DashboardLayout>
  );
}
