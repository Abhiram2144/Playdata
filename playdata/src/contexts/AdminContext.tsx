'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  AdminContextType,
  OnboardingState,
  OrganizationSettings,
  OrganizationType,
} from '@/types/admin';

const AdminContext = createContext<AdminContextType | undefined>(undefined);

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [organizationName, setOrganizationName] = useState('');
  const [organizationType, setOrganizationType] = useState<OrganizationType>('university');
  const [allowedStudentDomains, setAllowedStudentDomains] = useState<string[]>([]);
  const [allowedTeacherDomains, setAllowedTeacherDomains] = useState<string[]>([]);
  const [defaultTeacherRoleName, setDefaultTeacherRoleName] = useState('Teacher');
  const [defaultStudentRoleName, setDefaultStudentRoleName] = useState('Student');
  const [guestAccessEnabled, setGuestAccessEnabled] = useState(false);
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [teacherCount, setTeacherCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);

  const fetchOrgData = useCallback(async (userId: string) => {
    const supabase = getSupabase();

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from('admin_profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    if (adminProfileError) {
      console.error('Failed to load admin onboarding state', adminProfileError);
    }

    const completed = adminProfile?.onboarding_completed ?? false;

    if (!adminProfile) {
      await supabase
        .from('admin_profiles')
        .upsert({ id: userId, onboarding_completed: false }, { onConflict: 'id', ignoreDuplicates: true });
    }

    setOnboardingCompleted(completed);

    if (!completed) return;

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, type')
      .eq('admin_id', userId)
      .maybeSingle();

    if (org) {
      setOrganizationId(org.id);
      setOrganizationName(org.name);
      setOrganizationType(org.type as OrganizationType);

      const { data: settings } = await supabase
        .from('organization_settings')
        .select('default_teacher_role_name, default_student_role_name, guest_access_enabled, ai_features_enabled')
        .eq('organization_id', org.id)
        .maybeSingle();

      if (settings) {
        setDefaultTeacherRoleName(settings.default_teacher_role_name);
        setDefaultStudentRoleName(settings.default_student_role_name);
        setGuestAccessEnabled(settings.guest_access_enabled);
        setAiFeaturesEnabled(settings.ai_features_enabled);
      }

      const { data: domains } = await supabase
        .from('organization_email_domains')
        .select('domain, applies_to')
        .eq('organization_id', org.id);

      if (domains) {
        setAllowedStudentDomains(domains.filter((d) => d.applies_to === 'student').map((d) => d.domain));
        setAllowedTeacherDomains(domains.filter((d) => d.applies_to === 'teacher').map((d) => d.domain));
      }
    }

    const { count: tc } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'teacher');

    const { count: sc } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student');

    setTeacherCount(tc ?? 0);
    setStudentCount(sc ?? 0);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const supabase = getSupabase();

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, full_name, email')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.role === 'admin') {
            setIsAuthenticated(true);
            setAdminId(user.id);
            setAdminEmail(profile.email ?? user.email ?? null);
            setAdminName(profile.full_name || user.email || null);
            await fetchOrgData(user.id);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [fetchOrgData]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('No user returned');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('Not an admin account');
      }

      setIsAuthenticated(true);
      setAdminId(data.user.id);
      setAdminEmail(profile.email ?? data.user.email ?? null);
      setAdminName(profile.full_name || data.user.email || null);
      await fetchOrgData(data.user.id);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrgData]);

  const logout = useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setAdminId(null);
    setAdminEmail(null);
    setAdminName(null);
    setOrganizationId(null);
    setOrganizationName('');
    setOrganizationType('university');
    setAllowedStudentDomains([]);
    setAllowedTeacherDomains([]);
    setOnboardingCompleted(false);
    setTeacherCount(0);
    setStudentCount(0);
  }, []);

  const updateOnboarding = useCallback(async (state: Partial<OnboardingState>) => {
    if (state.organization_name !== undefined) setOrganizationName(state.organization_name);
    if (state.organization_type !== undefined) setOrganizationType(state.organization_type);
    if (state.allowed_student_domains !== undefined) setAllowedStudentDomains(state.allowed_student_domains);
    if (state.allowed_teacher_domains !== undefined) setAllowedTeacherDomains(state.allowed_teacher_domains);
    if (state.default_teacher_role_name !== undefined) setDefaultTeacherRoleName(state.default_teacher_role_name);
    if (state.default_student_role_name !== undefined) setDefaultStudentRoleName(state.default_student_role_name);
    if (state.guest_access_enabled !== undefined) setGuestAccessEnabled(state.guest_access_enabled);
    if (state.ai_features_enabled !== undefined) setAiFeaturesEnabled(state.ai_features_enabled);
  }, []);

  const completeOnboarding = useCallback(async (state: OnboardingState) => {
    if (!adminId) throw new Error('Not authenticated');

    const response = await fetch('/api/admin/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_name: state.organization_name,
        organization_type: state.organization_type,
        allowed_student_domains: state.allowed_student_domains,
        allowed_teacher_domains: state.allowed_teacher_domains,
        default_teacher_role_name: state.default_teacher_role_name,
        default_student_role_name: state.default_student_role_name,
        guest_access_enabled: state.guest_access_enabled,
        ai_features_enabled: state.ai_features_enabled,
      }),
    });

    const json = await response.json() as { success?: boolean; error?: string; organization_id?: string | null };
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Failed to complete onboarding');
    }

    setOrganizationId(json.organization_id ?? null);
    setOrganizationName(state.organization_name);
    setOrganizationType(state.organization_type);
    setAllowedStudentDomains(state.allowed_student_domains);
    setAllowedTeacherDomains(state.allowed_teacher_domains);
    setDefaultTeacherRoleName(state.default_teacher_role_name);
    setDefaultStudentRoleName(state.default_student_role_name);
    setGuestAccessEnabled(state.guest_access_enabled);
    setAiFeaturesEnabled(state.ai_features_enabled);
    setOnboardingCompleted(true);
  }, [adminId]);

  const updateOrganizationSettings = useCallback(async (settings: Partial<OrganizationSettings>) => {
    if (!organizationId) throw new Error('No organization found');

    const response = await fetch('/api/admin/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    const json = await response.json() as { success?: boolean; error?: string };
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Failed to update organization settings');
    }

    if (settings.organization_name !== undefined) setOrganizationName(settings.organization_name);
    if (settings.organization_type !== undefined) setOrganizationType(settings.organization_type);
    if (settings.allowed_student_domains !== undefined) setAllowedStudentDomains(settings.allowed_student_domains);
    if (settings.allowed_teacher_domains !== undefined) setAllowedTeacherDomains(settings.allowed_teacher_domains);
    if (settings.default_teacher_role_name !== undefined) setDefaultTeacherRoleName(settings.default_teacher_role_name);
    if (settings.default_student_role_name !== undefined) setDefaultStudentRoleName(settings.default_student_role_name);
    if (settings.guest_access_enabled !== undefined) setGuestAccessEnabled(settings.guest_access_enabled);
    if (settings.ai_features_enabled !== undefined) setAiFeaturesEnabled(settings.ai_features_enabled);
  }, [organizationId]);

  const value: AdminContextType = {
    isAuthenticated,
    isLoading,
    adminEmail,
    adminName,
    organizationName,
    organizationType,
    allowedStudentDomains,
    allowedTeacherDomains,
    defaultTeacherRoleName,
    defaultStudentRoleName,
    guestAccessEnabled,
    aiFeaturesEnabled,
    onboardingCompleted,
    teacherCount,
    studentCount,
    login,
    logout,
    updateOnboarding,
    completeOnboarding,
    updateOrganizationSettings,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextType {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
