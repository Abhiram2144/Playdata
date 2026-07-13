-- ============================================================
-- Migration 014: Link visualisations to individual questions
--
-- Adds visualisation_id to questions so that a question can
-- reference a specific chart that students must read to answer.
-- ============================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS visualisation_id UUID
    REFERENCES public.visualisations(id) ON DELETE SET NULL;
