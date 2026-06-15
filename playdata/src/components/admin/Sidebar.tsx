'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Users2,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export function Sidebar() {
  const router = useRouter();
  const pathname = router.pathname;
  const { logout } = useAdmin();

  const handleLogout = async () => {
    await logout();
    router.push('/admin/login');
  };

  const menuItems: SidebarItem[] = [
    {
      label: 'Dashboard',
      href: '/admin/dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      label: 'Teachers',
      href: '/admin/teachers',
      icon: <Users className="w-5 h-5" />,
    },
    {
      label: 'Students',
      href: '/admin/students',
      icon: <Users2 className="w-5 h-5" />,
    },
    {
      label: 'Analytics',
      href: '/admin/analytics',
      icon: <BarChart3 className="w-5 h-5" />,
    },
    {
      label: 'Settings',
      href: '/admin/settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <motion.aside
      initial={{ x: -250 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40"
    >
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200">
        <Link href="/admin/dashboard" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            P
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg">PlayData</h1>
            <p className="text-xs text-slate-600">Admin</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <motion.div
                key={item.href}
                whileHover={!item.disabled ? { x: 4 } : {}}
                transition={{ duration: 0.2 }}
              >
                <Link
                  href={item.disabled ? '#' : item.href}
                  onClick={(e) => { if (item.disabled) e.preventDefault(); }}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all group ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : item.disabled
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {isActive && !item.disabled && (
                    <ChevronRight className="w-4 h-4 text-indigo-600" />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all font-medium"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </motion.aside>
  );
}
