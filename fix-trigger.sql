-- ============================================================
-- QUICK FIX: Replace the handle_new_user trigger function
-- Paste this in Supabase SQL Editor and click Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username  TEXT;
  _full_name TEXT;
  _phone     TEXT;
BEGIN
  -- Safely extract metadata, defaulting to NULL if missing
  _full_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), '');
  _phone     := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone'), '');

  -- Use provided username or fall back to email prefix + random 4-digit suffix
  _username  := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), '');
  IF _username IS NULL THEN
    _username := split_part(NEW.email, '@', 1) || floor(random() * 9000 + 1000)::text;
  END IF;

  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) LOOP
    _username := _username || floor(random() * 90 + 10)::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, username, phone, status, is_admin, is_approved)
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
  RAISE WARNING 'handle_new_user error for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Re-attach the trigger (safe to run even if it already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Confirm it worked
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user'
  AND routine_schema = 'public';
