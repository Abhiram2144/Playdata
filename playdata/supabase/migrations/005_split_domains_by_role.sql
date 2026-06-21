-- ============================================================
-- Migration 005: Split allowed email domains by role
-- ============================================================
-- organization_email_domains previously gated student self-signup
-- only. Admin onboarding now collects separate domain lists for
-- students and teachers, so the same domain can be allow-listed
-- for one role but not the other.

ALTER TABLE public.organization_email_domains
  ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'student'
    CHECK (applies_to IN ('student', 'teacher'));

ALTER TABLE public.organization_email_domains
  DROP CONSTRAINT IF EXISTS organization_email_domains_organization_id_domain_key;

ALTER TABLE public.organization_email_domains
  ADD CONSTRAINT organization_email_domains_org_domain_role_key
    UNIQUE (organization_id, domain, applies_to);
