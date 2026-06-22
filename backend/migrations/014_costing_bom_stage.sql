INSERT INTO workflow_stage_settings (
  stage_key,
  phase,
  name,
  responsible_dept,
  sort_order,
  default_due_days
)
VALUES (
  'costing_bom_prepared',
  'costing',
  'BOM Prepared by R&D',
  'R&D',
  15,
  2
)
ON CONFLICT (stage_key) DO UPDATE
SET
  phase = EXCLUDED.phase,
  name = EXCLUDED.name,
  responsible_dept = EXCLUDED.responsible_dept,
  sort_order = EXCLUDED.sort_order,
  default_due_days = EXCLUDED.default_due_days,
  updated_at = NOW();

WITH project_progress AS (
  SELECT
    p.id AS project_id,
    costing.status AS costing_status,
    costing.completed_at AS costing_completed_at,
    next_started.activated_at AS next_started_activated_at
  FROM projects AS p
  JOIN stages AS costing
    ON costing.project_id = p.id
   AND costing.stage_key = 'costing_sop_logged'
  LEFT JOIN LATERAL (
    SELECT s.activated_at
    FROM stages AS s
    WHERE s.project_id = p.id
      AND s.sort_order > 15
      AND s.status IN ('active', 'overdue', 'done')
    ORDER BY s.sort_order
    LIMIT 1
  ) AS next_started ON TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM stages AS existing
    WHERE existing.project_id = p.id
      AND existing.stage_key = 'costing_bom_prepared'
  )
)
INSERT INTO stages (
  project_id,
  stage_key,
  phase,
  name,
  responsible_dept,
  status,
  due_date,
  completed_at,
  completed_by,
  sort_order,
  activated_at
)
SELECT
  project_id,
  'costing_bom_prepared',
  'costing',
  'BOM Prepared by R&D',
  'R&D',
  CASE
    WHEN next_started_activated_at IS NOT NULL THEN 'done'
    WHEN costing_status = 'done' THEN 'active'
    ELSE 'pending'
  END,
  CASE
    WHEN next_started_activated_at IS NOT NULL THEN COALESCE(next_started_activated_at::date, CURRENT_DATE) + 2
    WHEN costing_status = 'done' THEN COALESCE(costing_completed_at::date, CURRENT_DATE) + 2
    ELSE NULL
  END,
  CASE
    WHEN next_started_activated_at IS NOT NULL THEN next_started_activated_at
    ELSE NULL
  END,
  NULL,
  15,
  CASE
    WHEN next_started_activated_at IS NOT NULL THEN COALESCE(costing_completed_at, next_started_activated_at)
    WHEN costing_status = 'done' THEN COALESCE(costing_completed_at, NOW())
    ELSE NULL
  END
FROM project_progress;
