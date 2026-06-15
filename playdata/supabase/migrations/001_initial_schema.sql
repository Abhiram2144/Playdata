-- ============================================================
-- PlayData — Full Initial Schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Shared helpers ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── 1. PROFILES ────────────────────────────────────────────
-- Extends auth.users. username = email prefix (e.g. as1809).

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE NOT NULL,
  email       TEXT        NOT NULL,
  full_name   TEXT        NOT NULL DEFAULT '',
  role        TEXT        NOT NULL DEFAULT 'student'
                          CHECK (role IN ('admin', 'teacher', 'student')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup (username = email prefix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, full_name, role)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles: own update (no role change)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles: admin full access"
  ON public.profiles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "profiles: teacher read students"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    role = 'student'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );


-- ── 2. DRIVE CONNECTIONS ───────────────────────────────────
-- Admin-approved Google Drive connections per teacher.

CREATE TABLE IF NOT EXISTS public.drive_connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  drive_folder_id TEXT,
  is_approved     BOOLEAN     NOT NULL DEFAULT false,
  approved_by     UUID        REFERENCES public.profiles(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drive_connections: teacher own"
  ON public.drive_connections FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "drive_connections: admin full"
  ON public.drive_connections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ── 3. DATASETS ────────────────────────────────────────────
-- Metadata only. Parsed CSV is stored in Supabase Storage;
-- storage_path points to the object key inside the bucket.
-- Keeping large row data out of Postgres avoids row-size blowup
-- on datasets with thousands of rows.

CREATE TABLE IF NOT EXISTS public.datasets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  source_url    TEXT,
  drive_file_id TEXT,
  schema        JSONB       NOT NULL DEFAULT '{}',  -- { "col": "type", ... }
  row_count     INT         NOT NULL DEFAULT 0,
  storage_path  TEXT,                               -- object key in Supabase Storage bucket
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER datasets_updated_at BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datasets: teacher own"
  ON public.datasets FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "datasets: admin read"
  ON public.datasets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ── 4. DATASET VISIBLE COLUMNS ─────────────────────────────
-- Controls which columns are exposed to students for a dataset.
-- Rows absent here mean the column is hidden from students.

CREATE TABLE IF NOT EXISTS public.dataset_visible_columns (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  UUID  NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  column_name TEXT  NOT NULL,
  UNIQUE (dataset_id, column_name)
);

ALTER TABLE public.dataset_visible_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dataset_visible_columns: teacher via dataset"
  ON public.dataset_visible_columns FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.datasets WHERE id = dataset_id AND teacher_id = auth.uid())
  );



-- ── 5. VISUALISATIONS ─────────────────────────────────────
-- Saved chart configurations.

CREATE TABLE IF NOT EXISTS public.visualisations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dataset_id  UUID        REFERENCES public.datasets(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  chart_type  TEXT        NOT NULL
                          CHECK (chart_type IN ('bar','line','pie','scatter','histogram')),
  config      JSONB       NOT NULL DEFAULT '{}',
  is_template BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER visualisations_updated_at BEFORE UPDATE ON public.visualisations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.visualisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visualisations: teacher own"
  ON public.visualisations FOR ALL TO authenticated
  USING (teacher_id = auth.uid());
-- Uses session_visualisations join table to support multiple charts per session.
-- The student-read policy referencing `public.session_visualisations` is created later,
-- after that table exists to avoid forward-reference errors during migration.


-- ── 6. QUIZZES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quizzes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dataset_id  UUID        REFERENCES public.datasets(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER quizzes_updated_at BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quizzes: teacher own"
  ON public.quizzes FOR ALL TO authenticated
  USING (teacher_id = auth.uid());


-- ── 7. QUESTIONS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.questions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id          UUID        NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  order_index      INT         NOT NULL DEFAULT 0,
  text             TEXT        NOT NULL,
  type             TEXT        NOT NULL
                               CHECK (type IN ('mcq','short_answer','numerical')),
  options          JSONB,                       -- ["A","B","C","D"] for MCQ
  correct_answer   TEXT        NOT NULL,
  answer_tolerance NUMERIC,                     -- ± tolerance for numerical answers (e.g. 0.5)
  dataset_column   TEXT,                        -- for dataset-linked questions
  explanation      TEXT,                        -- AI-generated explanation
  time_limit_secs  INT         NOT NULL DEFAULT 30,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions: teacher via quiz"
  ON public.questions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quizzes WHERE id = quiz_id AND teacher_id = auth.uid())
  );

