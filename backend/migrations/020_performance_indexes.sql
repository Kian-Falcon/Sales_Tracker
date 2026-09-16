-- Speed up the most common workflow tracker reads:
-- project detail, dashboard/list views, comments, reports, and scheduler scans.

CREATE INDEX IF NOT EXISTS stages_project_sort_idx
  ON stages (project_id, sort_order);

CREATE INDEX IF NOT EXISTS comments_stage_created_idx
  ON comments (stage_id, created_at ASC);

CREATE INDEX IF NOT EXISTS projects_active_created_idx
  ON projects (created_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS stages_current_lookup_idx
  ON stages (project_id, sort_order)
  WHERE status IN ('active', 'overdue');

CREATE INDEX IF NOT EXISTS stages_active_due_date_idx
  ON stages (due_date, project_id)
  WHERE status IN ('active', 'overdue')
    AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_table_record_changed_idx
  ON audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON profiles (LOWER(email));
