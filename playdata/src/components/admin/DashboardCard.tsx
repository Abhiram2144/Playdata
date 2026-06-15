'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  description?: string;
  color?: 'blue' | 'purple' | 'green' | 'amber';
  onClick?: () => void;
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
};

const iconBgMap = {
  blue: 'bg-blue-100',
  purple: 'bg-purple-100',
  green: 'bg-green-100',
  amber: 'bg-amber-100',
};

export function DashboardCard({
  title,
  value,
  icon,
  description,
  color = 'blue',
  onClick,
}: DashboardCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 20px 25px -5rgba(0,0,0,0.1)' }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`p-6 bg-white rounded-lg border border-slate-200 cursor-pointer transition-all ${onClick ? 'hover:border-slate-300' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {description && <p className="text-xs text-slate-500 mt-2">{description}</p>}
        </div>
        {icon && <div className={`p-3 rounded-lg ${iconBgMap[color]}`}>{icon}</div>}
      </div>
    </motion.div>
  );
}
