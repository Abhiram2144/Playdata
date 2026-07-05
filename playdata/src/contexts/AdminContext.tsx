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

    const { data: adminProfile } = await supabase
      .from('admin_profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    const completed = adminProfile?.onboarding_completed ?? false;
    setOnboardingCompleted(completed);

    if (!completed) return;

    const { data: employerProfile } = await supabase
      .from('employer_profiles')
      .select('organisation_id')
      .eq('id', userId)
      .maybeSingle();

    if (employerProfile?.organisation_id) {
      const { data: org } = await supabase
        .from('organisations')
        .select('id, name')
        .eq('id', employerProfile.organisation_id)
        .maybeSingle();

      if (org) {
        setOrganizationId(org.id);
        setOrganizationName(org.name);
        setOrganizationType('university');
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
    const supabase = getSupabase();

    const { data: existingEmployerProfile } = await supabase
      .from('employer_profiles')
      .select('organisation_id')
      .eq('id', adminId)
      .maybeSingle();

    let organizationIdToUse = existingEmployerProfile?.organisation_id ?? null;

    if (organizationIdToUse) {
      const { error: orgError } = await supabase
        .from('organisations')
        .update({ name: state.organization_name })
        .eq('id', organizationIdToUse);
      if (orgError) throw new Error(orgError.message);
    } else {
      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({ name: state.organization_name })
        .select('id')
        .single();
      if (orgError) throw new Error(orgError.message);
      organizationIdToUse = org.id;
    }

    const { error: employerProfileError } = await supabase
      .from('employer_profiles')
      .upsert({ id: adminId, organisation_id: organizationIdToUse }, { onConflict: 'id' });
    if (employerProfileError) throw new Error(employerProfileError.message);

    const { error: adminError } = await supabase
      .from('admin_profiles')
      .update({ onboarding_completed: true })
      .eq('id', adminId);
    if (adminError) throw new Error(adminError.message);

    setOrganizationId(organizationIdToUse);
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
    const supabase = getSupabase();

    if (settings.organization_name !== undefined) {
      const { error } = await supabase.from('organisations').update({ name: settings.organization_name }).eq('id', organizationId);
      if (error) throw new Error(error.message);
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
