ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles;
CREATE POLICY profiles_read_authenticated
  ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS profiles_service_manage ON public.profiles;
CREATE POLICY profiles_service_manage
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS projects_read_authenticated ON projects;
CREATE POLICY projects_read_authenticated
  ON projects
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS projects_service_manage ON projects;
CREATE POLICY projects_service_manage
  ON projects
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS stages_read_authenticated ON stages;
CREATE POLICY stages_read_authenticated
  ON stages
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS stages_service_manage ON stages;
CREATE POLICY stages_service_manage
  ON stages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS comments_read_authenticated ON comments;
CREATE POLICY comments_read_authenticated
  ON comments
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS comments_insert_own ON comments;
CREATE POLICY comments_insert_own
  ON comments
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

DROP POLICY IF EXISTS comments_service_manage ON comments;
CREATE POLICY comments_service_manage
  ON comments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS audit_log_read_authenticated ON audit_log;
CREATE POLICY audit_log_read_authenticated
  ON audit_log
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS audit_log_service_manage ON audit_log;
CREATE POLICY audit_log_service_manage
  ON audit_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS notifications_log_service_manage ON notifications_log;
CREATE POLICY notifications_log_service_manage
  ON notifications_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
