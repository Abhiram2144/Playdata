-- ============================================================
-- Migration 013: Collaborative Quiz Extensions
--
-- Adds:
--   1. last_edited_by + last_edited_at on quizzes (activity tracking)
--   2. Extends questions RLS: collaborators can manage questions
--   3. Extends quizzes RLS: collaborators can SELECT/UPDATE
--   4. Assignees can SELECT the quiz row
-- ============================================================

-- ── 1. Activity tracking ────────────────────────────────────

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS last_edited_by UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

-- ── 2. Extend questions RLS ─────────────────────────────────
-- Old policy only allowed quiz owner. New policy allows any
-- quiz_collaborators member (owner or contributor).

DROP POLICY IF EXISTS "questions: teacher via quiz" ON public.questions;

CREATE POLICY "questions: owner or collaborator"
  ON public.questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.quiz_collaborators qc
      WHERE  qc.quiz_id = quiz_id
        AND  qc.teacher_id = auth.uid()
    )
  );

-- ── 3. Extend quizzes RLS for collaborators ─────────────────
-- The existing "quizzes: teacher own" policy covers owners.
-- These new policies cover contributors and assignees.

CREATE POLICY "quizzes: collaborator select"
  ON public.quizzes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.quiz_collaborators qc
      WHERE  qc.quiz_id = id
        AND  qc.teacher_id = auth.uid()
    )
  );

CREATE POLICY "quizzes: collaborator update"
  ON public.quizzes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   public.quiz_collaborators qc
      WHERE  qc.quiz_id = id
        AND  qc.teacher_id = auth.uid()
    )
  );

-- Assigned teacher needs to read the quiz to act on it
CREATE POLICY "quizzes: assignee select"
  ON public.quizzes FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());
