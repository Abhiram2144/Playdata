import { useRouter } from 'next/router';
import { withAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';

export const getServerSideProps = withAuth(
  async () => ({ props: {} }),
  { allowedRoles: ['admin'] }
);

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/loginpage');
  };

  return (
    <div className="min-h-screen bg-[#0d0d18] p-8 text-white">
      <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-[#8d8da0] mb-6">Manage users, settings, and dataset connections.</p>
      <button onClick={handleSignOut} className="text-sm text-red-400 hover:text-red-300 transition-colors">Sign out</button>
    </div>
  );
}
