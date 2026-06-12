CREATE TABLE IF NOT EXISTS stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('costing', 'drawing', 'sampling', 'production')),
  name TEXT NOT NULL,
  responsible_dept TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'overdue', 'done')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  sort_order INT NOT NULL,
  UNIQUE (project_id, stage_key)
);

CREATE OR REPLACE FUNCTION prevent_stage_rollback()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'done'
     AND NEW.status != 'done'
     AND COALESCE(current_setting('request.jwt.claims', true)::json->>'department', '') != 'Admin'
  THEN
    RAISE EXCEPTION 'Cannot reopen a completed stage without Admin access';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stage_rollback_guard ON stages;
CREATE TRIGGER stage_rollback_guard
BEFORE UPDATE ON stages
FOR EACH ROW
EXECUTE FUNCTION prevent_stage_rollback();
