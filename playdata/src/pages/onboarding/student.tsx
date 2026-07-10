import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Zap, GraduationCap, User, BookOpen, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { createClientFromContext } from '@/lib/supabase/server-props';

const EDUCATION_LEVELS = [
  'GCSE / Secondary',
  'A-Level / Sixth Form',
  'Undergraduate (Year 1)',
  'Undergraduate (Year 2)',
  'Undergraduate (Year 3)',
  'Postgraduate (Masters)',
  'Postgraduate (PhD)',
  'Other',
] as const;

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  education_level: z.string().min(1, 'Select your education level'),
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

  if (profile?.role === 'teacher') {
    return { redirect: { destination: '/onboarding/teacher', permanent: false } };
  }

  return { props: { email: user.email! } };
};

export default function StudentOnboarding({ email }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedLevel, setSelectedLevel] = useState('');

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Session expired'); router.push('/auth/login'); return; }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        username: user.email!.split('@')[0].toLowerCase(),
        full_name: data.full_name.trim(),
        education_level: data.education_level,
        role: 'student',
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      if (error.code === '23505') {
        toast.error('Username taken', { description: 'Please choose a different username.' });
      } else {
        toast.error('Something went wrong', { description: error.message });
      }
      return;
    }

    router.push('/student/dashboard');
  };

  const slideProps = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3 },
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
              <GraduationCap className="size-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Welcome aboard</h1>
              <p className="text-sm text-[#8d8da0]">Set up your student profile</p>
            </div>
          </div>
          <p className="text-xs text-[#6a6a80] ml-[52px]">Signed in as <span className="text-violet-400">{email}</span></p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {[User, BookOpen, CheckCircle2].map((Icon, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                i === 0 ? 'bg-violet-600 text-white' : 'bg-[#252538] text-[#8d8da0]'
              )}>
                <Icon className="size-3.5" />
              </div>
              {i < 2 && <div className="h-px w-8 bg-[#35354a]" />}
            </div>
          ))}
          <span className="ml-2 text-xs text-[#8d8da0]">Complete your profile</span>
        </div>

        {/* Form card */}
        <AnimatePresence mode="wait">
          <motion.div {...slideProps} key="form"
            className="rounded-2xl border border-white/8 bg-white/3 p-8 shadow-xl shadow-black/30 backdrop-blur-xl"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Full name */}
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
                Your email address is already your sign-in identity. We’ll use your full name and education level for your profile.
              </div>

              {/* Education level */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#c9c9d4]">Education level</label>
                <div className="grid grid-cols-2 gap-2">
                  {EDUCATION_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { setSelectedLevel(level); setValue('education_level', level, { shouldValidate: true }); }}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-sm transition-all duration-150',
                        selectedLevel === level
                          ? 'border-violet-500 bg-violet-600/15 text-violet-200'
                          : 'border-[#35354a] bg-transparent text-[#8d8da0] hover:border-violet-500/40 hover:text-white'
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                {errors.education_level && <p className="text-xs text-red-400">{errors.education_level.message}</p>}
              </div>

              {/* Consent */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    className="sr-only"
                    {...register('consent')}
                  />
                  <div className={cn(
                    'h-4.5 w-4.5 rounded border-2 transition-colors flex items-center justify-center',
                    errors.consent ? 'border-red-500/70' : 'border-[#35354a] group-hover:border-violet-500/50'
                  )}>
                  </div>
                </div>
                <span className="text-sm text-[#8d8da0] group-hover:text-[#c9c9d4] transition-colors">
                  I consent to my learning data being used within PlayData for educational purposes.
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
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </main>
  );
}
