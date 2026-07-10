-- Ensure admin_profiles table exists
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  first_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Set admin role
UPDATE public.profiles
SET
  role      = 'admin',
  full_name = 'Abhiram Sathiraju'
WHERE email = 'admin@gmail.com';

-- Insert admin profile with onboarding incomplete so they set up their org on first login
INSERT INTO public.admin_profiles (id, onboarding_completed)
SELECT id, false
FROM   public.profiles
WHERE  email = 'admin@gmail.com'
ON CONFLICT (id) DO UPDATE
SET onboarding_completed = false,
    updated_at = NOW();

-- Verify
SELECT p.id, p.email, p.role, p.full_name,
       COALESCE(ap.onboarding_completed, false) AS onboarding_completed
FROM   public.profiles p
LEFT JOIN public.admin_profiles ap ON ap.id = p.id
WHERE p.email = 'admin@gmail.com';