import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Trophy, Loader2, CheckCircle2, AlertCircle,
  LayoutDashboard, Users, UserCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
  { href: '/student/results', label: 'My Results', icon: Trophy, disabled: true },
  { href: '/student/sessions', label: 'Sessions', icon: Users, disabled: true },
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
      if (error.code === '23505') toast.error('Username taken', { description: 'Try a different one.' });
      else toast.error('Update failed', { description: error.message });
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast.success('Profile updated');
  };

  const joinedDate = new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <DashboardLayout navItems={navItems} profile={profile}>
      <div className="max-w-2xl space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="mt-1 text-sm text-[#8d8da0]">Manage your personal information</p>
        </motion.div>

        {/* Avatar + role */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-5 rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 p-6"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30 text-2xl font-bold text-violet-300 select-none">
            {profile.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-lg font-bold text-white">{profile.full_name}</p>
            <p className="text-sm text-[#8d8da0]">{profile.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                profile.role === 'teacher' ? 'bg-indigo-600/15 text-indigo-300 ring-1 ring-indigo-500/25'
                  : profile.role === 'admin' ? 'bg-red-600/15 text-red-300 ring-1 ring-red-500/25'
                  : 'bg-violet-600/15 text-violet-300 ring-1 ring-violet-500/25'
              )}>
                {profile.role}
              </span>
              <span className="text-xs text-[#6a6a80]">Member since {joinedDate}</span>
            </div>
          </div>
        </motion.div>

        {/* Editable fields */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 p-6"
        >
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Edit profile</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#c9c9d4]">Full name</label>
              <Input
                placeholder="Your full name"
                className={cn(errors.full_name && 'border-red-500/70')}
                {...register('full_name')}
              />
              {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            <div className="rounded-xl border border-[#35354a]/50 bg-[#151526]/70 p-3 text-sm text-[#8d8da0]">
              Your account uses your email address for sign-in. You can update your display name above.
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className={cn('transition-all', saved ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700')}
            >
              {isSubmitting ? (
                <><Loader2 size={15} className="animate-spin" />Saving…</>
              ) : saved ? (
                <><CheckCircle2 size={15} />Saved</>
              ) : (
                'Save changes'
              )}
            </Button>
          </form>
        </motion.div>

        {/* Read-only info */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-[#35354a]/60 bg-[#1a1a2e]/60 divide-y divide-[#35354a]/40"
        >
          <div className="px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[#6a6a80]">Account details</h2>
          </div>
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
              <span className="text-sm text-[#8d8da0]">{label}</span>
              <span className="text-sm font-medium text-[#f0f0f8]">{value}</span>
            </div>
          ))}
        </motion.div>

        {/* Role notice */}
        {profile.role === 'student' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3.5"
          >
            <AlertCircle className="size-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-300/80">
              Teacher accounts are approved manually. Contact your institution administrator if you need elevated access.
            </p>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
