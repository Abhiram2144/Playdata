import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  Settings,
  Globe,
  Plus,
  X,
  Save,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { Sidebar, Navbar, LoadingState } from '@/components/admin';
import { useAdmin } from '@/contexts/AdminContext';
import { toast } from 'sonner';
import type { OrganizationType } from '@/types/admin';

const ORG_TYPES: { value: OrganizationType; label: string }[] = [
  { value: 'university', label: 'University' },
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'other', label: 'Other' },
];

export default function AdminSettings() {
  const router = useRouter();
  const {
    isAuthenticated,
    onboardingCompleted,
    isLoading,
    organizationName,
    organizationType,
    allowedStudentDomains,
    allowedTeacherDomains,
    defaultTeacherRoleName,
    defaultStudentRoleName,
    guestAccessEnabled,
    aiFeaturesEnabled,
    updateOrganizationSettings,
  } = useAdmin();

  const [orgName, setOrgName] = useState(organizationName);
  const [orgType, setOrgType] = useState<OrganizationType>(organizationType);
  const [studentDomains, setStudentDomains] = useState<string[]>(allowedStudentDomains);
  const [studentDomainInput, setStudentDomainInput] = useState('');
  const [teacherDomains, setTeacherDomains] = useState<string[]>(allowedTeacherDomains);
  const [teacherDomainInput, setTeacherDomainInput] = useState('');
  const [teacherRoleName, setTeacherRoleName] = useState(defaultTeacherRoleName);
  const [studentRoleName, setStudentRoleName] = useState(defaultStudentRoleName);
  const [guestAccess, setGuestAccess] = useState(guestAccessEnabled);
  const [aiFeatures, setAiFeatures] = useState(aiFeaturesEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync with context when it loads
  useEffect(() => {
    setOrgName(organizationName);
    setOrgType(organizationType);
    setStudentDomains(allowedStudentDomains);
    setTeacherDomains(allowedTeacherDomains);
    setTeacherRoleName(defaultTeacherRoleName);
    setStudentRoleName(defaultStudentRoleName);
    setGuestAccess(guestAccessEnabled);
    setAiFeatures(aiFeaturesEnabled);
  }, [organizationName, organizationType, allowedStudentDomains, allowedTeacherDomains, defaultTeacherRoleName, defaultStudentRoleName, guestAccessEnabled, aiFeaturesEnabled]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/admin/login');
    else if (!isLoading && isAuthenticated && !onboardingCompleted) router.replace('/admin/onboarding');
  }, [isAuthenticated, isLoading, onboardingCompleted, router]);

  const addStudentDomain = () => {
    const d = studentDomainInput.trim().toLowerCase().replace(/^@/, '');
    if (!d || !d.includes('.')) { toast.error('Enter a valid domain (e.g. university.ac.uk)'); return; }
    if (studentDomains.includes(d)) { toast.error('Domain already added'); return; }
    setStudentDomains((prev) => [...prev, d]);
    setStudentDomainInput('');
  };

  const removeStudentDomain = (domain: string) => {
    setStudentDomains((prev) => prev.filter((d) => d !== domain));
  };

  const addTeacherDomain = () => {
    const d = teacherDomainInput.trim().toLowerCase().replace(/^@/, '');
    if (!d || !d.includes('.')) { toast.error('Enter a valid domain (e.g. university.ac.uk)'); return; }
    if (teacherDomains.includes(d)) { toast.error('Domain already added'); return; }
    setTeacherDomains((prev) => [...prev, d]);
    setTeacherDomainInput('');
  };

  const removeTeacherDomain = (domain: string) => {
    setTeacherDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleSave = async () => {
    if (!orgName.trim()) { toast.error('Organisation name is required'); return; }
    if (studentDomains.length === 0 && teacherDomains.length === 0) { toast.error('At least one email domain is required'); return; }

    setSaving(true);
    setSaved(false);
    try {
      await updateOrganizationSettings({
        organization_name: orgName.trim(),
        organization_type: orgType,
        allowed_student_domains: studentDomains,
        allowed_teacher_domains: teacherDomains,
        default_teacher_role_name: teacherRoleName.trim() || 'Teacher',
        default_student_role_name: studentRoleName.trim() || 'Student',
        guest_access_enabled: guestAccess,
        ai_features_enabled: aiFeatures,
      });
      setSaved(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !isAuthenticated || !onboardingCompleted) {
    return <LoadingState text="Loading…" fullPage />;
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-all ${value ? 'bg-green-500' : 'bg-slate-300'}`}
    >
      <motion.div
        animate={{ x: value ? 24 : 2 }}
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow"
      />
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <Navbar />
      <main className="ml-64 mt-16 p-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
              <p className="text-slate-600 mt-1">Manage your organisation and platform configuration</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium disabled:opacity-50"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              ) : saved ? (
                <><CheckCircle className="w-4 h-4" />Saved</>
              ) : (
                <><Save className="w-4 h-4" />Save changes</>
              )}
            </motion.button>
          </motion.div>

          <div className="space-y-6">
            {/* Organisation Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl border border-slate-200 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Organisation Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Organisation Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="University of Leicester"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Organisation Type
                  </label>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as OrganizationType)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    {ORG_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>

            {/* Email Domains */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-xl border border-slate-200 p-6 space-y-6"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-600" />
                  Student Email Domains
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  Students with these email domains can self-register and sign in.
                </p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={studentDomainInput}
                    onChange={(e) => setStudentDomainInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStudentDomain(); } }}
                    placeholder="student.university.ac.uk"
                    className="flex-1 px-4 py-2.5 border text-black border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addStudentDomain}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>

                {studentDomains.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                    No domains added yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {studentDomains.map((domain) => (
                      <motion.span
                        key={domain}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium"
                      >
                        @{domain}
                        <button
                          type="button"
                          onClick={() => removeStudentDomain(domain)}
                          className="text-indigo-400 hover:text-indigo-700 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.span>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-600" />
                  Teacher Email Domains
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  Reference list of domains you expect to invite teachers from (see Teachers → Add Teacher). Teachers never self-register.
                </p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={teacherDomainInput}
                    onChange={(e) => setTeacherDomainInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTeacherDomain(); } }}
                    placeholder="university.ac.uk"
                    className="flex-1 px-4 py-2.5 border text-black border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addTeacherDomain}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>

                {teacherDomains.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                    No domains added yet
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teacherDomains.map((domain) => (
                      <motion.span
                        key={domain}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium"
                      >
                        @{domain}
                        <button
                          type="button"
                          onClick={() => removeTeacherDomain(domain)}
                          className="text-indigo-400 hover:text-indigo-700 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Role Names */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl border border-slate-200 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-5">Role Display Names</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Teacher Role Name
                  </label>
                  <input
                    type="text"
                    value={teacherRoleName}
                    onChange={(e) => setTeacherRoleName(e.target.value)}
                    placeholder="Teacher"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Student Role Name
                  </label>
                  <input
                    type="text"
                    value={studentRoleName}
                    onChange={(e) => setStudentRoleName(e.target.value)}
                    placeholder="Student"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
            </motion.div>

            {/* Platform Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white rounded-xl border border-slate-200 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-5">Platform Features</h2>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">Guest Student Access</p>
                    <p className="text-xs text-slate-500 mt-0.5">Allow students to join sessions without signing in</p>
                  </div>
                  <Toggle value={guestAccess} onChange={() => setGuestAccess((v) => !v)} />
                </div>
                <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">AI Features</p>
                    <p className="text-xs text-slate-500 mt-0.5">Enable AI-powered quiz generation and explanations</p>
                  </div>
                  <Toggle value={aiFeatures} onChange={() => setAiFeatures((v) => !v)} />
                </div>
              </div>
            </motion.div>

            {/* Save button (bottom) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex justify-end pb-8"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold disabled:opacity-50"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                ) : saved ? (
                  <><CheckCircle className="w-4 h-4" />Saved!</>
                ) : (
                  <><Save className="w-4 h-4" />Save all changes</>
                )}
              </motion.button>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
