-- ============================================================
-- Migration 010: Multi-provider drive support
--
-- Renames drive_folder_id → external_folder_id and
-- drive_file_id → external_file_id so column names are not
-- Google-Drive-specific, then adds a `provider` column to
-- both tables.
--
-- Tradeoff considered:
--   RENAME: breaks existing column references but gives clean,
--     permanent, provider-agnostic names. Chosen because the
--     alternative (leaving drive_* names) would permanently
--     mislead developers storing Dropbox IDs in a column called
--     drive_file_id.
--   LEAVE:  zero code churn but accrues naming debt forever.
-- ============================================================

-- ── drive_connections ───────────────────────────────────────

ALTER TABLE public.drive_connections
  RENAME COLUMN drive_folder_id TO external_folder_id;

-- Default covers all existing rows (they are all Google Drive).
ALTER TABLE public.drive_connections
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google_drive'
    CHECK (provider IN ('google_drive', 'dropbox'));

-- ── datasets ────────────────────────────────────────────────

ALTER TABLE public.datasets
  RENAME COLUMN drive_file_id TO external_file_id;

-- Nullable: NULL means direct upload, not drive-imported.
ALTER TABLE public.datasets
  ADD COLUMN IF NOT EXISTS provider TEXT
    CHECK (provider IN ('google_drive', 'dropbox'));

-- Backfill rows that were imported from Google Drive.
-- Rows with no external_file_id were direct uploads; provider stays NULL.
UPDATE public.datasets
  SET provider = 'google_drive'
  WHERE external_file_id IS NOT NULL
    AND provider IS NULL;
