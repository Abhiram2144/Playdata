-- ============================================================
-- Migration 024: AI post-session summary
--
-- Populated asynchronously when a session transitions to
-- 'ended' (alongside badge awarding and analytics). Nullable:
-- sessions with no responses, or where generation failed,
-- simply have no summary.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;
