-- ============================================================
-- Migration 016: Session Analytics v2 + Guest Participants
--
-- 1. Allow anonymous ("join by name") participants by making
--    student_id nullable and adding a display_name fallback.
--    The FK is kept so authenticated students remain linked
--    to their profile; NULL student_id = unregistered guest.
--
-- 2. Enrich session_analytics with total_questions and
--    participant_count so the results page can show meaningful
--    percentages without re-joining raw tables on every load.
-- ============================================================

-- ── 1. Guest participant support ─────────────────────────────

ALTER TABLE public.session_participants
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- The UNIQUE (session_id, student_id) constraint keeps working:
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints, so
-- multiple guest rows in the same session are allowed.

-- Existing "participants: student own" RLS policy
-- (student_id = auth.uid()) continues to work for authenticated
-- students; guest rows (student_id IS NULL) simply don't match.

-- ── 2. Richer session_analytics ──────────────────────────────

ALTER TABLE public.session_analytics
  ADD COLUMN IF NOT EXISTS total_questions INT NOT NULL DEFAULT 0;

ALTER TABLE public.session_analytics
  ADD COLUMN IF NOT EXISTS participant_count INT NOT NULL DEFAULT 0;
