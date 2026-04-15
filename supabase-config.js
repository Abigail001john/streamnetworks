// supabase-config.js
// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = '[cbuuurbuzvlxlwxzmgmh.supabase.co](https://cbuuurbuzvlxlwxzmgmh.supabase.co)';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidXV1cmJ1enZseGx3eHptZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTcwMTAsImV4cCI6MjA4Nzg5MzAxMH0.CrsM4kTO4ZS8bo_16MVW5HRWJCY66E-ccU7FhzF7_YE'; // ← paste your real key here

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
    return { session, profile: { is_admin: false, status: 'pending' } };
  }

  const isAdmin = profile.is_admin === true;

  if (level === 'admin' && !isAdmin) {
    window.location.href = 'dashboard.html';
    return null;
  }

  if (level === 'approved' && profile.status !== 'approved' && !isAdmin) {
    window.location.href = 'activation.html';
    return null;
  }

  return { session, profile };
}

// ============================================================
// ADMIN HELPER — Update user profile status
// ============================================================
async function setUserStatus(userId, statusValue) {
  const { error } = await _supabase
    .from('profiles')
    .update({ status: statusValue })
    .eq('id', userId);

  if (error) {
    console.error('Error updating status:', error);
    return false;
  }
  return true;
}

// ============================================================
// WITHDRAWAL HELPERS
// ============================================================

/** User submits a withdrawal request */
async function requestWithdrawal(userId, amount, accountDetails) {
  // Gate: user must have at least 1 approved referral
  const eligible = await checkReferralEligibility(userId);
  if (!eligible) {
    return { success: false, message: 'You must refer at least one approved user before withdrawing.' };
  }

  // Gate: check wallet balance
  const { data: wallet, error: walletError } = await _supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (walletError || !wallet) {
    return { success: false, message: 'Could not fetch wallet.' };
  }

  if (wallet.balance < amount) {
    return { success: false, message: 'Insufficient balance.' };
  }

  // Insert withdrawal request
  const { error } = await _supabase
    .from('withdrawals')
    .insert({
      user_id: userId,
      amount: amount,
      account_details: accountDetails,
      status: 'pending',
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Withdrawal insert error:', error);
    return { success: false, message: 'Failed to submit withdrawal.' };
  }

  return { success: true, message: 'Withdrawal request submitted.' };
}

/** Admin approves or rejects a withdrawal */
async function updateWithdrawalStatus(withdrawalId, newStatus, adminNote = '') {
  // newStatus: 'approved' | 'rejected'
  const { data: withdrawal, error: fetchError } = await _supabase
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single();

  if (fetchError || !withdrawal) {
    console.error('Could not find withdrawal:', fetchError);
    return false;
  }

  // Update withdrawal record
  const { error: updateError } = await _supabase
    .from('withdrawals')
    .update({
      status: newStatus,
      admin_note: adminNote,
      updated_at: new Date().toISOString()
    })
    .eq('id', withdrawalId);

  if (updateError) {
    console.error('Error updating withdrawal:', updateError);
    return false;
  }

  // If approved: deduct from wallet and log transaction
  if (newStatus === 'approved') {
    // Deduct balance
    const { error: rpcError } = await _supabase.rpc('deduct_wallet_balance', {
      p_user_id: withdrawal.user_id,
      p_amount: withdrawal.amount
    });

    if (rpcError) {
      console.error('Error deducting balance:', rpcError);
      // Roll back withdrawal approval
      await _supabase
        .from('withdrawals')
        .update({ status: 'pending' })
        .eq('id', withdrawalId);
      return false;
    }

    // Log in transactions
    await _supabase.from('transactions').insert({
      user_id: withdrawal.user_id,
      type: 'withdrawal',
      amount: -withdrawal.amount,
      description: 'Withdrawal approved',
      reference_id: withdrawalId,
      created_at: new Date().toISOString()
    });
  }

  return true;
}

/** Check if user has at least 1 approved referral */
async function checkReferralEligibility(userId) {
  const { data, error } = await _supabase
    .from('referrals')
    .select('id')
    .eq('referrer_id', userId)
    .eq('status', 'approved')
    .limit(1);

  if (error) return false;
  return data && data.length > 0;
}

/** Credit referral bonus when referred user gets approved */
async function creditReferralBonus(referredUserId) {
  // Find who referred this user
  const { data: referral, error } = await _supabase
    .from('referrals')
    .select('*')
    .eq('referred_id', referredUserId)
    .single();

  if (error || !referral) return; // No referrer found

  // Mark referral as approved
  await _supabase
    .from('referrals')
    .update({ status: 'approved' })
    .eq('id', referral.id);

  // Add ₦10,000 to referrer's wallet
  await _supabase.rpc('add_wallet_balance', {
    p_user_id: referral.referrer_id,
    p_amount: 10000
  });

  // Log the transaction
  await _supabase.from('transactions').insert({
    user_id: referral.referrer_id,
    type: 'referral_bonus',
    amount: 10000,
    description: `Referral bonus for user ${referredUserId}`,
    reference_id: referral.id,
    created_at: new Date().toISOString()
  });
}