-- Uses session_items to support multiple quizzes/questions per session.
-- The `questions: student read in active session` policy is created later,
-- after `public.session_items`, `public.sessions`, and `public.session_participants` exist.


-- ── 8. SESSIONS ────────────────────────────────────────────
-- quiz_id and visualisation_id removed; content is now modelled
-- via session_items and session_visualisations respectively,
-- allowing multiple charts and quiz blocks per session.

CREATE TABLE IF NOT EXISTS public.sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  join_code     TEXT        UNIQUE NOT NULL CHECK (length(join_code) = 6),
  status        TEXT        NOT NULL DEFAULT 'waiting'
                            CHECK (status IN ('waiting','active','ended')),
  current_item  INT,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: teacher own"
  ON public.sessions FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "sessions: student join by code"
  ON public.sessions FOR SELECT TO authenticated
  USING (status IN ('waiting','active'));


-- ── 9. SESSION VISUALISATIONS ──────────────────────────────
-- All visualisations attached to a session with their display order.

CREATE TABLE IF NOT EXISTS public.session_visualisations (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID  NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  visualisation_id UUID  NOT NULL REFERENCES public.visualisations(id) ON DELETE CASCADE,
  display_order    INT   NOT NULL DEFAULT 0,
  UNIQUE (session_id, visualisation_id),
  UNIQUE (session_id, display_order)
);

ALTER TABLE public.session_visualisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_visualisations: teacher own"
  ON public.session_visualisations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND teacher_id = auth.uid())
  );

-- The student-read policy for `session_visualisations` requires `session_participants`.
-- It is created later after `public.session_participants` is defined to avoid forward-reference errors.
-- The `visualisations: student read active session` policy is created later,
-- after `public.session_participants` exists to avoid forward-reference errors.


-- ── 10. SESSION ITEMS ──────────────────────────────────────
-- Ordered content sequence for a live session.
-- type='visualisation' → reference_id is a visualisation id
-- type='quiz'          → reference_id is a quiz id
-- type='question'      → reference_id is a question id (standalone)
-- Enables interleaved layout: chart → question → chart → question.

CREATE TABLE IF NOT EXISTS public.session_items (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID  NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  type         TEXT  NOT NULL CHECK (type IN ('visualisation', 'quiz', 'question')),
  reference_id UUID  NOT NULL,
  order_index  INT   NOT NULL DEFAULT 0,
  UNIQUE (session_id, order_index)
);

ALTER TABLE public.session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_items: teacher own"
  ON public.session_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND teacher_id = auth.uid())
  );
-- The `session_items: student read active session` and
-- `questions: student read in active session` policies are created later,
-- after `public.session_participants` exists to avoid forward-reference errors.


-- ── 11. SESSION PARTICIPANTS ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_participants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score       INT         NOT NULL DEFAULT 0,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  UNIQUE (session_id, student_id)
);

ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants: student own"
  ON public.session_participants FOR ALL TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "participants: teacher read their sessions"
  ON public.session_participants FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND teacher_id = auth.uid())
  );

-- Re-create session_visualisations student-read policy now that session_participants exists
CREATE POLICY "session_visualisations: student read active session"
  ON public.session_visualisations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.session_participants sp ON sp.session_id = s.id
      WHERE s.id = session_id
        AND sp.student_id = auth.uid()
        AND s.status IN ('waiting', 'active')
    )
  );

-- Re-create dataset_visible_columns student-read policy now that session and visualisation tables exist
CREATE POLICY "dataset_visible_columns: student read in active session"
  ON public.dataset_visible_columns FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_items si
      JOIN public.sessions s ON s.id = si.session_id
      JOIN public.session_participants sp ON sp.session_id = s.id
      JOIN public.visualisations v ON v.id = si.reference_id
      WHERE si.type = 'visualisation'
        AND v.dataset_id = dataset_visible_columns.dataset_id
        AND sp.student_id = auth.uid()
        AND s.status IN ('waiting', 'active')
    )
  );

