# Supabase Database Schema Implementation Guide

## Overview

This guide provides a complete plan for a Supabase database schema supporting user authentication, profiles, and role-based access control via Row Level Security (RLS).

---

## 1. Architecture Overview

### Core Components

```
auth.users (Supabase managed)
    ↓ (foreign key relationship)
public.profiles (custom table)
    ├── RLS Policies
    ├── Triggers (auto-create on signup)
    └── Admin Functions
```

### Authentication Flow

1. User signs up via Supabase Auth
2. `on_auth_user_created` trigger fires automatically
3. `handle_new_user()` function creates a profile with `status = 'pending'`
4. Admin approves the profile by updating `status = 'approved'`
5. User can access application features based on approval status

---

## 2. Database Schema Details

### 2.1 Profiles Table

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, FK to auth.users(id) | User identifier |
| `email` | TEXT | NOT NULL | User email (denormalized) |
| `full_name` | TEXT | Nullable | User display name |
| `status` | profile_status enum | NOT NULL, DEFAULT 'pending' | Approval workflow state |
| `is_admin` | BOOLEAN | NOT NULL, DEFAULT false | Admin privilege flag |
| `created_at` | TIMESTAMP TZ | NOT NULL, DEFAULT NOW() | Profile creation time |
| `updated_at` | TIMESTAMP TZ | NOT NULL, DEFAULT NOW() | Profile last update time |

### 2.2 Enum Types

**profile_status:**
- `pending` - New user awaiting admin approval
- `approved` - User approved to use the application
- `denied` - User rejected (can re-apply)

### 2.3 Indexes

```sql
idx_profiles_email       -- Quick email lookups
idx_profiles_status      -- Filter approved/pending users
idx_profiles_is_admin    -- Admin user queries
idx_profiles_created_at  -- Sort by signup order
```

**Performance Impact:** Improves query speed by ~10-100x for filtered queries

---

## 3. Row Level Security (RLS) Policies

### Policy Matrix

| Policy | Scope | Condition | Operations |
|--------|-------|-----------|------------|
| **Users can view own profile** | Profiles where `id = auth.uid()` | SELECT | Users see only their own data |
| **Users can update own profile** | Own profile + checks admin/status immutable | UPDATE | Can change `full_name` but not `status` or `is_admin` |
| **Admins can view all profiles** | All profiles if caller is admin | SELECT | Admins see all user profiles |
| **Admins can update any profile** | All profiles if caller is admin | UPDATE | Admins modify any user's data |
| **Admins can delete profiles** | All profiles if caller is admin | DELETE | Admins remove users |
| **Service role unrestricted** | All operations | ALL | Backend API operations bypass RLS |

### Security Model

```
┌─────────────────────────────────────────┐
│        Authenticated User (non-admin)    │
├─────────────────────────────────────────┤
│ Can READ:   Own profile only            │
│ Can UPDATE: full_name (own profile)     │
│ Can DELETE: Not allowed                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Admin User                       │
├─────────────────────────────────────────┤
│ Can READ:   All profiles                │
│ Can UPDATE: All profiles (all fields)   │
│ Can DELETE: Any profile                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Service Role (Backend API)       │
├─────────────────────────────────────────┤
│ Can READ:   All profiles (RLS bypassed) │
│ Can UPDATE: All profiles                │
│ Can DELETE: All profiles                │
└─────────────────────────────────────────┘
```

### RLS Enforcement

