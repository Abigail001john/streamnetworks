-- ============================================================
-- COMPLETE SUPABASE SCHEMA — Paste this in SQL Editor
-- https://app.supabase.com → Your Project → SQL Editor → New Query
-- Run the entire script at once.
-- ============================================================

-- ─────────────────────────────────────────────
-- STEP 1: Create status enum (skip if exists)
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE profile_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────
-- STEP 2: Create profiles table (skip if exists)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  username    TEXT UNIQUE,
  phone       TEXT,
  status      profile_status NOT NULL DEFAULT 'pending',
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- STEP 3: Enable RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- STEP 4: Drop ALL old policies (clears recursion bug)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile"      ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"    ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert for authenticated"  ON public.profiles;
DROP POLICY IF EXISTS "Allow all for service role"      ON public.profiles;

-- ─────────────────────────────────────────────
-- STEP 5: Create correct RLS policies
-- NOTE: Admin check uses auth.jwt() NOT a subquery on profiles
--       (subqueries on profiles cause infinite recursion)
-- ─────────────────────────────────────────────

-- Drop existing policies before recreating (safe to re-run)
DROP POLICY IF EXISTS "select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "insert_own" ON public.profiles;
DROP POLICY IF EXISTS "update_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "delete_admin_only" ON public.profiles;

-- SELECT: users see own row; admins see all rows
CREATE POLICY "select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) = true
  );

-- INSERT: trigger function uses SECURITY DEFINER so bypass RLS
CREATE POLICY "insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

-- UPDATE: users update own row; admins update any row
CREATE POLICY "update_own_or_admin"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) = true
  );

-- DELETE: admins only
CREATE POLICY "delete_admin_only"
  ON public.profiles FOR DELETE
  USING (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) = true
  );

-- ─────────────────────────────────────────────
-- STEP 6: Auto-create profile on signup
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username TEXT;
  _full_name TEXT;
  _phone TEXT;
BEGIN
  -- Safely extract metadata, defaulting to NULL if missing
  _full_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), '');
  _phone     := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone'), '');

  -- Generate a unique username: use provided one or fall back to email prefix + random suffix
  _username  := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), '');
  IF _username IS NULL THEN
    _username := split_part(NEW.email, '@', 1) || floor(random() * 9000 + 1000)::text;
  END IF;

  -- Ensure username is unique by appending random digits if needed
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) LOOP
    _username := _username || floor(random() * 90 + 10)::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, username, phone, status, is_approved, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    _full_name,
    _username,
    _phone,
    'pending',
    FALSE,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't block signup
  RAISE WARNING 'handle_new_user error for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- STEP 7: Auto-update updated_at timestamp
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- STEP 8: Grant table access to authenticated role
-- ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- ─────────────────────────────────────────────
-- DONE ✅
-- After running this, sign up your admin account then run:
--
--   UPDATE public.profiles
--   SET is_admin = TRUE
--   WHERE email = 'your-admin@email.com';
--
-- ─────────────────────────────────────────────

-- ═══════════════════════════════════════════════
-- PHASE 2: PROFILE EXTRA COLUMNS + STORAGE
-- Run this block AFTER the schema above.
-- ═══════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- STEP 9: Add extra profile columns for profile.html
-- ─────────────────────────────────────────────
-- Add is_approved column if upgrading from older schema
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio       TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location  TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ─────────────────────────────────────────────
-- STEP 10: Create Storage bucket for avatars
-- Run in SQL Editor (Storage buckets via SQL)
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,   -- public bucket so avatar URLs work without signed URLs
  2097152, -- 2MB limit
  ARRAY['image/jpeg','image/png','image/gif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for avatars bucket
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────
-- STEP 11: Create Storage bucket for user-files
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'user-files',
  'user-files',
  false,    -- private bucket, use signed URLs
  52428800  -- 50MB limit per file
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for user-files bucket
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────
-- ALL DONE ✅
-- Your Supabase backend is fully configured.
-- Buckets created: 'avatars' (public), 'user-files' (private)
-- ─────────────────────────────────────────────
