import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Zap, LogOut, User, X } from 'lucide-react';
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
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ items, profile, isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#e4e0f8] bg-white shadow-sm',
      'transition-transform duration-300 ease-in-out',
      'md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-[#e4e0f8] px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 ring-1 ring-violet-200">
          <Zap className="size-3.5 text-violet-600" />
        </div>
        <span className="text-lg font-bold text-gray-900">PlayData</span>
        <button
          onClick={onClose}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition md:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
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
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-300 cursor-not-allowed select-none"
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-gray-300">Soon</span>
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <motion.div
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                )}
              >
                <Icon className={cn('size-4 shrink-0 transition-colors', isActive ? 'text-violet-600' : 'group-hover:text-gray-700')} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[#e4e0f8] px-3 py-3 space-y-1">
        <Link href="/profile" onClick={onClose}>
          <motion.div
            whileHover={{ x: 2 }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 ring-1 ring-violet-200 shrink-0">
              <User className="size-3.5 text-violet-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-800">
                {profile.full_name || profile.email}
              </p>
              <p className="truncate text-[11px] text-gray-400 capitalize">{profile.role}</p>
            </div>
          </motion.div>
        </Link>

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
