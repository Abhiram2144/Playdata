import { useState } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { Menu, Zap } from 'lucide-react';
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
  /** Page-specific title, e.g. "Datasets". Rendered as "{title} · PlayData".
   *  Every screen-reader/browser tab needs a distinct, non-empty <title> to
   *  orient by (WCAG 2.4.2) — falls back to plain "PlayData" if omitted. */
  title?: string;
}

export function DashboardLayout({ children, navItems, profile, title }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f5f3ff]">
      <Head>
        <title>{title ? `${title} · PlayData` : 'PlayData'}</title>
      </Head>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        items={navItems}
        profile={profile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="md:pl-60">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#e4e0f8] bg-white px-4 shadow-sm md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 ring-1 ring-violet-200">
              <Zap className="size-3 text-violet-600" />
            </div>
            <span className="text-sm font-bold text-gray-900">PlayData</span>
          </div>
        </div>

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="min-h-screen px-4 py-6 md:px-8 md:py-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
