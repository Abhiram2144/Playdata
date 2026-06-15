-- ============================================================
-- PlayData Admin & Organization Schema
-- Run this migration in the Supabase SQL editor
-- ============================================================

-- ── 1. ADMIN_PROFILES ──────────────────────────────────────
-- Extended admin-specific data

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id              UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  first_login_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER admin_profiles_updated_at BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_profiles: admin own"
  ON public.admin_profiles FOR ALL TO authenticated
  USING (id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "admin_profiles: admin view all"
  ON public.admin_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- ── 2. ORGANIZATIONS ───────────────────────────────────────
-- Main organization record per admin

CREATE TABLE IF NOT EXISTS public.organizations (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id                        UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                            TEXT        NOT NULL,
  type                            TEXT        NOT NULL
                                              CHECK (type IN ('university', 'school', 'college', 'other')),
  description                     TEXT,
  logo_url                        TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations: admin own"
  ON public.organizations FOR ALL TO authenticated
  USING (admin_id = auth.uid());

CREATE POLICY "organizations: admin read all"
  ON public.organizations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- ── 3. ORGANIZATION_SETTINGS ───────────────────────────────
-- Configuration per organization

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 UUID        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_teacher_role_name       TEXT        NOT NULL DEFAULT 'Teacher',
  default_student_role_name       TEXT        NOT NULL DEFAULT 'Student',
  guest_access_enabled            BOOLEAN     NOT NULL DEFAULT false,
  ai_features_enabled             BOOLEAN     NOT NULL DEFAULT true,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER organization_settings_updated_at BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_settings: admin via organization"
  ON public.organization_settings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id AND admin_id = auth.uid()
  ));

CREATE POLICY "organization_settings: admin read all"
  ON public.organization_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- ── 4. ORGANIZATION_EMAIL_DOMAINS ─────────────────────────
-- Allowed email domains per organization

CREATE TABLE IF NOT EXISTS public.organization_email_domains (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain                          TEXT        NOT NULL,
  added_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, domain)
);

ALTER TABLE public.organization_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_email_domains: admin via organization"
  ON public.organization_email_domains FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id AND admin_id = auth.uid()
  ));

CREATE POLICY "organization_email_domains: public read"
  ON public.organization_email_domains FOR SELECT
  USING (true);


-- ── 5. ADMIN_ACTIVITY_LOG ─────────────────────────────────
-- Audit trail for admin actions

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  description     TEXT,
  metadata        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_activity_log: admin own"
  ON public.admin_activity_log FOR ALL TO authenticated
  USING (admin_id = auth.uid());

CREATE POLICY "admin_activity_log: admin read all"
  ON public.admin_activity_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX admin_activity_log_admin_id_idx ON public.admin_activity_log(admin_id);
CREATE INDEX admin_activity_log_organization_id_idx ON public.admin_activity_log(organization_id);
CREATE INDEX admin_activity_log_created_at_idx ON public.admin_activity_log(created_at DESC);


-- ── 6. FUNCTION: Handle new admin onboarding ───────────────
-- Auto-create organization when admin completes onboarding

CREATE OR REPLACE FUNCTION public.handle_admin_onboarding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Create admin profile if not exists
  IF NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = NEW.id) THEN
    INSERT INTO public.admin_profiles (id, onboarding_completed)
    VALUES (NEW.id, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_admin_profile ON public.profiles;
CREATE TRIGGER on_new_admin_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role = 'admin')
  EXECUTE FUNCTION public.handle_admin_onboarding();


-- ── 7. INDEXES ─────────────────────────────────────────────

CREATE INDEX organizations_admin_id_idx ON public.organizations(admin_id);
CREATE INDEX organizations_type_idx ON public.organizations(type);
CREATE INDEX organization_email_domains_domain_idx ON public.organization_email_domains(domain);
CREATE INDEX admin_profiles_onboarding_idx ON public.admin_profiles(onboarding_completed);


-- ── 8. SEED DATA (Optional) ────────────────────────────────
-- Uncomment to seed sample admin data for testing

-- INSERT INTO public.admin_profiles (id, onboarding_completed)
-- SELECT id, false FROM public.profiles WHERE role = 'admin'
-- ON CONFLICT (id) DO NOTHING;
