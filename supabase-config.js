// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
// Replace the values below with your actual Supabase project credentials.
// Find them at: https://app.supabase.com → Your Project → Settings → API
// ============================================================

const SUPABASE_URL = 'https://cbuuurbuzvlxlwxzmgmh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7UMZ-sXfohH1o86DN4DlKg_ptslm0TR';

// Initialize Supabase client (loaded via CDN in each HTML file)
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================

/** Get the currently logged-in user session */
async function getSession() {
  const { data, error } = await _supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

/** Get the current user's profile from the profiles table */
async function getUserProfile(userId) {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

/** Sign out the current user */
async function signOut() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ============================================================
// ROUTE GUARD — call on every protected page
// Usage: await requireAuth();          → any logged-in user
//        await requireAuth('approved') → only approved users
//        await requireAuth('admin')    → only admins
// ============================================================
async function requireAuth(level = 'any') {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  // Try fetching the profile — may fail if schema not yet set up
  let profile = await getUserProfile(session.user.id);

  // Fallback: build a minimal profile from JWT metadata if DB fetch failed
  if (!profile) {
    const meta = session.user.user_metadata || {};
    profile = {
      id: session.user.id,
      email: session.user.email,
      full_name: meta.full_name || null,
      username: meta.username || null,
      phone: meta.phone || null,
      is_approved: false,
      is_admin: meta.is_admin === true || meta.is_admin === 'true'
    };
  }

  // Admin check: accept is_admin from DB profile OR from JWT metadata
  const jwtMeta = session.user.user_metadata || {};
  const isAdmin = profile.is_admin === true
    || jwtMeta.is_admin === true
    || jwtMeta.is_admin === 'true';

  if (level === 'admin' && !isAdmin) {
    window.location.href = 'dashboard.html';
    return null;
  }

  // Attach resolved isAdmin back to profile for downstream use
  profile.is_admin = isAdmin;

  if (level === 'approved' && profile.is_approved !== true && !profile.is_admin) {
    window.location.href = 'activation.html';
    return null;
  }

  return { session, profile };
}

// ============================================================
// ADMIN HELPER — update a user's approval status
// Call from admin.html after toggling the switch
// ============================================================
async function setUserStatus(userId, status) {
  // 'status' column does not exist — use is_approved boolean instead
  const is_approved = status === 'approved';
  const { error } = await _supabase
    .from('profiles')
    .update({ is_approved })
    .eq('id', userId);
  return !error;
}

// ============================================================
// SUPABASE SQL SCHEMA
// Run this in your Supabase SQL Editor before using the app.
// ============================================================
/*
-- 1. Create status enum
CREATE TYPE profile_status AS ENUM ('pending', 'approved', 'denied');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  username    TEXT UNIQUE,
  phone       TEXT,
  status      profile_status NOT NULL DEFAULT 'pending',
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Drop old policies first if re-running
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read all profiles
-- IMPORTANT: Use auth.jwt() to avoid infinite recursion on the profiles table
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) = true
    OR auth.uid() = id
  );

-- Admins can update all profiles (using JWT claim to avoid recursion)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false) = true
  );

-- Users can update their own safe fields only (not status or is_admin)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Anyone authenticated can insert their own profile (trigger uses SECURITY DEFINER)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (TRUE);

-- 5. Auto-create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Make your first admin (run AFTER you have signed up):
-- UPDATE public.profiles SET is_admin = TRUE WHERE email = 'your@email.com';
*/
