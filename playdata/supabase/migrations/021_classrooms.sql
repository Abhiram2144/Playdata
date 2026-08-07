-- ============================================================
-- Migration 021: Classroom Support
--
-- 1. classrooms table
-- 2. classroom_students table
-- 3. sessions.classroom_id (nullable FK)
-- 4. profiles.email UNIQUE constraint (with duplicate guard)
-- 5. Trigger: auto-link invited students on profile insert/email update
-- 6. RLS policies
-- ============================================================


-- ── 1. classrooms ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.classrooms (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  archived    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT classrooms_pkey PRIMARY KEY (id)
);

CREATE TRIGGER classrooms_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. classroom_students ─────────────────────────────────────
-- student_id is nullable until the invited email matches a real account.
-- email must be stored lowercased and trimmed (enforced by CHECK).

CREATE TABLE IF NOT EXISTS public.classroom_students (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  classroom_id UUID        NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id   UUID                 REFERENCES public.profiles(id)  ON DELETE SET NULL,
  email        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'invited'
                             CHECK (status IN ('invited', 'active', 'removed')),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at    TIMESTAMPTZ,
  CONSTRAINT classroom_students_pkey               PRIMARY KEY (id),
  CONSTRAINT classroom_students_classroom_email_uq UNIQUE      (classroom_id, email),
  CONSTRAINT classroom_students_email_normalised   CHECK       (email = lower(trim(email)))
);


-- ── 3. sessions.classroom_id ──────────────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL;


-- ── 4. profiles.email UNIQUE constraint ───────────────────────
-- Abort with a clear message if duplicate emails already exist so
-- they can be resolved manually before the constraint is applied.

DO $$
DECLARE
  dup_list TEXT;
BEGIN
  SELECT string_agg(email, ', ' ORDER BY email)
  INTO   dup_list
  FROM   public.profiles
  WHERE  lower(email) IN (
    SELECT lower(email)
    FROM   public.profiles
    GROUP  BY lower(email)
    HAVING COUNT(*) > 1
  );

  IF dup_list IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE constraint: duplicate emails found in profiles: [%]. '
      'Resolve them manually and re-run this migration.',
      dup_list;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_unique UNIQUE (email);


-- ── 5. Trigger: auto-link invited students ────────────────────
-- Fires AFTER INSERT OR UPDATE OF email on profiles.
-- When the new profile is a student, promotes any matching
-- 'invited' classroom_students rows to 'active'.

CREATE OR REPLACE FUNCTION public.link_invited_classroom_students()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' THEN
    UPDATE public.classroom_students
    SET
      student_id = NEW.id,
      status     = 'active',
      joined_at  = now()
    WHERE lower(email) = lower(NEW.email)
      AND status = 'invited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_invited_classroom_students ON public.profiles;
CREATE TRIGGER trg_link_invited_classroom_students
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_invited_classroom_students();


-- ── 6. RLS ───────────────────────────────────────────────────
--
-- SECURITY DEFINER helper used by classroom_students policies to check
-- classroom ownership without triggering cross-table RLS recursion.

CREATE OR REPLACE FUNCTION public.is_classroom_teacher(p_classroom_id UUID)
  RETURNS BOOLEAN
  LANGUAGE SQL
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classrooms
    WHERE id = p_classroom_id
      AND teacher_id = auth.uid()
  );
$$;

-- classrooms ──────────────────────────────────────────────────

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

-- Teachers: full CRUD on their own classrooms
CREATE POLICY "classrooms: teacher manage own"
  ON public.classrooms FOR ALL TO authenticated
  USING     (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students: read classrooms they have an active membership in
CREATE POLICY "classrooms: student select active"
  ON public.classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_students cs
      WHERE cs.classroom_id = id
        AND cs.student_id   = auth.uid()
        AND cs.status       = 'active'
    )
  );

-- classroom_students ──────────────────────────────────────────

ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;

-- Teachers: full CRUD on membership rows for classrooms they own
CREATE POLICY "classroom_students: teacher manage own classrooms"
  ON public.classroom_students FOR ALL TO authenticated
  USING     (public.is_classroom_teacher(classroom_id))
  WITH CHECK (public.is_classroom_teacher(classroom_id));

-- Students: read their own membership rows
CREATE POLICY "classroom_students: student select own"
  ON public.classroom_students FOR SELECT TO authenticated
  USING (student_id = auth.uid());
