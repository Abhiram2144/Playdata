/**
 * Admin Module Types
 * Interfaces for admin authentication, onboarding, and dashboard data
 */

export type OrganizationType = 'university' | 'school' | 'college' | 'other';

export interface AdminProfile {
  id?: string;
  email: string;
  full_name: string;
  organization_name: string;
  organization_type: OrganizationType;
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationSettings {
  id?: string;
  admin_id?: string;
  organization_name: string;
  organization_type: OrganizationType;
  allowed_domains: string[];
  default_teacher_role_name: string;
  default_student_role_name: string;
  guest_access_enabled: boolean;
  ai_features_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OnboardingState {
  // Step 1: Organization Information
  organization_name: string;
  organization_type: OrganizationType;

  // Step 2: Allowed Email Domains
  allowed_domains: string[];

  // Step 3: Platform Configuration
  default_teacher_role_name: string;
  default_student_role_name: string;
  guest_access_enabled: boolean;
  ai_features_enabled: boolean;

  // Step 4: Review & Finish
  completed: boolean;
}

export interface AdminContextType {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  adminEmail: string | null;
  adminName: string | null;

  // Organization data
  organizationName: string;
  organizationType: OrganizationType;
  allowedDomains: string[];
  defaultTeacherRoleName: string;
  defaultStudentRoleName: string;
  guestAccessEnabled: boolean;
  aiFeaturesEnabled: boolean;
  onboardingCompleted: boolean;

  // Dashboard stats
  teacherCount: number;
  studentCount: number;

  // Methods
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateOnboarding: (state: Partial<OnboardingState>) => Promise<void>;
  completeOnboarding: (state: OnboardingState) => Promise<void>;
  updateOrganizationSettings: (settings: Partial<OrganizationSettings>) => Promise<void>;
}

export interface DashboardStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'purple' | 'green' | 'amber' | 'red';
  change?: number;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}
