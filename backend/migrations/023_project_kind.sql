ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_kind TEXT;

UPDATE projects
SET project_kind = 'project'
WHERE project_kind IS NULL;

ALTER TABLE projects
  ALTER COLUMN project_kind SET DEFAULT 'project';

ALTER TABLE projects
  ALTER COLUMN project_kind SET NOT NULL;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_kind_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_project_kind_check
  CHECK (project_kind IN ('project', 'recurring'));

CREATE INDEX IF NOT EXISTS projects_active_kind_created_idx
  ON projects (project_kind, created_at DESC)
  WHERE is_archived = FALSE;
