-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT ''::text,
  role text NOT NULL DEFAULT 'student'::text CHECK (role = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text])),
  is_active boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  onboarding_completed boolean NOT NULL DEFAULT false,
  education_level text,
  subject_taught text,
  institution_role text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.drive_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  name text NOT NULL,
  drive_folder_id text,
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT drive_connections_pkey PRIMARY KEY (id),
  CONSTRAINT drive_connections_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT drive_connections_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.datasets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  source_url text,
  drive_file_id text,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  storage_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT datasets_pkey PRIMARY KEY (id),
  CONSTRAINT datasets_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.dataset_visible_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL,
  column_name text NOT NULL,
  CONSTRAINT dataset_visible_columns_pkey PRIMARY KEY (id),
  CONSTRAINT dataset_visible_columns_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id)
);
CREATE TABLE public.visualisations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  dataset_id uuid,
  name text NOT NULL,
  chart_type text NOT NULL CHECK (chart_type = ANY (ARRAY['bar'::text, 'line'::text, 'pie'::text, 'scatter'::text, 'histogram'::text])),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT visualisations_pkey PRIMARY KEY (id),
  CONSTRAINT visualisations_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT visualisations_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id)
);
CREATE TABLE public.quizzes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  dataset_id uuid,
  title text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quizzes_pkey PRIMARY KEY (id),
  CONSTRAINT quizzes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT quizzes_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['mcq'::text, 'short_answer'::text, 'numerical'::text])),
  options jsonb,
  correct_answer text NOT NULL,
  answer_tolerance numeric,
  dataset_column text,
  explanation text,
  time_limit_secs integer NOT NULL DEFAULT 30,
  topic_tag text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
);
CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  title text NOT NULL,
  join_code text NOT NULL UNIQUE CHECK (length(join_code) = 6),
  status text NOT NULL DEFAULT 'waiting'::text CHECK (status = ANY (ARRAY['waiting'::text, 'active'::text, 'ended'::text])),
  current_item integer,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  classroom_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT sessions_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id)
);
CREATE TABLE public.session_visualisations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  visualisation_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT session_visualisations_pkey PRIMARY KEY (id),
  CONSTRAINT session_visualisations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT session_visualisations_visualisation_id_fkey FOREIGN KEY (visualisation_id) REFERENCES public.visualisations(id)
);
CREATE TABLE public.session_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['visualisation'::text, 'quiz'::text, 'question'::text])),
  reference_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  CONSTRAINT session_items_pkey PRIMARY KEY (id),
  CONSTRAINT session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.session_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  left_at timestamp with time zone,
  CONSTRAINT session_participants_pkey PRIMARY KEY (id),
  CONSTRAINT session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT session_participants_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.student_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  student_id uuid NOT NULL,
  answer text NOT NULL,
  is_correct boolean,
  response_time_ms integer,
  ai_feedback text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT student_responses_pkey PRIMARY KEY (id),
  CONSTRAINT student_responses_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT student_responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT student_responses_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.session_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  avg_score numeric,
  participation_rate numeric,
  completion_rate numeric,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT session_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT session_analytics_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.ai_generations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['quiz_generation'::text, 'lesson_summary'::text, 'explanation'::text, 'data_exploration'::text])),
  prompt text NOT NULL,
  response text NOT NULL,
  tokens_used integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_generations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generations_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.ai_quiz_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  generation_id uuid,
  teacher_rating smallint CHECK (teacher_rating >= 1 AND teacher_rating <= 5),
  was_edited boolean NOT NULL DEFAULT false,
  edit_distance integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_quiz_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_quiz_evaluations_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id),
  CONSTRAINT ai_quiz_evaluations_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT ai_quiz_evaluations_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES public.ai_generations(id)
);
CREATE TABLE public.teacher_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  session_id uuid,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teacher_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_feedback_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT teacher_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.admin_profiles (
  id uuid NOT NULL,
  onboarding_completed boolean NOT NULL DEFAULT false,
  first_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT admin_profiles_id_fkey FOREIGN KEY (id) REFERENCES public.profiles(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['university'::text, 'school'::text, 'college'::text, 'other'::text])),
  description text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id),
  CONSTRAINT organizations_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.organization_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  default_teacher_role_name text NOT NULL DEFAULT 'Teacher'::text,
  default_student_role_name text NOT NULL DEFAULT 'Student'::text,
  guest_access_enabled boolean NOT NULL DEFAULT false,
  ai_features_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organization_settings_pkey PRIMARY KEY (id),
  CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.organization_email_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  domain text NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  applies_to text NOT NULL DEFAULT 'student'::text CHECK (applies_to = ANY (ARRAY['student'::text, 'teacher'::text])),
  CONSTRAINT organization_email_domains_pkey PRIMARY KEY (id),
  CONSTRAINT organization_email_domains_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.admin_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  organization_id uuid,
  action text NOT NULL,
  description text,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT admin_activity_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id),
  CONSTRAINT admin_activity_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.student_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  total_points bigint NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  current_login_streak integer NOT NULL DEFAULT 0,
  longest_login_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT student_stats_pkey PRIMARY KEY (id),
  CONSTRAINT student_stats_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  category text CHECK (category = ANY (ARRAY['participation'::text, 'accuracy'::text, 'speed'::text, 'streak'::text, 'mastery'::text])),
  criteria_type text NOT NULL,
  criteria_value integer,
  rarity text CHECK (rarity = ANY (ARRAY['common'::text, 'rare'::text, 'legendary'::text])) DEFAULT 'common'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);
CREATE TABLE public.student_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  badge_id uuid NOT NULL,
  session_id uuid,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_badges_pkey PRIMARY KEY (id),
  CONSTRAINT student_badges_unique UNIQUE (student_id, badge_id),
  CONSTRAINT student_badges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id),
  CONSTRAINT student_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id),
  CONSTRAINT student_badges_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.classrooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT classrooms_pkey PRIMARY KEY (id),
  CONSTRAINT classrooms_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.classroom_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  student_id uuid,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'removed'::text])),
  invited_at timestamp with time zone NOT NULL DEFAULT now(),
  joined_at timestamp with time zone,
  CONSTRAINT classroom_students_pkey PRIMARY KEY (id),
  CONSTRAINT classroom_students_classroom_email_uq UNIQUE (classroom_id, email),
  CONSTRAINT classroom_students_email_normalised CHECK (email = lower(trim(email))),
  CONSTRAINT classroom_students_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.classrooms(id),
  CONSTRAINT classroom_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);