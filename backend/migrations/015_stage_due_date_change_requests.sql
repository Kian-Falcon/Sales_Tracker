CREATE TABLE IF NOT EXISTS stage_due_date_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  requested_by_department TEXT NOT NULL,
  current_due_date DATE,
  requested_due_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stage_due_date_change_requests
  DROP CONSTRAINT IF EXISTS stage_due_date_change_requests_requested_by_department_check;

ALTER TABLE stage_due_date_change_requests
  ADD CONSTRAINT stage_due_date_change_requests_requested_by_department_check
  CHECK (requested_by_department IN ('Sales', 'R&D', 'Production', 'Procurement', 'QC', 'Dispatch', 'Admin'));

ALTER TABLE stage_due_date_change_requests
  DROP CONSTRAINT IF EXISTS stage_due_date_change_requests_status_check;

ALTER TABLE stage_due_date_change_requests
  ADD CONSTRAINT stage_due_date_change_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS stage_due_date_change_requests_stage_created_idx
  ON stage_due_date_change_requests (stage_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS stage_due_date_change_requests_one_pending_idx
  ON stage_due_date_change_requests (stage_id)
  WHERE status = 'pending';

ALTER TABLE stage_due_date_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_due_date_change_requests_read_authenticated ON stage_due_date_change_requests;
CREATE POLICY stage_due_date_change_requests_read_authenticated
  ON stage_due_date_change_requests
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS stage_due_date_change_requests_service_manage ON stage_due_date_change_requests;
CREATE POLICY stage_due_date_change_requests_service_manage
  ON stage_due_date_change_requests
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
