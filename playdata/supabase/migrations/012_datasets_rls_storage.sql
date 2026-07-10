-- ============================================================
-- Migration 012: Datasets RLS + Storage bucket
-- ============================================================

-- ── RLS on datasets ─────────────────────────────────────────

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

-- Teachers can only see and modify their own datasets.
DROP POLICY IF EXISTS "datasets: teacher own" ON public.datasets;
CREATE POLICY "datasets: teacher own"
  ON public.datasets FOR ALL TO authenticated
  USING     (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- ── Storage bucket ──────────────────────────────────────────
-- Private bucket; 50 MB per file; CSV and XLSX only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'datasets',
  'datasets',
  false,
  52428800,
  ARRAY[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS ─────────────────────────────────────────────
-- Path structure inside the bucket: {teacher_id}/{dataset_id}/{filename}
-- Teachers can only access objects whose first path segment is their own uid.

DROP POLICY IF EXISTS "datasets storage: teacher own path" ON storage.objects;
CREATE POLICY "datasets storage: teacher own path"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text);
