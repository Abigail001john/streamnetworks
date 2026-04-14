// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://cbuuurbuzvlxlwxzmgmh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7UMZ-sXfohH1o86DN4DlKg_ptslm0TR';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================

async function getSession() {
  const { data, error } = await _supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

async function getUserProfile(userId) {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

async function signOut() {
  await _supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ============================================================
// ROUTE GUARD — Fixed Logic
// ============================================================
async function requireAuth(level = 'any') {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  let profile = await getUserProfile(session.user.id);

  // Fallback if profile record hasn't been created yet
  if (!profile) {
    return { session, profile: { is_admin: false, status: 'pending' } };
  }

  const isAdmin = profile.is_admin === true;

  // 1. Admin Level Check
  if (level === 'admin' && !isAdmin) {
    window.location.href = 'dashboard.html';
    return null;
  }

  // 2. Approved Level Check (Status must be 'approved')
  if (level === 'approved' && profile.status !== 'approved' && !isAdmin) {
    window.location.href = 'activation.html';
    return null;
  }

  return { session, profile };
}

// ============================================================
// ADMIN HELPER — Updated to use 'status' enum
// ============================================================
async function setUserStatus(userId, statusValue) {
  // statusValue should be 'approved', 'pending', or 'denied'
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
