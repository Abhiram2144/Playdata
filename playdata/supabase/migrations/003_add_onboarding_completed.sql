-- ============================================================
-- Migration 003: Add onboarding_completed to profiles
-- Run in Supabase SQL Editor after 001 and 002
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Update the handle_new_user trigger to include the new column
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, full_name, role, onboarding_completed)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
