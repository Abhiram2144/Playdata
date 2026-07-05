-- ============================================================
-- PlayData — Seed Data
-- ============================================================
-- STEP 1: Create auth users in Supabase Dashboard first
--   Authentication → Users → "Add user" (or "Invite user")
--   Create these accounts:
--     Admin  : abhiram.sathiraju@gmail.com
--     Teacher: teacher@<your-org-domain>   (must be a domain you add in onboarding)
--     Student: student@<your-org-domain>   (same org domain)
--
-- STEP 2: Run this SQL in the SQL Editor AFTER creating the auth users
-- ============================================================

-- Ensure the admin-specific table exists for onboarding state.
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  first_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Set admin role ──────────────────────────────────────────
UPDATE public.profiles
SET
  role      = 'admin',
  full_name = 'Abhiram Sathiraju'
WHERE email = 'abhiram.sathiraju@gmail.com';

-- Ensure the admin profile row exists and mark onboarding as complete.
-- In this schema, onboarding_completed lives in admin_profiles, not profiles.
INSERT INTO public.admin_profiles (id, onboarding_completed)
SELECT id, true
FROM   public.profiles
WHERE  email = 'abhiram.sathiraju@gmail.com'
ON CONFLICT (id) DO UPDATE
SET onboarding_completed = true,
    updated_at = NOW();

-- ── Set test teacher role ───────────────────────────────────
-- Replace 'teacher@yourdomain.edu' with the actual email you created
-- UPDATE public.profiles
-- SET
--   role                 = 'teacher',
--   full_name            = 'Test Teacher',
--   onboarding_completed = true
-- WHERE email = 'teacher@yourdomain.edu';

-- ── Set test student role ───────────────────────────────────
-- Students default to role='student' so onboarding is all that's needed
-- UPDATE public.profiles
-- SET
--   full_name            = 'Test Student',
--   onboarding_completed = true
-- WHERE email = 'student@yourdomain.edu';

-- ── Verify ──────────────────────────────────────────────────
SELECT p.id,
       p.email,
       p.role,
       p.full_name,
       COALESCE(ap.onboarding_completed, false) AS onboarding_completed,
       p.created_at
FROM   public.profiles p
LEFT JOIN public.admin_profiles ap ON ap.id = p.id
ORDER  BY p.created_at DESC;
