-- Auto-provision a public.profiles row for every Supabase Auth user and keep it
-- in sync. Without this, POST /api/v1/projects fails the projects.created_by
-- foreign key to profiles(id) for any freshly created auth user.
--
-- Department is taken from user_metadata.department (set per the "First User
-- Setup" step in the build doc). If it is missing or not one of the allowed
-- values, we fall back to 'Sales' so that auth-user creation never fails on the
-- profiles CHECK constraint -- in the documented flow department is always set,
-- so this fallback only guards against misconfiguration.

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_department TEXT;
  resolved_department TEXT;
  resolved_full_name TEXT;
BEGIN
  meta_department := NEW.raw_user_meta_data->>'department';

  IF meta_department IN ('Sales', 'R&D', 'Production', 'Procurement', 'QC', 'Dispatch', 'Admin') THEN
    resolved_department := meta_department;
  ELSE
    resolved_department := 'Sales';
  END IF;

  resolved_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'Unknown'
  );

  INSERT INTO public.profiles (id, full_name, department, email)
  VALUES (NEW.id, resolved_full_name, resolved_department, NEW.email)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      department = EXCLUDED.department,
      email = EXCLUDED.email;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_on_auth_insert ON auth.users;
CREATE TRIGGER sync_profile_on_auth_insert
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_from_auth_user();

DROP TRIGGER IF EXISTS sync_profile_on_auth_update ON auth.users;
CREATE TRIGGER sync_profile_on_auth_update
AFTER UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_from_auth_user();

-- Backfill profiles for users that were created before this trigger existed.
INSERT INTO public.profiles (id, full_name, department, email)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email, 'Unknown'),
  CASE
    WHEN u.raw_user_meta_data->>'department' IN
      ('Sales', 'R&D', 'Production', 'Procurement', 'QC', 'Dispatch', 'Admin')
    THEN u.raw_user_meta_data->>'department'
    ELSE 'Sales'
  END,
  u.email
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
