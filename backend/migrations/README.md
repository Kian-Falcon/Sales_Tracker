# Supabase Migration Guide

Use this when you are ready to connect the scaffold to a real Supabase project.

## Before Running SQL

1. Create a Supabase project.
2. Gather these values:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `DATABASE_URL`
3. Put the public values in `frontend/.env.local`.
4. Put the backend values in `backend/.env`.

## SQL Order

Run these files in Supabase SQL Editor, top to bottom:

1. `001_profiles.sql`
2. `002_projects.sql`
3. `003_stages.sql`
4. `004_comments.sql`
5. `005_audit_log.sql`
6. `006_rls_policies.sql`
7. `007_profile_sync.sql`
8. `008_stage_activation_tracking.sql`
9. `009_workflow_migration_backups.sql`
10. `010_workflow_stage_settings.sql`
11. `011_audit_actor_context.sql`

## What The Migrations Create

- `profiles` linked to `auth.users`
- `projects`, `stages`, `comments`
- `audit_log` and `notifications_log`
- stage rollback and audit triggers
- profile auto-sync from `auth.users`
- stage activation timestamps and immutable comments
- legacy-workflow backup storage for one-time stage backfills
- admin-editable workflow stage settings with seeded defaults
- RLS policies for authenticated reads and service-role writes

## After Running Migrations

1. Create your first Supabase Auth user.
2. Set `user_metadata.department` to `Admin`.
3. Add department users for Sales, R&D, Production, Procurement, QC, and Dispatch.
4. Start backend and frontend locally.
5. If you created projects before the real 24-stage workflow was added, run `python scripts/migrate_legacy_workflow.py --apply` from `backend/`.
6. Visit `/settings/workflow` as an Admin user to tune stage ownership and SLA days.

## Current Limitation

The real 24-stage workflow is now encoded in `backend/services/stage_templates.py`, but the default due-day windows are still implementation assumptions. Adjust those windows to match Kian Falcon's operating cadence before production use.
