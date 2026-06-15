-- ============================================================
-- Migration 004: Fix RLS infinite recursion on profiles table
-- ============================================================
-- The "profiles: admin full access" policy contained a subquery
-- that read FROM profiles while already inside a profiles policy,
-- causing PostgreSQL error 42P17.
--
-- Fix: replace all self-referencing subqueries with a
-- SECURITY DEFINER function that bypasses RLS entirely.
-- ============================================================

-- Helper: returns the current authenticated user's role.
-- SECURITY DEFINER means it runs as the postgres superuser,
-- bypassing RLS, so it can never recurse.
CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS TEXT
  LANGUAGE SQL
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Drop the three recursive / self-referencing policies ────

DROP POLICY IF EXISTS "profiles: admin full access"           ON public.profiles;
DROP POLICY IF EXISTS "profiles: own update (no role change)" ON public.profiles;
DROP POLICY IF EXISTS "profiles: teacher read students"       ON public.profiles;

-- ── Recreate them using the helper ──────────────────────────

-- Admins can do anything to any row
CREATE POLICY "profiles: admin full access"
  ON public.profiles FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin');

-- Users can update their own row but cannot escalate their role
CREATE POLICY "profiles: own update (no role change)"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_my_role()
  );

-- Teachers can read student profiles (and their own)
CREATE POLICY "profiles: teacher read students"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.get_my_role() = 'admin'
    OR (public.get_my_role() = 'teacher' AND role = 'student')
  );
