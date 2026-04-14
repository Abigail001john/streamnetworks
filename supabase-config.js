// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://cbuuurbuzvlxlwxzmgmh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7UMZ-sXfohH1o86DN4DlKg_ptslm0TR';

// Initialize Supabase client
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
// ROUTE GUARD
// ============================================================
async function requireAuth(level = 'any') {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  let profile = await getUserProfile(session.user.id);

  // Fallback if profile row doesn't exist yet
  if (!profile) {
    return { session, profile: { is_admin: false, status: 'pending' } };
  }

  const isAdmin = profile.is_admin === true;

  // 1. Admin Check
  if (level === 'admin' && !isAdmin) {
    window.location.href = 'dashboard.html';
    return null;
  }

  // 2. Approved Status Check
  if (level === 'approved' && profile.status !== 'approved' && !isAdmin) {
    window.location.href = 'activation.html';
    return null;
  }

  return { session, profile };
}

// ============================================================
// ADMIN HELPER
// ============================================================
async function setUserStatus(userId, statusValue) {
  // statusValue must be 'approved', 'pending', or 'denied'
  const { error } = await _supabase
    .from('profiles')
    .update({ status: statusValue }) 
    .eq('id', userId);
  
  if (error) {
    console.error("Error updating status:", error);
    return false;
  }
  return true;
}
