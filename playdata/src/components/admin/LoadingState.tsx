'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  text?: string;
  fullPage?: boolean;
}

export function LoadingState({ text = 'Loading...', fullPage = false }: LoadingStateProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 },
  };

  const spinnerVariant = {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear' as const,
    },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={`flex flex-col items-center justify-center gap-4 ${fullPage ? 'min-h-screen' : 'py-12'}`}
    >
      <motion.div
        variants={item}
        animate={spinnerVariant}
        className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full"
      ></motion.div>
      {text && (
        <motion.p variants={item} className="text-slate-600 font-medium">
          {text}
        </motion.p>
      )}
    </motion.div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="py-12 text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="flex justify-center mb-4"
      >
        <div className="p-4 bg-slate-100 rounded-lg text-slate-400">{icon}</div>
      </motion.div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 mb-6 max-w-sm mx-auto">{description}</p>
      {action && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={action.onClick}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-all"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}
