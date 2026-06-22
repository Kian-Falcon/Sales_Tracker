ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS priority TEXT;

UPDATE projects
SET priority = 'normal'
WHERE priority IS NULL;

ALTER TABLE projects
  ALTER COLUMN priority SET DEFAULT 'normal';

ALTER TABLE projects
  ALTER COLUMN priority SET NOT NULL;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_priority_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_priority_check
  CHECK (priority IN ('normal', 'accelerated'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_tat_days INT,
  ADD COLUMN IF NOT EXISTS total_order_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS number_of_stores INT,
  ADD COLUMN IF NOT EXISTS special_request TEXT;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_estimated_tat_days_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_estimated_tat_days_check
  CHECK (estimated_tat_days IS NULL OR estimated_tat_days >= 1);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_total_order_value_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_total_order_value_check
  CHECK (total_order_value IS NULL OR total_order_value >= 0);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_number_of_stores_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_number_of_stores_check
  CHECK (number_of_stores IS NULL OR number_of_stores >= 1);

CREATE SEQUENCE IF NOT EXISTS project_code_seq START 1;

DO $$
DECLARE
  max_code BIGINT;
  current_last BIGINT;
  current_called BOOLEAN;
BEGIN
  SELECT COALESCE(MAX((regexp_match(project_code, '^P([0-9]+)$'))[1]::BIGINT), 0)
  INTO max_code
  FROM projects
  WHERE project_code ~ '^P[0-9]+$';

  SELECT last_value, is_called
  INTO current_last, current_called
  FROM project_code_seq;

  IF max_code > 0 AND current_last < max_code THEN
    PERFORM setval('project_code_seq', max_code, true);
  ELSIF max_code = 0 AND current_last = 1 AND current_called = false THEN
    PERFORM setval('project_code_seq', 1, false);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION generate_project_code()
RETURNS TEXT AS $$
DECLARE
  next_value BIGINT;
BEGIN
  SELECT nextval('project_code_seq') INTO next_value;
  RETURN 'P' || LPAD(next_value::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE projects
  ALTER COLUMN project_code SET DEFAULT generate_project_code();

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'boq',
  file_name TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'project-documents',
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_documents
  DROP CONSTRAINT IF EXISTS project_documents_document_type_check;

ALTER TABLE project_documents
  ADD CONSTRAINT project_documents_document_type_check
  CHECK (document_type IN ('boq', 'attachment'));

CREATE INDEX IF NOT EXISTS project_documents_project_id_created_at_idx
  ON project_documents (project_id, created_at DESC);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_documents_read_authenticated ON project_documents;
CREATE POLICY project_documents_read_authenticated
  ON project_documents
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS project_documents_service_manage ON project_documents;
CREATE POLICY project_documents_service_manage
  ON project_documents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
