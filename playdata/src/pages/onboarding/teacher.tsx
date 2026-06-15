import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap, BookOpen, User, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { createClientFromContext } from '@/lib/supabase/server-props';

const SUBJECTS = [
  'Mathematics', 'Statistics', 'Computing / CS', 'Physics',
  'Data Science', 'Further Maths', 'Economics', 'Other',
] as const;

const INSTITUTION_ROLES = [
  'Lecturer', 'Teacher', 'Head of Department', 'Research Fellow',
  'Teaching Assistant', 'Professor', 'Other',
] as const;

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  username: z
    .string()
    .min(3, 'Minimum 3 characters')
    .max(30, 'Maximum 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  subject_taught: z.string().min(1, 'Select your subject'),
  institution_role: z.string().min(1, 'Select your role'),
  consent: z.boolean().refine((v) => v === true, { message: 'You must accept to continue' }),
});

type FormData = z.infer<typeof schema>;

interface Props { email: string }

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const supabase = createClientFromContext(context);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { redirect: { destination: '/auth/login', permanent: false } };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    const dest = profile.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';
    return { redirect: { destination: dest, permanent: false } };
  }

  // Only teachers (manually assigned) or students yet to be confirmed
  if (profile?.role === 'student') {
    return { redirect: { destination: '/onboarding/student', permanent: false } };
  }

  return { props: { email: user.email! } };
};

export default function TeacherOnboarding({ email }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [subject, setSubject] = useState('');
  const [instRole, setInstRole] = useState('');

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Session expired'); router.push('/auth/login'); return; }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: data.full_name.trim(),
        username: data.username.trim(),
        subject_taught: data.subject_taught,
        institution_role: data.institution_role,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      if (error.code === '23505') {
        toast.error('Username taken', { description: 'Please choose a different username.' });
      } else {
        toast.error('Something went wrong', { description: error.message });
      }
      return;
    }

    router.push('/teacher/dashboard');
  };

  return (
    <main className="min-h-screen bg-[#0d0d18] flex items-center justify-center px-4 py-16">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.1),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg space-y-8"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-4 text-violet-400" />
          </div>
          <p className="text-xl font-bold text-white">PlayData</p>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/15 ring-1 ring-violet-500/25">
              <BookOpen className="size-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Teacher profile</h1>
              <p className="text-sm text-[#8d8da0]">Set up your educator account</p>
            </div>
          </div>
          <p className="text-xs text-[#6a6a80] ml-[52px]">Signed in as <span className="text-violet-400">{email}</span></p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {[User, Briefcase, BookOpen].map((Icon, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                i === 0 ? 'bg-violet-600 text-white' : 'bg-[#252538] text-[#8d8da0]'
              )}>
                <Icon className="size-3.5" />
              </div>
              {i < 2 && <div className="h-px w-8 bg-[#35354a]" />}
            </div>
          ))}
          <span className="ml-2 text-xs text-[#8d8da0]">Complete your profile</span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-8 shadow-xl shadow-black/30 backdrop-blur-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Full name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#c9c9d4]">Full name</label>
              <Input
                placeholder="Dr. Your Name"
                className={cn(errors.full_name && 'border-red-500/70')}
                {...register('full_name')}
              />
              {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#c9c9d4]">Username</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#8d8da0]">@</span>
                <Input
                  placeholder="your_username"
                  className={cn('pl-7', errors.username && 'border-red-500/70')}
                  {...register('username')}
                />
              </div>
              {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
            </div>

            {/* Subject taught */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#c9c9d4]">Subject taught</label>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setSubject(s); setValue('subject_taught', s, { shouldValidate: true }); }}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150',
                      subject === s
                        ? 'border-violet-500 bg-violet-600/15 text-violet-200'
                        : 'border-[#35354a] text-[#8d8da0] hover:border-violet-500/40 hover:text-white'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {errors.subject_taught && <p className="text-xs text-red-400">{errors.subject_taught.message}</p>}
            </div>

            {/* Institution role */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#c9c9d4]">Your role</label>
              <div className="grid grid-cols-2 gap-2">
                {INSTITUTION_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setInstRole(r); setValue('institution_role', r, { shouldValidate: true }); }}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150',
                      instRole === r
                        ? 'border-violet-500 bg-violet-600/15 text-violet-200'
                        : 'border-[#35354a] text-[#8d8da0] hover:border-violet-500/40 hover:text-white'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {errors.institution_role && <p className="text-xs text-red-400">{errors.institution_role.message}</p>}
            </div>

            {/* Consent */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" className="sr-only" {...register('consent')} />
              <div className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded border-2 transition-colors',
                errors.consent ? 'border-red-500/70' : 'border-[#35354a] group-hover:border-violet-500/50'
              )} />
              <span className="text-sm text-[#8d8da0] group-hover:text-[#c9c9d4] transition-colors">
                I consent to session and learning data being used within PlayData for educational analytics purposes.
              </span>
            </label>
            {errors.consent && <p className="text-xs text-red-400 -mt-2">{errors.consent.message}</p>}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-violet-600 text-white hover:bg-violet-700 mt-2"
            >
              {isSubmitting
                ? <><Loader2 size={15} className="animate-spin" />Setting up your profile…</>
                : 'Complete setup →'
              }
            </Button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
