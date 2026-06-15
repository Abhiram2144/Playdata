'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: 'blue' | 'purple' | 'green' | 'amber' | 'red';
  change?: number;
  change_type?: 'increase' | 'decrease';
}

const colorMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'text-blue-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'text-purple-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600', icon: 'text-green-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600', icon: 'text-red-600' },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  change,
  change_type = 'increase',
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 1000; // 1 second animation
    const steps = 60;
    const stepValue = value / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      setDisplayValue(Math.floor(stepValue * currentStep));
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(interval);
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  const colors = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
      className={`p-6 rounded-lg border border-slate-200 bg-white`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-slate-600 font-medium mb-2">{label}</p>
          <p className={`text-3xl font-bold ${colors.text.replace('text-', 'text-slate-900')}`}>
            {displayValue}
          </p>
          {change !== undefined && (
            <div className={`text-xs font-medium mt-2 ${change_type === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
              {change_type === 'increase' ? '↑' : '↓'} {change}% from last month
            </div>
          )}
        </div>
        <motion.div whileHover={{ rotate: 10 }} className={`p-3 rounded-lg ${colors.bg}`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </motion.div>
      </div>
    </motion.div>
  );
}
