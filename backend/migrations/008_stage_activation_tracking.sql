ALTER TABLE stages
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

WITH activation_events AS (
  SELECT
    record_id,
    MIN(changed_at) AS activated_at
  FROM audit_log
  WHERE table_name = 'stages'
    AND COALESCE(new_data->>'status', '') IN ('active', 'overdue', 'done')
  GROUP BY record_id
)
UPDATE stages AS s
SET activated_at = COALESCE(a.activated_at, s.completed_at, NOW())
FROM activation_events AS a
WHERE s.id = a.record_id
  AND s.activated_at IS NULL;

UPDATE stages
SET activated_at = COALESCE(completed_at, NOW())
WHERE activated_at IS NULL
  AND status IN ('active', 'overdue', 'done');

CREATE OR REPLACE FUNCTION prevent_comment_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Comments are locked once submitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_lock_guard ON comments;
CREATE TRIGGER comment_lock_guard
BEFORE UPDATE OR DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION prevent_comment_mutation();
