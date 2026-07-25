import { motion } from 'framer-motion';
import { Sidebar, type NavItem } from './Sidebar';

interface Profile {
  full_name: string;
  email: string;
  username?: string | null;
  role: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  navItems: NavItem[];
  profile: Profile;
}

export function DashboardLayout({ children, navItems, profile }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#f5f3ff]">
      <Sidebar items={navItems} profile={profile} />
      <div className="pl-60">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="min-h-screen px-8 py-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
