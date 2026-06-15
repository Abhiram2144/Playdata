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
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [defaultTeacherRoleName, setDefaultTeacherRoleName] = useState('Teacher');
  const [defaultStudentRoleName, setDefaultStudentRoleName] = useState('Student');
  const [guestAccessEnabled, setGuestAccessEnabled] = useState(false);
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [teacherCount, setTeacherCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);

  const fetchOrgData = useCallback(async (userId: string) => {
    const supabase = getSupabase();

    const { data: adminProfile } = await supabase
      .from('admin_profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    const completed = adminProfile?.onboarding_completed ?? false;
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
        .select('*')
        .eq('organization_id', org.id)
        .maybeSingle();

      if (settings) {
        setDefaultTeacherRoleName(settings.default_teacher_role_name);
        setDefaultStudentRoleName(settings.default_student_role_name);
        setGuestAccessEnabled(settings.guest_access_enabled);
        setAiFeaturesEnabled(settings.ai_features_enabled);
      }

      const { data: domainRows } = await supabase
        .from('organization_email_domains')
        .select('domain')
        .eq('organization_id', org.id);

      setAllowedDomains(domainRows?.map((r) => r.domain) ?? []);
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
    setAllowedDomains([]);
    setOnboardingCompleted(false);
    setTeacherCount(0);
    setStudentCount(0);
  }, []);

  const updateOnboarding = useCallback(async (state: Partial<OnboardingState>) => {
    if (state.organization_name !== undefined) setOrganizationName(state.organization_name);
    if (state.organization_type !== undefined) setOrganizationType(state.organization_type);
    if (state.allowed_domains !== undefined) setAllowedDomains(state.allowed_domains);
    if (state.default_teacher_role_name !== undefined) setDefaultTeacherRoleName(state.default_teacher_role_name);
    if (state.default_student_role_name !== undefined) setDefaultStudentRoleName(state.default_student_role_name);
    if (state.guest_access_enabled !== undefined) setGuestAccessEnabled(state.guest_access_enabled);
    if (state.ai_features_enabled !== undefined) setAiFeaturesEnabled(state.ai_features_enabled);
  }, []);

  const completeOnboarding = useCallback(async (state: OnboardingState) => {
    if (!adminId) throw new Error('Not authenticated');
    const supabase = getSupabase();

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ admin_id: adminId, name: state.organization_name, type: state.organization_type })
      .select('id')
      .single();
    if (orgError) throw new Error(orgError.message);

    const { error: settingsError } = await supabase
      .from('organization_settings')
      .insert({
        organization_id: org.id,
        default_teacher_role_name: state.default_teacher_role_name,
        default_student_role_name: state.default_student_role_name,
        guest_access_enabled: state.guest_access_enabled,
        ai_features_enabled: state.ai_features_enabled,
      });
    if (settingsError) throw new Error(settingsError.message);

    if (state.allowed_domains.length > 0) {
      const { error: domainsError } = await supabase
        .from('organization_email_domains')
        .insert(state.allowed_domains.map((domain) => ({ organization_id: org.id, domain })));
      if (domainsError) throw new Error(domainsError.message);
    }

    const { error: adminError } = await supabase
      .from('admin_profiles')
      .update({ onboarding_completed: true })
      .eq('id', adminId);
    if (adminError) throw new Error(adminError.message);

    setOrganizationId(org.id);
    setOrganizationName(state.organization_name);
    setOrganizationType(state.organization_type);
    setAllowedDomains(state.allowed_domains);
    setDefaultTeacherRoleName(state.default_teacher_role_name);
    setDefaultStudentRoleName(state.default_student_role_name);
    setGuestAccessEnabled(state.guest_access_enabled);
    setAiFeaturesEnabled(state.ai_features_enabled);
    setOnboardingCompleted(true);
  }, [adminId]);

  const updateOrganizationSettings = useCallback(async (settings: Partial<OrganizationSettings>) => {
    if (!organizationId) throw new Error('No organization found');
    const supabase = getSupabase();

    if (settings.organization_name !== undefined || settings.organization_type !== undefined) {
      const orgPatch: Record<string, unknown> = {};
      if (settings.organization_name !== undefined) orgPatch.name = settings.organization_name;
      if (settings.organization_type !== undefined) orgPatch.type = settings.organization_type;
      const { error } = await supabase.from('organizations').update(orgPatch).eq('id', organizationId);
      if (error) throw new Error(error.message);
    }

    const settingsPatch: Record<string, unknown> = {};
    if (settings.default_teacher_role_name !== undefined) settingsPatch.default_teacher_role_name = settings.default_teacher_role_name;
    if (settings.default_student_role_name !== undefined) settingsPatch.default_student_role_name = settings.default_student_role_name;
    if (settings.guest_access_enabled !== undefined) settingsPatch.guest_access_enabled = settings.guest_access_enabled;
    if (settings.ai_features_enabled !== undefined) settingsPatch.ai_features_enabled = settings.ai_features_enabled;

    if (Object.keys(settingsPatch).length > 0) {
      const { error } = await supabase.from('organization_settings').update(settingsPatch).eq('organization_id', organizationId);
      if (error) throw new Error(error.message);
    }

    if (settings.allowed_domains !== undefined) {
      await supabase.from('organization_email_domains').delete().eq('organization_id', organizationId);
      if (settings.allowed_domains.length > 0) {
        const { error } = await supabase
          .from('organization_email_domains')
          .insert(settings.allowed_domains.map((domain) => ({ organization_id: organizationId, domain })));
        if (error) throw new Error(error.message);
      }
    }

    if (settings.organization_name !== undefined) setOrganizationName(settings.organization_name);
    if (settings.organization_type !== undefined) setOrganizationType(settings.organization_type);
    if (settings.allowed_domains !== undefined) setAllowedDomains(settings.allowed_domains);
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
    allowedDomains,
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
