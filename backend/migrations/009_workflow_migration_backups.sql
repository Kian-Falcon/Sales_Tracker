CREATE TABLE IF NOT EXISTS workflow_migration_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_version TEXT NOT NULL,
  target_version TEXT NOT NULL,
  backup JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, source_version, target_version)
);
