import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { UserRole } from '@/types';

const ROLE_DEST: Record<UserRole, string> = {
  admin: '/admin',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const supabase = createClientFromContext(context);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return { redirect: { destination: ROLE_DEST[(profile?.role as UserRole) ?? 'student'], permanent: false } };
  }

  return { props: {} };
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d18] p-6 text-center">
      <div className="space-y-8 max-w-xl">

        <div className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30">
            <Zap className="size-8 text-violet-400" />
          </div>
          <h1 className="text-5xl font-black tracking-tight text-white">PlayData</h1>
          <p className="text-lg text-[#8d8da0]">
            Transform real esports data into interactive mathematics lessons.
            Built for teachers and students.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button asChild className="bg-violet-600 text-white hover:bg-violet-700 px-6">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>

        <p className="text-xs text-[#6a6a80]">AI-powered · Real-time sessions · Esports datasets</p>
      </div>
    </div>
  );
}
