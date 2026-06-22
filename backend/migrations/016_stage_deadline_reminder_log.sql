CREATE TABLE IF NOT EXISTS stage_deadline_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  reminder_days_before INT NOT NULL CHECK (reminder_days_before >= 1),
  sent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_to TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, reminder_days_before, sent_on)
);

ALTER TABLE stage_deadline_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_deadline_reminder_log_read_authenticated ON stage_deadline_reminder_log;
CREATE POLICY stage_deadline_reminder_log_read_authenticated
  ON stage_deadline_reminder_log
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS stage_deadline_reminder_log_service_manage ON stage_deadline_reminder_log;
CREATE POLICY stage_deadline_reminder_log_service_manage
  ON stage_deadline_reminder_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
