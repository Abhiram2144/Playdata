-- Migration 020: Persist response_time_ms on student_responses
-- Required for the fast_answers badge (cumulative count of answers under 2 s).
-- Nullable so existing rows are unaffected.

ALTER TABLE public.student_responses
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
