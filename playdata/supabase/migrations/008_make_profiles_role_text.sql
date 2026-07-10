-- Keep the existing column type and teach the database how to create
-- teacher accounts safely when the live schema still uses an enum.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'user_role'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'teacher'
  ) THEN
    EXECUTE 'ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS ''teacher''';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, password_reset_required)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END,
    COALESCE((NEW.raw_user_meta_data->>'password_reset_required')::boolean, false)
  );
  RETURN NEW;
END;
$$;
