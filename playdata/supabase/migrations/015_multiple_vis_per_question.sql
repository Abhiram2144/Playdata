-- ============================================================
-- Migration 015: Multiple visualisations per question + timed quiz
--
-- 1. Adds a JSONB array so each question can reference multiple
--    charts that students see alongside the question.
-- 2. Adds is_timed boolean to quizzes for timed/untimed mode.
-- The legacy single visualisation_id column is kept for compat.
-- ============================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS visualisation_ids JSONB DEFAULT '[]'::jsonb;

-- Migrate any existing single visualisation_id into the new array
UPDATE public.questions
SET visualisation_ids = jsonb_build_array(visualisation_id::text)
WHERE visualisation_id IS NOT NULL
  AND (visualisation_ids IS NULL OR visualisation_ids = '[]'::jsonb);

-- Add timed mode to quizzes (defaults true = existing quizzes are timed)
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS is_timed BOOLEAN NOT NULL DEFAULT true;
