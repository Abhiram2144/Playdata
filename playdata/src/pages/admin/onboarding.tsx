'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Building2, Lock, Settings, CheckCircle } from 'lucide-react';
import {
  PageHeader,
  OnboardingStepper,
  DomainTagInput,
  LoadingState,
} from '@/components/admin';
import { useAdmin } from '@/contexts/AdminContext';
import type { OnboardingState, OrganizationType } from '@/types/admin';

export default function AdminOnboarding() {
  const router = useRouter();
  const { isAuthenticated, onboardingCompleted, updateOnboarding, completeOnboarding } =
    useAdmin();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isAuthenticated);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<OnboardingState>({
    organization_name: '',
    organization_type: 'university',
    allowed_student_domains: [],
    allowed_teacher_domains: [],
    default_teacher_role_name: 'Teacher',
    default_student_role_name: 'Student',
    guest_access_enabled: false,
    ai_features_enabled: true,
    completed: false,
  });

  // Redirect if not authenticated or already completed onboarding
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
    } else if (onboardingCompleted) {
      router.push('/admin/dashboard');
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, onboardingCompleted, router]);

  if (isLoading) {
    return <LoadingState text="Loading onboarding..." fullPage />;
  }

  const steps = [
    {
      number: 1,
      label: 'Organization',
      description: 'Basic information',
    },
    {
      number: 2,
      label: 'Email Domains',
      description: 'Allowed email domains',
    },
    {
      number: 3,
      label: 'Configuration',
      description: 'Platform settings',
    },
    {
      number: 4,
      label: 'Review',
      description: 'Summary & finish',
    },
  ];

  const handleNext = async () => {
    // Validate current step
    if (currentStep === 1) {
      if (!formData.organization_name.trim()) {
        alert('Organization name is required');
        return;
      }
    }
    if (currentStep === 2) {
      // Domain lists are optional for this schema, so allow the admin to continue.
      // The onboarding flow can still be completed without any domain entries.
    }

    if (currentStep < 4) {
      await updateOnboarding(formData);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding(formData);
      router.push('/admin/dashboard');
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      alert('Failed to complete onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-30" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-100 rounded-full blur-3xl opacity-30" />
      </div>

      {/* Container */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
              P
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">PlayData Setup</h1>
              <p className="text-slate-600">Configure your admin environment</p>
            </div>
          </div>
        </motion.div>

        {/* Stepper */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mb-12"
        >
          <OnboardingStepper steps={steps} currentStep={currentStep} />
        </motion.div>

        {/* Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="bg-white rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="p-8 md:p-12">
            <AnimatePresence mode="wait">
              {/* Step 1: Organization Information */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">
                      Organization Information
                    </h2>
                    <p className="text-slate-600">Tell us about your organization</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        value={formData.organization_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            organization_name: e.target.value,
                          })
                        }
                        placeholder="e.g., University of Leicester"
                        className="w-full px-4 py-3 border text-black border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Organization Type
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['university', 'school', 'college', 'other'] as OrganizationType[]).map(
                          (type) => (
                            <motion.button
                              key={type}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              type="button"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  organization_type: type,
                                })
                              }
                              className={`px-4 py-3 rounded-lg border-2 font-medium capitalize transition-all ${
                                formData.organization_type === type
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {type}
                            </motion.button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Email Domains */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Email Domains</h2>
                    <p className="text-slate-600">Add allowed email domains for your organization</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Student email domains
                      </label>
                      <DomainTagInput
                        domains={formData.allowed_student_domains}
                        onDomainsChange={(domains) =>
                          setFormData({
                            ...formData,
                            allowed_student_domains: domains,
                          })
                        }
                        placeholder="e.g., student.leicester.ac.uk"
                      />
                      <p className="text-xs text-slate-500 mt-1.5">
                        Students with an email from these domains can self-register.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Teacher email domains
                      </label>
                      <DomainTagInput
                        domains={formData.allowed_teacher_domains}
                        onDomainsChange={(domains) =>
                          setFormData({
                            ...formData,
                            allowed_teacher_domains: domains,
                          })
                        }
                        placeholder="e.g., leicester.ac.uk"
                      />
                      <p className="text-xs text-slate-500 mt-1.5">
                        Teacher accounts are created by you (see Teachers → Add Teacher) — these
                        domains are an informational reference for which staff emails you expect to invite.
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-700">
                        <span className="font-semibold">Tip:</span> Only the student domain list controls
                        who can create their own account. Teachers never self-register.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Platform Configuration */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">
                      Platform Configuration
                    </h2>
                    <p className="text-slate-600">Customize your platform settings</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Default Teacher Role Name
                        </label>
                        <input
                          type="text"
                          value={formData.default_teacher_role_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              default_teacher_role_name: e.target.value,
                            })
                          }
                          placeholder="e.g., Teacher"
                          className="w-full px-4 py-3 text-black border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Default Student Role Name
                        </label>
                        <input
                          type="text"
                          value={formData.default_student_role_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              default_student_role_name: e.target.value,
                            })
                          }
                          placeholder="e.g., Student"
                          className="w-full px-4 py-3 text-black border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="space-y-3">
                      {/* Guest Access */}
                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">Enable Guest Student Access</p>
                          <p className="text-sm text-slate-600">Allow students to join without authentication</p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              guest_access_enabled: !formData.guest_access_enabled,
                            })
                          }
                          className={`relative w-12 h-6 rounded-full transition-all ${
                            formData.guest_access_enabled ? 'bg-green-500' : 'bg-slate-300'
                          }`}
                        >
                          <motion.div
                            animate={{
                              x: formData.guest_access_enabled ? 24 : 2,
                            }}
                            className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                          />
                        </motion.button>
                      </div>

                      {/* AI Features */}
                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">Enable AI Features</p>
                          <p className="text-sm text-slate-600">Allow AI-powered quiz generation</p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              ai_features_enabled: !formData.ai_features_enabled,
                            })
                          }
                          className={`relative w-12 h-6 rounded-full transition-all ${
                            formData.ai_features_enabled ? 'bg-green-500' : 'bg-slate-300'
                          }`}
                        >
                          <motion.div
                            animate={{
                              x: formData.ai_features_enabled ? 24 : 2,
                            }}
                            className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                          />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Review & Finish */}
              {currentStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Review & Finish</h2>
                    <p className="text-slate-600">Verify your setup before completing</p>
                  </div>

                  <div className="space-y-4">
                    {/* Organization Card */}
                    <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-100 rounded-lg">
                          <Building2 className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-indigo-600 font-medium uppercase">Organization</p>
                          <p className="text-lg font-bold text-slate-900">{formData.organization_name}</p>
                          <p className="text-sm text-slate-600 mt-1 capitalize">
                            Type: {formData.organization_type}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Domains Card */}
                    <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg space-y-4">
                      <div>
                        <p className="text-sm text-green-600 font-medium uppercase mb-3">
                          Student Domains ({formData.allowed_student_domains.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {formData.allowed_student_domains.map((domain) => (
                            <span
                              key={domain}
                              className="px-3 py-1.5 bg-white border border-green-200 text-green-700 rounded-full text-sm font-medium"
                            >
                              {domain}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-green-600 font-medium uppercase mb-3">
                          Teacher Domains ({formData.allowed_teacher_domains.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {formData.allowed_teacher_domains.map((domain) => (
                            <span
                              key={domain}
                              className="px-3 py-1.5 bg-white border border-green-200 text-green-700 rounded-full text-sm font-medium"
                            >
                              {domain}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Settings Card */}
                    <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-600 font-medium uppercase mb-4">Settings</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-slate-600">Teacher Role</p>
                          <p className="font-semibold text-slate-900">{formData.default_teacher_role_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Student Role</p>
                          <p className="font-semibold text-slate-900">{formData.default_student_role_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">Guest Access</p>
                          <p className="font-semibold text-slate-900">
                            {formData.guest_access_enabled ? '✓ Enabled' : '✗ Disabled'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">AI Features</p>
                          <p className="font-semibold text-slate-900">
                            {formData.ai_features_enabled ? '✓ Enabled' : '✗ Disabled'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-8 md:px-12 py-6 bg-slate-50 border-t border-slate-200">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </motion.button>

            {currentStep < 4 ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleComplete}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                <CheckCircle className="w-4 h-4" />
                {isSubmitting ? 'Completing...' : 'Complete Setup'}
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
