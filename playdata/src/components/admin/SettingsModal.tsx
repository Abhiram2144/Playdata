'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const {
    organizationName,
    defaultTeacherRoleName,
    defaultStudentRoleName,
    guestAccessEnabled,
    aiFeaturesEnabled,
    updateOrganizationSettings,
  } = useAdmin();

  const [formData, setFormData] = useState({
    defaultTeacherRoleName,
    defaultStudentRoleName,
    guestAccessEnabled,
    aiFeaturesEnabled,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateOrganizationSettings({
        default_teacher_role_name: formData.defaultTeacherRoleName,
        default_student_role_name: formData.defaultStudentRoleName,
        guest_access_enabled: formData.guestAccessEnabled,
        ai_features_enabled: formData.aiFeaturesEnabled,
      });
      if (onSave) onSave();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Platform Settings</h2>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-1 hover:bg-slate-100 rounded transition-all"
              >
                <X className="w-5 h-5 text-slate-600" />
              </motion.button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Organization Name (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={organizationName}
                  disabled
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">To change this, contact support</p>
              </div>

              {/* Teacher Role Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Default Teacher Role Name
                </label>
                <input
                  type="text"
                  value={formData.defaultTeacherRoleName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultTeacherRoleName: e.target.value,
                    })
                  }
                  placeholder="e.g., Instructor"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Student Role Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Default Student Role Name
                </label>
                <input
                  type="text"
                  value={formData.defaultStudentRoleName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      defaultStudentRoleName: e.target.value,
                    })
                  }
                  placeholder="e.g., Learner"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Guest Access Toggle */}
              <div className="flex items-center justify-between py-3 border-t border-slate-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Enable Guest Student Access
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    Allow students to join without authentication
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() =>
                    setFormData({
                      ...formData,
                      guestAccessEnabled: !formData.guestAccessEnabled,
                    })
                  }
                  className={`relative w-12 h-6 rounded-full transition-all ${
                    formData.guestAccessEnabled ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <motion.div
                    animate={{
                      x: formData.guestAccessEnabled ? 24 : 2,
                    }}
                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                  />
                </motion.button>
              </div>

              {/* AI Features Toggle */}
              <div className="flex items-center justify-between py-3 border-t border-slate-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Enable AI Features
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    Allow AI-powered quiz generation and insights
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() =>
                    setFormData({
                      ...formData,
                      aiFeaturesEnabled: !formData.aiFeaturesEnabled,
                    })
                  }
                  className={`relative w-12 h-6 rounded-full transition-all ${
                    formData.aiFeaturesEnabled ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <motion.div
                    animate={{
                      x: formData.aiFeaturesEnabled ? 24 : 2,
                    }}
                    className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                  />
                </motion.button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-slate-200">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
