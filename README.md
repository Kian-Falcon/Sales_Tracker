# Kian Falcon Workflow Tracker

Scaffolded from the June 2026 "Workflow Tracker Architecture & Build Document".

## Repo Layout

- `backend/`: FastAPI API, auth dependency, scheduler, SQL migrations, and tests.
- `frontend/`: Next.js 14 App Router scaffold with Tailwind, Supabase helpers, and core pages/components.
- `.github/workflows/`: Split CI for backend and frontend.

## What Is Included

- Monorepo structure that matches the brief.
- FastAPI skeleton with routes for projects, stages, comments, export, and dashboard summary.
- PostgreSQL migration files for profiles, projects, stages, comments, audit log, RLS policies, and auth-to-profile sync.
- Next.js pages for login, dashboard, project creation, and project detail.
- Typed API helpers and React Query hooks.

### Due dates & overdue detection

Each stage template carries a `default_due_days` window. The active stage is given a `due_date` on project creation, and every following stage is dated when it becomes active (on stage completion). Sales/Admin or the owning department can set the first date, but once a date is scheduled only `Admin` can change it via `PATCH /api/v1/stages/{id}/due-date` or the date control on the project detail page. The APScheduler job that flips past-due stages to `overdue` and emails alerts only runs when `ENABLE_SCHEDULER=true` (left `false` for local dev in `.env.example`).

### Workflow settings

Admins can tune per-stage responsible departments and default SLA days from `/settings/workflow`. Those settings are stored in the database, used for new project creation, and consulted again when future stages activate.

## Important Assumptions

The brief leaves three implementation gaps, so this scaffold makes the following temporary choices:

1. The clarified business workflow is now encoded as 24 real stages in `backend/services/stage_templates.py`, but the default due-day windows are still operational assumptions that should be tuned with the team.
2. `notifications_log` is referenced by the scheduler flow, but no schema is provided. The scaffold adds that table in `backend/migrations/005_audit_log.sql`.
3. The schema only allows phases `costing`, `drawing`, `sampling`, and `production`, while the overview also mentions QC and Dispatch. The scaffold keeps QC and Dispatch as responsible departments within those four phases until the taxonomy is confirmed.
4. The brief never provisions `public.profiles` rows for Supabase Auth users, but `projects.created_by` references `profiles(id)`. `backend/migrations/007_profile_sync.sql` adds an `auth.users` trigger (plus a backfill) that creates/syncs a profile from `user_metadata` so project creation does not fail on the foreign key. A missing/invalid `department` in metadata falls back to `Sales`.

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload --port 8000
```

If you previously created the backend virtualenv with older dependency pins, recreate it after pulling the updated `requirements.txt`.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

The frontend accepts either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Production Launch

See [docs/production-launch-checklist.md](docs/production-launch-checklist.md) for the ship-week plan covering blockers before go-live, owner-based checklists, smoke tests, scheduler validation, and rollback.

## Suggested Next Steps

1. Tune the workflow settings in `/settings/workflow` with the real department owners and SLA days.
2. Test the full stage flow with real Admin, Sales, R&D, Production, Procurement, QC, and Dispatch users.
3. Fill in env vars for Supabase, Render, and Resend.
4. Expand end-to-end tests and enable the scheduler/notification flow against live data.
