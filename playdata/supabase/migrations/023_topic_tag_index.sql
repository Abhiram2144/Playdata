-- ============================================================
-- Migration 023: Index questions.topic_tag
--
-- Partial index (non-NULL rows only) keeps it small; analytics
-- and the /api/questions/tags endpoint both filter IS NOT NULL.
-- ============================================================

CREATE INDEX IF NOT EXISTS questions_topic_tag_idx
  ON public.questions (topic_tag)
  WHERE topic_tag IS NOT NULL;
