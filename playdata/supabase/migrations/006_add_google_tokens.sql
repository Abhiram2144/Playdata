-- Create the Google Drive feature tables if they do not exist yet.
-- This makes the migration compatible with your current Supabase schema.

CREATE TABLE IF NOT EXISTS public.drive_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  name text NOT NULL,
  drive_folder_id text,
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  google_profile_id text,
  CONSTRAINT drive_connections_pkey PRIMARY KEY (id),
  CONSTRAINT drive_connections_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id),
  CONSTRAINT drive_connections_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.datasets (
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

CREATE TABLE IF NOT EXISTS public.dataset_visible_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL,
  column_name text NOT NULL,
  CONSTRAINT dataset_visible_columns_pkey PRIMARY KEY (id),
  CONSTRAINT dataset_visible_columns_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.datasets(id)
);

ALTER TABLE public.drive_connections
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS google_profile_id text;

CREATE INDEX IF NOT EXISTS idx_drive_connections_teacher_id_approved
  ON public.drive_connections (teacher_id, is_approved);
