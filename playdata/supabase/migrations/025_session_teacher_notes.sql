-- ============================================================
-- Migration 025: Persist teacher discussion notes per session
--
-- Notes were previously stored in the browser's localStorage,
-- so teachers lost them when switching devices. Store them on
-- the session row so they can always be checked later.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS teacher_notes TEXT;
