'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}

export function PageHeader({ title, subtitle, icon: Icon }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-2">
        {Icon && <Icon className="w-8 h-8 text-indigo-600" />}
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      </div>
      {subtitle && <p className="text-slate-600">{subtitle}</p>}
    </motion.div>
  );
}
