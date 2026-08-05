-- Guest participant support: allow students to join sessions without a Supabase account.
-- student_id becomes nullable; guest rows carry guest_name, guest_student_id, guest_token.

ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS guest_name       text,
  ADD COLUMN IF NOT EXISTS guest_student_id text,
  ADD COLUMN IF NOT EXISTS guest_token      uuid UNIQUE DEFAULT gen_random_uuid();

-- Drop the NOT NULL constraint so guest rows (student_id = NULL) are valid.
ALTER TABLE public.session_participants
  ALTER COLUMN student_id DROP NOT NULL;

-- guest_token column on responses so we can look up a guest's own answers.
ALTER TABLE public.student_responses
  ADD COLUMN IF NOT EXISTS guest_token uuid;

-- student_id must be nullable for guest responses.
ALTER TABLE public.student_responses
  ALTER COLUMN student_id DROP NOT NULL;
