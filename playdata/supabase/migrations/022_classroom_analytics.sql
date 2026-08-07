-- ============================================================
-- Migration 022: Classroom Analytics
--
-- Ensures topic_tag exists on questions (idempotent — may already
-- exist if migration 019 / gamification has been applied).
-- ============================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS topic_tag TEXT;
