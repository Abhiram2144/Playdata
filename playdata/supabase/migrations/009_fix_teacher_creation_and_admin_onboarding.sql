-- ============================================================
-- Migration 009: Fix teacher account creation and admin
--               one-time onboarding enforcement
-- ============================================================

-- ── 1. Fix handle_new_user trigger ─────────────────────────
-- The function from migrations 001-003 still referenced the
-- `username` column which was since dropped from profiles.
-- Replace it with a version that matches the live schema.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, password_reset_required)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END,
    COALESCE((NEW.raw_user_meta_data->>'password_reset_required')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 2. Fix handle_admin_onboarding trigger ─────────────────
-- Use ON CONFLICT DO NOTHING so re-runs are safe.

CREATE OR REPLACE FUNCTION public.handle_admin_onboarding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_profiles (id, onboarding_completed)
  VALUES (NEW.id, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 3. Also fire admin_profiles creation on role UPDATE ────
-- Admin profiles are typically set manually (profile inserted as
-- 'student' then role updated to 'admin'), so the INSERT trigger
-- from migration 002 never fires. This UPDATE trigger covers that.

DROP TRIGGER IF EXISTS on_admin_role_set ON public.profiles;
CREATE TRIGGER on_admin_role_set
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role = 'admin' AND OLD.role <> 'admin')
  EXECUTE FUNCTION public.handle_admin_onboarding();

-- ── 4. Ensure get_my_role() helper exists ──────────────────
-- Migration 004 created this function; define it here so this
-- migration is self-contained even if 004 was never applied.

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS TEXT
  LANGUAGE SQL
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── 5. Fix admin_profiles RLS policies ─────────────────────
-- Replace the raw subquery pattern with get_my_role() so the
-- check is consistent and cannot silently fail due to RLS recursion.

DROP POLICY IF EXISTS "admin_profiles: admin own"      ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles: admin view all" ON public.admin_profiles;

CREATE POLICY "admin_profiles: admin own"
  ON public.admin_profiles FOR ALL TO authenticated
  USING (id = auth.uid() AND public.get_my_role() = 'admin');

-- ── 6. Seed missing admin_profiles rows ────────────────────
-- Existing admin users who were promoted via a manual role UPDATE
-- never had the trigger fire. Create their rows now.

INSERT INTO public.admin_profiles (id, onboarding_completed)
SELECT id, false
FROM public.profiles
WHERE role = 'admin'
ON CONFLICT (id) DO NOTHING;
