-- Migration 017: Allow student chart creation per quiz
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS allow_student_charts boolean NOT NULL DEFAULT false;
