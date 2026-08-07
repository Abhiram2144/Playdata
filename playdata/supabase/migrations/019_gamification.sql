-- ============================================================
-- Migration 019: Gamification Support
--
-- 1. topic_tag on questions       (learning analytics + topic-mastery badges)
-- 2. current_streak + best_streak on session_participants
-- 3. student_stats table          (points, level, login streaks)
-- 4. badges table                 (badge catalogue)
-- 5. student_badges table         (earned badges per student)
-- 6. Starter badge seed           (10 badges)
-- 7. RLS policies
-- ============================================================


-- ── 1. topic_tag on questions ────────────────────────────────
-- Nullable; populated by teachers or AI generation.
-- Used by learning-analytics queries and topic_master badge.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS topic_tag TEXT;


-- ── 2. In-session streak tracking ────────────────────────────
-- current_streak: consecutive correct answers so far in this session.
-- best_streak:    highest streak reached during this session.
-- Both columns are reset to 0 when the participant joins; only
-- server-side logic (service role) should mutate them.

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak    INTEGER NOT NULL DEFAULT 0;


-- ── 3. student_stats ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_stats (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  student_id           UUID        NOT NULL UNIQUE
                         REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_points         BIGINT      NOT NULL DEFAULT 0,
  level                INTEGER     NOT NULL DEFAULT 1,
  current_login_streak INTEGER     NOT NULL DEFAULT 0,
  longest_login_streak INTEGER     NOT NULL DEFAULT 0,
  last_active_date     DATE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_stats_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS student_stats_student_id_idx
  ON public.student_stats (student_id);


-- ── 4. badges ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.badges (
  id             UUID        NOT NULL DEFAULT gen_random_uuid(),
  code           TEXT        NOT NULL UNIQUE,
  name           TEXT        NOT NULL,
  description    TEXT,
  icon           TEXT,
  category       TEXT
                   CHECK (category IN ('participation','accuracy','speed','streak','mastery')),
  criteria_type  TEXT        NOT NULL,
  criteria_value INTEGER,
  rarity         TEXT
                   CHECK (rarity IN ('common','rare','legendary'))
                   DEFAULT 'common',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);


-- ── 5. student_badges ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_badges (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  badge_id   UUID        NOT NULL REFERENCES public.badges(id)    ON DELETE CASCADE,
  session_id UUID                 REFERENCES public.sessions(id)  ON DELETE SET NULL,
  earned_at  TIMESTAMPTZ          DEFAULT NOW(),
  CONSTRAINT student_badges_pkey   PRIMARY KEY (id),
  CONSTRAINT student_badges_unique UNIQUE (student_id, badge_id)
);

CREATE INDEX IF NOT EXISTS student_badges_student_id_idx
  ON public.student_badges (student_id);

CREATE INDEX IF NOT EXISTS student_badges_badge_id_idx
  ON public.student_badges (badge_id);


-- ── 6. Starter badge seed ─────────────────────────────────────
-- ON CONFLICT DO NOTHING makes this idempotent on re-runs.

INSERT INTO public.badges
  (code, name, description, category, criteria_type, criteria_value, rarity)
VALUES
  ('first_session',
   'First Steps',
   'Join your first live session',
   'participation', 'sessions_joined', 1, 'common'),

  ('five_sessions',
   'Regular Player',
   'Join 5 live sessions',
   'participation', 'sessions_joined', 5, 'common'),

  ('fifty_sessions',
   'Veteran',
   'Join 50 live sessions',
   'participation', 'sessions_joined', 50, 'rare'),

  ('perfect_round',
   'Perfect Round',
   'Answer every question correctly in a session',
   'accuracy', 'perfect_session', 1, 'rare'),

  ('lightning_reflexes',
   'Lightning Reflexes',
   'Answer 10 questions in under 2 seconds each',
   'speed', 'fast_answers', 10, 'rare'),

  ('hot_streak',
   'Hot Streak',
   'Get 5 correct answers in a row within one session',
   'streak', 'in_session_streak', 5, 'common'),

  ('unstoppable',
   'Unstoppable',
   'Get 10 correct answers in a row within one session',
   'streak', 'in_session_streak', 10, 'legendary'),

  ('three_day_streak',
   'Warming Up',
   'Participate on 3 consecutive days',
   'streak', 'login_streak', 3, 'common'),

  ('week_streak',
   'Week Warrior',
   'Participate on 7 consecutive days',
   'streak', 'login_streak', 7, 'rare'),

  ('topic_master',
   'Topic Master',
   'Score 90%+ across all questions tagged with one topic',
   'mastery', 'topic_mastery', 90, 'rare')

ON CONFLICT (code) DO NOTHING;


-- ── 7. RLS ───────────────────────────────────────────────────
--
-- Design intent
-- ─────────────
-- · Authenticated students: SELECT on own rows in student_stats /
--   student_badges; SELECT all rows in badges.
-- · No INSERT/UPDATE/DELETE policies are created for the
--   authenticated role on student_stats or student_badges.
--   All writes to those tables (and to the new streak columns on
--   session_participants) are performed exclusively by server-side
--   logic using the Supabase service-role key, which bypasses RLS
--   entirely and therefore requires no explicit policy.
-- · Column-level restrictions on session_participants are enforced
--   at the application layer (service-role-only callers); Postgres
--   RLS operates at row granularity so per-column guards live in code.

-- student_stats ──────────────────────────────────────────────

ALTER TABLE public.student_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_stats: own select"
  ON public.student_stats
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- badges ─────────────────────────────────────────────────────

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges: read all"
  ON public.badges
  FOR SELECT TO authenticated
  USING (TRUE);

-- student_badges ─────────────────────────────────────────────

ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_badges: own select"
  ON public.student_badges
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());
