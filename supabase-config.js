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

/** Get the current user's profile */
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

  const jwtMeta = session.user.user_metadata || {};
  const isAdmin = profile.is_admin === true
    || jwtMeta.is_admin === true
    || jwtMeta.is_admin === 'true';

  if (level === 'admin' && !isAdmin) {
    window.location.href = 'dashboard.html';
    return null;
  }

  profile.is_admin = isAdmin;

  if (level === 'approved' && profile.is_approved !== true && !profile.is_admin) {
    window.location.href = 'activation.html';
    return null;
  }

  return { session, profile };
}

// ============================================================
// ADMIN HELPER
// ============================================================
async function setUserStatus(userId, status) {
  const is_approved = status === 'approved';
  const { error } = await _supabase
    .from('profiles')
    .update({ is_approved })
    .eq('id', userId);
  return !error;
}
