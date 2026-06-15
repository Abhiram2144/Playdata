'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Users2,
  Globe,
  Zap,
  Settings,
  Edit3,
  Shield,
  Globe2,
} from 'lucide-react';
import {
  Sidebar,
  Navbar,
  PageHeader,
  DashboardCard,
  StatCard,
  LoadingState,
  SettingsModal,
} from '@/components/admin';
import { useAdmin } from '@/contexts/AdminContext';

export default function AdminDashboard() {
  const router = useRouter();
  const {
    isAuthenticated,
    onboardingCompleted,
    isLoading,
    organizationName,
    allowedDomains,
    guestAccessEnabled,
    aiFeaturesEnabled,
    teacherCount,
    studentCount,
  } = useAdmin();

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
    } else if (!onboardingCompleted) {
      router.push('/admin/onboarding');
    }
  }, [isAuthenticated, onboardingCompleted, router]);

  if (isLoading || !isAuthenticated || !onboardingCompleted) {
    return <LoadingState text="Loading dashboard..." fullPage />;
  }

  const quickActions = [
    {
      id: 'organization',
      title: 'Edit Organization',
      description: 'Update organization information and domains',
      icon: <Edit3 className="w-6 h-6" />,
      action: () => setSettingsOpen(true),
    },
    {
      id: 'domains',
      title: 'Manage Domains',
      description: 'Add or remove allowed email domains',
      icon: <Globe2 className="w-6 h-6" />,
      action: () => setSettingsOpen(true),
    },
    {
      id: 'settings',
      title: 'Platform Settings',
      description: 'Configure AI and guest access features',
      icon: <Settings className="w-6 h-6" />,
      action: () => setSettingsOpen(true),
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar & Navbar */}
      <Sidebar />
      <Navbar />

      {/* Main Content */}
      <main className="ml-64 mt-16 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-1">Welcome to PlayData Admin</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
              >
                <Settings className="w-4 h-4" />
                Settings
              </motion.button>
            </div>
          </motion.div>

          {/* Welcome Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-2">
                  Welcome to PlayData Admin
                </h2>
                <p className="text-slate-600 mb-4">
                  Your organization <span className="font-semibold">{organizationName}</span> is
                  ready to go!
                </p>
                <div className="flex gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Allowed Domains</p>
                    <p className="font-bold text-slate-900">{allowedDomains.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Guest Access</p>
                    <p className="font-bold text-slate-900">
                      {guestAccessEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">AI Features</p>
                    <p className="font-bold text-slate-900">
                      {aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
              </div>
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="text-indigo-600"
              >
                <Shield className="w-12 h-12" />
              </motion.div>
            </div>
          </motion.div>

          {/* Statistics Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <motion.div variants={itemVariants}>
              <DashboardCard
                title="Organization"
                value={organizationName}
                description="Your institution"
                icon={<Globe className="w-6 h-6 text-blue-600" />}
                color="blue"
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <DashboardCard
                title="Allowed Domains"
                value={allowedDomains.length}
                description={`${allowedDomains.length} domain${allowedDomains.length !== 1 ? 's' : ''} configured`}
                icon={<Globe2 className="w-6 h-6 text-purple-600" />}
                color="purple"
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <DashboardCard
                title="Guest Access"
                value={guestAccessEnabled ? 'Enabled' : 'Disabled'}
                description="Guest student access"
                icon={
                  <Users className="w-6 h-6" style={{ color: guestAccessEnabled ? '#10b981' : '#ef4444' }} />
                }
                color={guestAccessEnabled ? 'green' : 'blue'}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <DashboardCard
                title="AI Features"
                value={aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
                description="AI-powered tools"
                icon={
                  <Zap className="w-6 h-6" style={{ color: aiFeaturesEnabled ? '#f59e0b' : '#ef4444' }} />
                }
                color={aiFeaturesEnabled ? 'amber' : 'blue'}
              />
            </motion.div>
          </motion.div>

          {/* Stats Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <motion.div variants={itemVariants}>
              <StatCard
                label="Teachers"
                value={teacherCount}
                icon={Users}
                color="blue"
                change={0}
              />
            </motion.div>

            <motion.div variants={itemVariants}>
              <StatCard
                label="Students"
                value={studentCount}
                icon={Users2}
                color="purple"
                change={0}
              />
            </motion.div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
              <p className="text-slate-600 text-sm">Common administrative tasks</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action) => (
                <motion.div
                  key={action.id}
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  onClick={action.action}
                  className="p-6 bg-white rounded-lg border border-slate-200 cursor-pointer hover:shadow-lg transition-all"
                >
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className="p-3 bg-indigo-100 rounded-lg w-fit mb-4 text-indigo-600"
                  >
                    {action.icon}
                  </motion.div>
                  <h3 className="font-semibold text-slate-900 mb-2">{action.title}</h3>
                  <p className="text-sm text-slate-600">{action.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Domains List */}
          {allowedDomains.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="mt-8"
            >
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">Allowed Email Domains</h2>
                <p className="text-slate-600 text-sm">
                  Users with these email domains can access your platform
                </p>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="p-6 bg-white rounded-lg border border-slate-200"
              >
                <div className="flex flex-wrap gap-2">
                  {allowedDomains.map((domain, index) => (
                    <motion.div
                      key={domain}
                      variants={itemVariants}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-medium"
                    >
                      {domain}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => setSettingsOpen(false)}
      />
    </div>
  );
}
