# Production Launch Checklist

This runbook turns the original tracker brief into a practical ship-week plan.

## Must Finish Before Production

- [ ] Freeze the workflow configuration in `/settings/workflow` and get final approval on stage owners and SLA days.
- [ ] Decide the backend hosting plan for launch week. Use Render Starter if you want to avoid free-tier cold starts during internal rollout.
- [ ] Set final production environment variables on Render and Vercel.
- [ ] Lock backend CORS to the real production frontend domain only.
- [ ] Apply all SQL migrations to the production Supabase database.
- [ ] Create the real department users in Supabase Auth: `Admin`, `Sales`, `R&D`, `Production`, `Procurement`, `QC`, `Dispatch`.
- [ ] Verify every auth user has a synced row in `public.profiles`.
- [ ] Configure the real Resend sender and real escalation recipients.
- [ ] Enable the scheduler in production with `ENABLE_SCHEDULER=true`.
- [ ] Validate one real overdue-stage email from production end to end.
- [ ] Run the backend regression suite: `cd backend && pytest tests/ -v`.
- [ ] Run the frontend verification suite: `cd frontend && npm run lint && npm run type-check && npm run build`.
- [ ] Run one full cross-department smoke test with a fresh project in production or staging.
- [ ] Run mobile and desktop QA for login, dashboard, project detail, workflow settings, comments, and export.
- [ ] Verify the security checklist items from the brief, especially RLS, service-role secrecy, and POST endpoint rate limiting.

## Can Wait Until After Launch

- True Supabase Realtime subscriptions for comments and stage updates.
- Dedicated audit-history UI for management review.
- Toast notifications and richer loading / empty-state polish.
- File attachments through Supabase Storage.
- WhatsApp or Twilio alerting.
- Client portal / read-only external view.
- Gantt / timeline visualization.
- Admin reopen-stage UI with reason logging.

## Recommended Launch Order

1. Freeze workflow settings and choose the production hosting plan.
2. Set Render, Vercel, Supabase, and Resend production variables.
3. Run production DB migrations and verify profile sync.
4. Create department users and verify role-based access.
5. Deploy backend and frontend to the final production URLs.
6. Run automated checks and confirm production build health.
7. Run the cross-department smoke test and overdue email test.
8. Hold a short go / no-go review with business and engineering.
9. Launch and monitor closely for the first working day.

## Owner Checklist

### Backend / Render Owner

- [ ] Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWKS_URL`, `RESEND_API_KEY`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `DEFAULT_ALERT_RECIPIENTS`, and `ENABLE_SCHEDULER`.
- [ ] Confirm the Render start command matches the brief: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- [ ] Verify `/health`, `/api/v1/projects`, `/api/v1/dashboard/summary`, `/api/v1/projects/export/csv`, and `/api/v1/workflow-settings` on the deployed backend.
- [ ] Run backend tests before deployment and confirm GitHub Actions passes.
- [ ] Validate scheduler execution and Resend delivery logs.
- [ ] Confirm audit log rows are written on stage changes.
- [ ] Implement rate limiting on POST/PATCH endpoints or explicitly accept that risk before go-live.

### Frontend / Vercel Owner

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_API_URL`.
- [ ] Verify login redirects, dashboard loading, project creation, project detail, workflow settings, and CSV export against the production backend.
- [ ] Confirm `npm run lint`, `npm run type-check`, and `npm run build` pass locally and in CI.
- [ ] Confirm responsive behavior on desktop and mobile widths.
- [ ] Verify the dashboard table filters, pagination, rows slider, status, and ETA columns with real data.

### Supabase / Auth / DB Owner

- [ ] Run all migrations on the production database.
- [ ] Confirm RLS is enabled and behaving correctly on `profiles`, `projects`, `stages`, `comments`, and audit-related tables.
- [ ] Create the real department users and set `user_metadata.department` correctly.
- [ ] Confirm `public.profiles` backfill / sync works for all users.
- [ ] Verify project creation, comments, stage completion, and workflow settings all work with real Supabase-authenticated users.
- [ ] Take a database backup or export before go-live.

### QA / Business Owner

- [ ] Approve the final 24-stage workflow order and names.
- [ ] Approve the final SLA days in `/settings/workflow`.
- [ ] Verify Sales can create projects and monitor all active work.
- [ ] Verify each department can only complete its own stages.
- [ ] Verify comments are locked after submission and show the correct author / department.
- [ ] Verify date locking works: Sales or stage owner can set the first due date, only Admin can change an existing one.
- [ ] Verify one overdue escalation email reaches the intended stakeholders.
- [ ] Sign off go / no-go.

## Current Repo Reality

These items are already in place and do not need fresh development before launch:

- The real 24-stage workflow is implemented.
- Dashboard, project detail, comments, export, workflow settings, pagination, and status / ETA columns are built.
- Backend tests cover health plus key workflow rules.
- Frontend lint, type-check, and production build pass.
- CI workflows exist for backend and frontend.

These items are still not doc-complete and should be treated as launch decisions or follow-up work:

- True Realtime updates are not implemented yet.
- Dedicated audit-history UI is not implemented yet.
- POST rate limiting is not implemented yet.
- Final production deployment, CORS restriction, and live scheduler email validation are still operational steps.

## Go / No-Go

Launch only if all of the following are true:

- Login works for every department role.
- A new project seeds the real 24-stage workflow.
- Stage completion advances the next stage correctly.
- Comments, due-date locking, dashboard filters, pagination, and export behave correctly.
- Frontend production build passes.
- Overdue alerts send successfully in production.
- One Admin can edit workflow settings successfully after deployment.

## Rollback Plan

If launch-day issues appear:

1. Pause internal usage and notify teams to stop updating projects.
2. Turn off `ENABLE_SCHEDULER` to stop automatic overdue emails.
3. Roll back the frontend deployment.
4. Roll back the backend deployment.
5. Restore workflow configuration only if a bad settings edit caused the issue.
