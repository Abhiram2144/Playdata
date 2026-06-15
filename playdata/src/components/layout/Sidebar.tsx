import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Zap, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface SidebarProps {
  items: NavItem[];
  profile: {
    full_name: string;
    email: string;
    username?: string | null;
    role: string;
  };
}

export function Sidebar({ items, profile }: SidebarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#35354a]/60 bg-[#0d0d18]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[#35354a]/40 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
          <Zap className="size-3.5 text-violet-400" />
        </div>
        <span className="text-lg font-bold text-white">PlayData</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {items.map((item) => {
          const isActive = router.pathname === item.href || router.pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#4a4a5a] cursor-not-allowed select-none"
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-[#3a3a4a]">Soon</span>
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-violet-600/15 text-violet-300 ring-1 ring-violet-500/20'
                    : 'text-[#8d8da0] hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className={cn('size-4 shrink-0 transition-colors', isActive ? 'text-violet-400' : 'group-hover:text-white')} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[#35354a]/40 px-3 py-3 space-y-1">
        <Link href="/profile">
          <motion.div
            whileHover={{ x: 2 }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#8d8da0] hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/20 ring-1 ring-violet-500/25 shrink-0">
              <User className="size-3.5 text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[#c9c9d4]">
                {profile.full_name || profile.email}
              </p>
              <p className="truncate text-[11px] text-[#6a6a80] capitalize">{profile.role}</p>
            </div>
          </motion.div>
        </Link>

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#6a6a80] hover:bg-red-950/30 hover:text-red-400 transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
