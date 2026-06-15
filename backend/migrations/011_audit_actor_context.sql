CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
BEGIN
  actor_id := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::UUID,
    CASE
      WHEN TG_OP = 'INSERT' THEN NEW.completed_by
      ELSE COALESCE(NEW.completed_by, OLD.completed_by)
    END
  );

  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    'stages',
    NEW.id,
    TG_OP,
    actor_id,
    CASE
      WHEN TG_OP = 'INSERT' THEN NULL
      ELSE to_jsonb(OLD)
    END,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_comment_change()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID;
BEGIN
  actor_id := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::UUID,
    NEW.user_id
  );

  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    'comments',
    NEW.id,
    TG_OP,
    actor_id,
    NULL,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_audit ON comments;
CREATE TRIGGER comment_audit
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION log_comment_change();
