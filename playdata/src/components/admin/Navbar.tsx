'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bell, User, Settings } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

export function Navbar() {
  const { adminEmail, adminName } = useAdmin();

  return (
    <motion.header
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed left-64 right-0 top-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-30"
    >
      <div className="flex-1" />

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </motion.button>

        {/* Settings */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
        >
          <Settings className="w-5 h-5" />
        </motion.button>

        {/* Profile */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-semibold">
              {adminName?.charAt(0).toUpperCase()}
            </div>
          </motion.button>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-slate-900">{adminName}</p>
            <p className="text-xs text-slate-600">{adminEmail}</p>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
