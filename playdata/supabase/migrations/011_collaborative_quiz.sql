-- ============================================================
-- Migration 011: Collaborative Quiz Development
--
-- Adds:
--   1. status column on quizzes (draft → in_progress → assigned → completed)
--   2. assigned_to column on quizzes (nullable FK to profiles)
--   3. quiz_collaborators join table (owner + contributors)
--
-- teacher_id on quizzes is kept as the original creator for
-- backwards compatibility. quiz_collaborators is the source of
-- truth for who can edit; teacher_id is denormalised for fast
-- "who created this?" lookups and existing query compatibility.
-- ============================================================

-- ── 1. Status lifecycle ─────────────────────────────────────

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'assigned', 'completed'));

-- ── 2. Assignment ───────────────────────────────────────────
-- Nullable: only set when a quiz is handed off to another teacher.
-- ON DELETE SET NULL: if the assignee is deleted, the quiz stays
-- but becomes unassigned (status should be reset to 'in_progress'
-- by application logic).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS assigned_to UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quizzes_assigned_to_idx ON public.quizzes(assigned_to);

-- ── 3. Collaborators join table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.quiz_collaborators (
  quiz_id     UUID        NOT NULL REFERENCES public.quizzes(id)  ON DELETE CASCADE,
  teacher_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'contributor'
                CHECK (role IN ('owner', 'contributor')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_collaborators_pkey PRIMARY KEY (quiz_id, teacher_id)
);

-- Fast lookup: "all quizzes I am a collaborator on"
CREATE INDEX IF NOT EXISTS quiz_collaborators_teacher_id_idx
  ON public.quiz_collaborators(teacher_id);

-- ── 4. RLS ──────────────────────────────────────────────────

ALTER TABLE public.quiz_collaborators ENABLE ROW LEVEL SECURITY;

-- Any collaborator on a quiz can see all collaborator rows for that quiz.
CREATE POLICY "quiz_collaborators: view if member"
  ON public.quiz_collaborators FOR SELECT TO authenticated
  USING (
    quiz_id IN (
      SELECT quiz_id FROM public.quiz_collaborators WHERE teacher_id = auth.uid()
    )
  );

-- Only the quiz owner (original creator) can add/remove collaborators.
CREATE POLICY "quiz_collaborators: owner manages"
  ON public.quiz_collaborators FOR ALL TO authenticated
  USING (
    quiz_id IN (
      SELECT id FROM public.quizzes WHERE teacher_id = auth.uid()
    )
  );

-- ── 5. Backfill existing quiz owners ────────────────────────
-- Every existing quiz's teacher becomes the 'owner' row so the
-- collaborators table is immediately consistent.

INSERT INTO public.quiz_collaborators (quiz_id, teacher_id, role)
SELECT id, teacher_id, 'owner'
FROM   public.quizzes
ON CONFLICT DO NOTHING;
