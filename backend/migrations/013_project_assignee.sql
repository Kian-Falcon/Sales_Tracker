ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS assigned_person_name TEXT;

UPDATE projects AS p
SET assigned_person_name = COALESCE(
  NULLIF(owner.full_name, ''),
  NULLIF(owner.email, ''),
  'Unassigned'
)
FROM public.profiles AS owner
WHERE p.created_by = owner.id
  AND (p.assigned_person_name IS NULL OR NULLIF(p.assigned_person_name, '') IS NULL);

UPDATE projects
SET assigned_person_name = 'Unassigned'
WHERE assigned_person_name IS NULL OR NULLIF(assigned_person_name, '') IS NULL;

ALTER TABLE projects
  ALTER COLUMN assigned_person_name SET NOT NULL;
