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

-- ── Set admin role ──────────────────────────────────────────
UPDATE public.profiles
SET
  role                 = 'admin',
  full_name            = 'Abhiram Sathiraju',
  onboarding_completed = true
WHERE email = 'abhiram.sathiraju@gmail.com';

-- Create admin_profiles entry for the admin (onboarding starts at false)
INSERT INTO public.admin_profiles (id, onboarding_completed)
SELECT id, false
FROM   public.profiles
WHERE  email = 'abhiram.sathiraju@gmail.com'
ON CONFLICT (id) DO NOTHING;

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
SELECT id, email, role, full_name, onboarding_completed, is_active, created_at
FROM   public.profiles
ORDER  BY created_at DESC;