-- Re-create policies that require `public.session_participants` (moved here)
CREATE POLICY "session_items: student read active session"
  ON public.session_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.session_participants sp ON sp.session_id = s.id
      WHERE s.id = session_id
        AND sp.student_id = auth.uid()
        AND s.status IN ('waiting', 'active')
    )
  );

CREATE POLICY "questions: student read in active session"
  ON public.questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_items si
      JOIN public.sessions s ON s.id = si.session_id
      JOIN public.session_participants sp ON sp.session_id = s.id
      WHERE si.type = 'quiz'
        AND si.reference_id = questions.quiz_id
        AND sp.student_id = auth.uid()
        AND s.status = 'active'
    )
  );

CREATE POLICY "visualisations: student read active session"
  ON public.visualisations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_visualisations sv
      JOIN public.sessions s ON s.id = sv.session_id
      JOIN public.session_participants sp ON sp.session_id = s.id
      WHERE sv.visualisation_id = visualisations.id
        AND sp.student_id = auth.uid()
        AND s.status IN ('waiting', 'active')
    )
  );


-- ── 12. STUDENT RESPONSES ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_responses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question_id  UUID        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer       TEXT        NOT NULL,
  is_correct   BOOLEAN,
  ai_feedback  TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id, student_id)
);

ALTER TABLE public.student_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "responses: student own"
  ON public.student_responses FOR ALL TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "responses: teacher read their sessions"
  ON public.student_responses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND teacher_id = auth.uid())
  );


-- ── 13. SESSION ANALYTICS ──────────────────────────────────
-- Pre-computed summary written once after a session ends,
-- so analytics pages avoid recalculating over raw responses each time.

CREATE TABLE IF NOT EXISTS public.session_analytics (
  id                 UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID     UNIQUE NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  avg_score          NUMERIC,
  participation_rate NUMERIC,
  completion_rate    NUMERIC,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.session_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_analytics: teacher own"
  ON public.session_analytics FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND teacher_id = auth.uid())
  );

CREATE POLICY "session_analytics: admin read"
  ON public.session_analytics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ── 14. AI GENERATIONS ─────────────────────────────────────
-- Audit log for every AI call. Enables dissertation evaluation
-- ("250 AI generations recorded") and token-cost tracking.

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL
                          CHECK (type IN ('quiz_generation','lesson_summary','explanation','data_exploration')),
  prompt      TEXT        NOT NULL,
  response    TEXT        NOT NULL,
  tokens_used INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_generations: teacher own"
  ON public.ai_generations FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "ai_generations: admin read"
  ON public.ai_generations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ── 15. AI QUIZ EVALUATIONS ────────────────────────────────
-- Teacher ratings of AI-generated questions. Provides quantitative
-- evaluation data: accuracy, usefulness, edit distance per question.

CREATE TABLE IF NOT EXISTS public.ai_quiz_evaluations (
  id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    UUID     NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  teacher_id     UUID     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  generation_id  UUID     REFERENCES public.ai_generations(id) ON DELETE SET NULL,
  teacher_rating SMALLINT CHECK (teacher_rating BETWEEN 1 AND 5),
  was_edited     BOOLEAN  NOT NULL DEFAULT false,
  edit_distance  INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, teacher_id)
);

ALTER TABLE public.ai_quiz_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_quiz_evaluations: teacher own"
  ON public.ai_quiz_evaluations FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "ai_quiz_evaluations: admin read"
  ON public.ai_quiz_evaluations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));


-- ── 16. TEACHER FEEDBACK ───────────────────────────────────
-- Post-session platform feedback for dissertation user evaluation.

CREATE TABLE IF NOT EXISTS public.teacher_feedback (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id  UUID     REFERENCES public.sessions(id) ON DELETE SET NULL,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.teacher_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_feedback: teacher own"
  ON public.teacher_feedback FOR ALL TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "teacher_feedback: admin read"
  ON public.teacher_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