RLS is **enabled** on the profiles table:
```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

When RLS is enabled and no policies match, the operation is **denied by default** (secure-by-default approach).

---

## 4. Triggers & Functions

### 4.1 Auto-Create Profile Trigger

**Trigger Name:** `on_auth_user_created`

**Execution:**
- **Event:** AFTER INSERT on `auth.users`
- **Timing:** Automatically when user signs up
- **Function:** `handle_new_user()`

**What it does:**
1. Captures new user data from `auth.users`
2. Creates corresponding record in `public.profiles`
3. Extracts `full_name` from `raw_user_meta_data`
4. Sets `status = 'pending'` (default)
5. Sets `is_admin = false` (default)

**Example Signup Flow:**

```javascript
// Client-side
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      full_name: 'John Doe'
    }
  }
});
// Profile auto-created with status='pending'
```

### 4.2 Updated At Trigger

**Trigger Name:** `update_profiles_updated_at`

**Execution:**
- **Event:** BEFORE UPDATE on `public.profiles`
- **Timing:** Updates `updated_at` column before every modification

**Purpose:** Maintain audit trail of profile changes

### 4.3 Admin Utility Functions

#### `approve_user(user_id UUID)`
- **Security:** SECURITY DEFINER (requires admin)
- **Action:** Sets user status to 'approved'
- **Use Case:** Grant application access to pending users

#### `deny_user(user_id UUID)`
- **Security:** SECURITY DEFINER (requires admin)
- **Action:** Sets user status to 'denied'
- **Use Case:** Reject user applications

#### `promote_to_admin(user_id UUID)`
- **Security:** SECURITY DEFINER (requires admin)
- **Action:** Sets `is_admin = true`
- **Use Case:** Grant admin privileges

**All functions include permission checks** to ensure only admins can execute them.

---

## 5. Implementation Checklist

### Phase 1: Schema Creation
- [ ] Copy `supabase_schema_plan.sql` into Supabase SQL Editor
- [ ] Execute the entire script
- [ ] Verify all tables, indexes, and functions created
- [ ] Confirm RLS is enabled on profiles table

### Phase 2: Initial Setup
- [ ] Manually set first admin user:
  ```sql
  UPDATE public.profiles SET is_admin = true WHERE id = 'first-admin-uuid';
  ```
- [ ] Test signup flow creates profile automatically
- [ ] Verify profile appears with `status = 'pending'`

### Phase 3: Testing
- [ ] Test RLS: User A cannot see User B's profile
- [ ] Test Admin: Admin can see all profiles
- [ ] Test Update: User cannot change own `is_admin` or `status`
- [ ] Test Functions: Admin can approve/deny users
- [ ] Test Trigger: Profile auto-created on new signup

### Phase 4: Application Integration
- [ ] Set up Supabase client in frontend
- [ ] Implement signup flow
- [ ] Add admin approval UI
- [ ] Display user status in UI
- [ ] Restrict features based on `status` and `is_admin`

---

## 6. Common Operations

### Get Current User Profile
```sql
SELECT * FROM public.profiles WHERE id = auth.uid();
```

### Get All Approved Users (Admin)
```sql
SELECT * FROM public.profiles 
WHERE status = 'approved' 
ORDER BY created_at DESC;
```

### Get Pending Approvals (Admin)
```sql
SELECT * FROM public.profiles 
WHERE status = 'pending' 
ORDER BY created_at ASC;
```

### Approve a User (Admin)
```sql
SELECT public.approve_user('target-user-uuid');
```

### Update Own Profile
```sql
UPDATE public.profiles 
SET full_name = 'Jane Doe' 
WHERE id = auth.uid();
```

### Delete User (Admin)
```sql
DELETE FROM public.profiles WHERE id = 'target-user-uuid';
```

---

## 7. Security Considerations

### RLS Best Practices Applied

✅ **Default Deny:** RLS enabled; policies are restrictive by default  
✅ **Least Privilege:** Users see only their own data unless admin  
✅ **Immutable Fields:** Users cannot change `status` or `is_admin`  
✅ **Function Permissions:** Admin functions use SECURITY DEFINER with permission checks  
✅ **Audit Trail:** `updated_at` tracks all modifications  
✅ **FK Integrity:** Profiles deleted when users deleted from auth.users  

### Additional Security Measures Recommended

1. **Application-Level Validation**
   - Verify `status = 'approved'` before granting feature access
   - Check `is_admin` flag before showing admin UI

2. **Monitoring & Logging**
   - Monitor failed access attempts
   - Log sensitive operations (status changes, admin promotions)
   - Set up alerts for suspicious activity

3. **Rate Limiting**
   - Implement rate limits on signup
   - Prevent brute-force attacks on approval endpoints

4. **Password & Session Management**
   - Use Supabase Auth for secure password handling
   - Set appropriate session timeouts
   - Implement MFA for admin accounts

5. **Data Privacy**
   - Limit email exposure in queries
   - Implement GDPR delete procedures
   - Secure audit logs with restricted access

---

## 8. Scalability Considerations

### Current Design Scales Well For:
- **10,000 users:** No issues with current indexes
- **100,000 users:** Consider partitioning by created_at if needed
- **1M+ users:** Add sharding strategy; consider separate audit tables

### Performance Optimizations:
- Indexes prevent full table scans
- RLS policies evaluated efficiently at PostgreSQL level
- Trigger overhead minimal (~1-2ms per signup)

### Future Enhancements:
- Add audit log table for compliance
- Implement soft deletes if needed
- Add profile image URL and other metadata
- Create activity log table for user actions

---

## 9. Troubleshooting

### Issue: Profile not created on signup
**Solution:** Verify trigger exists and is enabled
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

### Issue: User cannot see own profile
**Solution:** Check RLS policy and verify `auth.uid()` matches profile ID
```sql
SELECT auth.uid();  -- Check current user ID
SELECT * FROM public.profiles;  -- Check RLS enforcement
```

### Issue: Admin cannot update profile
**Solution:** Verify admin user has `is_admin = true` in profiles table
```sql
SELECT is_admin FROM public.profiles WHERE id = auth.uid();
```

### Issue: Trigger causing permission errors
**Solution:** Ensure trigger function has SECURITY DEFINER
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
-- ... function body ...
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 10. Summary

This schema provides:
- ✅ Secure authentication via Supabase Auth
- ✅ User approval workflow (pending → approved/denied)
- ✅ Role-based access control (admin vs user)
- ✅ Automatic profile creation on signup
- ✅ RLS policies for data isolation
- ✅ Audit trail via updated_at timestamps
- ✅ Admin utility functions
- ✅ Performance optimizations via indexes

**Ready for production use with proper monitoring and security practices in place.**
