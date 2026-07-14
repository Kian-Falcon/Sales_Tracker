CREATE OR REPLACE FUNCTION prevent_comment_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Keep comments immutable in normal flows, but allow backend-managed
  -- project/stage cleanup where the app has set an audit actor explicitly.
  IF TG_OP = 'DELETE'
     AND NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Comments are locked once submitted';
END;
$$ LANGUAGE plpgsql;
