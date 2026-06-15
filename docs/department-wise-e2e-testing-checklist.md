# Department-Wise End-to-End Testing Checklist

Use this checklist for staging or production smoke testing before go-live. It matches the current 24-stage workflow implemented in `backend/services/stage_templates.py`.

## Test Setup

- [ ] Create one real user for each role: `Admin`, `Sales`, `R&D`, `Production`, `Procurement`, `QC`, `Dispatch`.
- [ ] Confirm each user can log in and has a synced `public.profiles` row.
- [ ] Confirm one Admin can access `/settings/workflow`.
- [ ] Confirm workflow settings are frozen for the test run.
- [ ] Confirm email notifications are configured if overdue-stage testing is included.
- [ ] Use a fresh project so the full workflow can be tested from start to finish.

## Shared Checks For Every Department

- [ ] User can log in and land on the dashboard.
- [ ] User name, email, and department show correctly in the UI.
- [ ] User can open the assigned project.
- [ ] User can view the current active stage and due date.
- [ ] User can add a comment and see timestamp, name, and department.
- [ ] Submitted comments are locked and cannot be edited.
- [ ] User cannot complete stages owned by other departments.
- [ ] User sees status, ETA, pending duration, and audit trail updates after actions.

## Admin Checklist

- [ ] Log in as Admin and verify access to dashboard, project detail, workflow settings, export, and profile actions.
- [ ] Open `/settings/workflow` and verify all 24 stages are listed in the correct order.
- [ ] Change one stage owner and one SLA day, save, and confirm the change persists.
- [ ] Create a fresh test project after the settings change and confirm the new workflow settings apply.
- [ ] Open an existing project and verify Admin can edit a locked due date.
- [ ] Confirm Admin can complete any stage only if the business has approved this behavior; otherwise verify visibility-only access where expected.
- [ ] Verify Admin can export CSV successfully.
- [ ] Verify Admin can trigger the full audit trail for stage completion, due-date change, and comments, then confirm it in Supabase SQL until a dedicated audit UI is added.

## Sales Checklist

### Project Creation

- [ ] Create a new project with client, brand, and required identifying fields.
- [ ] Confirm project appears on the dashboard immediately.
- [ ] Confirm the project seeds the full 24-stage workflow.
- [ ] Confirm the first active stage is `Costing SOP Logged In`.

### Sales-Owned Stages

- [ ] Complete `Costing SOP Logged In`.
- [ ] Complete `Costing Approved by Client`.
- [ ] Complete `Drawing SOP Logged In`.
- [ ] Complete `Drawings Shared with Client`.
- [ ] Complete `Drawings Approved by Client`.
- [ ] Complete `Sample SOP Logged In`.
- [ ] Complete `Sample Revisions Requested`.
- [ ] Complete `Sample Approved by Client`.

### Sales Dashboard Checks

- [ ] Filter by client and confirm only matching records appear.
- [ ] Filter by brand and confirm only matching records appear.
- [ ] Filter by status and department and confirm results update correctly.
- [ ] Turn on overdue-only filtering and confirm only overdue records appear.
- [ ] Verify pagination and row-limit controls work correctly.
- [ ] Verify status and ETA columns update as stages move from active to complete or overdue.

## R&D Checklist

- [ ] Verify R&D cannot create projects unless intentionally allowed.
- [ ] Open the Sales-created test project and confirm the first R&D stage activates only after the preceding Sales stage is completed.
- [ ] Complete `Costing Shared by R&D`.
- [ ] Complete `Costing Revision / Additional Items`.
- [ ] Complete `Drawings Prepared by R&D`.
- [ ] Complete `Drawing Revisions / Additional Items`.
- [ ] Complete `Sample Development Started by R&D`.
- [ ] Complete `Sample Completed by R&D`.
- [ ] Complete `Revised Samples Started by R&D`.
- [ ] Complete `Revised Samples Completed`.
- [ ] Add comments on at least two stages and verify they remain visible and locked.
- [ ] Confirm the next stage activates automatically after each completion.

## Production Checklist

- [ ] Open the test project after `Sample Approved by Client`.
- [ ] Confirm `Order SOP Logged Into Production` becomes active.
- [ ] Complete `Order SOP Logged Into Production`.
- [ ] Complete `BOM Ordered by Production`.
- [ ] Complete `Production Started`.
- [ ] Complete `Production Completed`.
- [ ] Verify each completion advances the workflow correctly.
- [ ] Verify Production cannot complete Procurement, QC, or Dispatch stages unless Admin rights are used.

## Procurement Checklist

- [ ] Confirm `Raw Material Procurement Completed` activates only after `BOM Ordered by Production`.
- [ ] Complete `Raw Material Procurement Completed`.
- [ ] Add a comment with sourcing notes or delays.
- [ ] Confirm the comment is locked after submission.
- [ ] Confirm the next production stage activates automatically.

## QC Checklist

- [ ] Confirm `QC Completed` activates only after `Production Completed`.
- [ ] Complete `QC Completed`.
- [ ] Add a QC comment and confirm timestamp, author, and department are correct.
- [ ] Verify QC cannot change earlier completed stages.

## Dispatch Checklist

- [ ] In the sampling phase, confirm Dispatch can complete `Samples Shared with Client`.
- [ ] In the production phase, confirm Dispatch can complete `Dispatch Completed`.
- [ ] Add comments for shipment/sample handoff and confirm they lock after save.
- [ ] Verify the project shows as fully completed after `Dispatch Completed`.

## Due Date And Overdue Checks

- [ ] Confirm the first due date can be set by Sales, Admin, or the current stage owner.
- [ ] Confirm a non-Admin cannot edit a due date once it has already been set.
- [ ] Confirm Admin can edit an existing due date.
- [ ] Force one active stage into the past and confirm it becomes `overdue`.
- [ ] Confirm overdue-only dashboard filters pick it up.
- [ ] Confirm one overdue email alert is sent to the intended recipients.

## Export And Reporting Checks

- [ ] Export CSV from the dashboard.
- [ ] Confirm the downloaded file contains the expected project rows.
- [ ] Confirm status, department, current stage, ETA, pending duration, and created date are correct in export output.

## Mobile And Responsive Checks

- [ ] Log in on a mobile-width screen.
- [ ] Confirm sign-in and sign-up forms are usable without the desktop hero layout blocking the form.
- [ ] Confirm dashboard filters, pagination, and project rows remain usable on mobile.
- [ ] Confirm project detail page remains usable on mobile.

## Final Cross-Department Signoff

- [ ] Sales can create and monitor projects end to end.
- [ ] Each department can update only its own stages.
- [ ] Comments are immutable after submission.
- [ ] Due-date locking works as intended.
- [ ] Dashboard filters, pagination, slider, status, and ETA work with real data.
- [ ] CSV export works.
- [ ] Overdue stage detection and email notification work.
- [ ] One full project can move from `Costing SOP Logged In` to `Dispatch Completed` without breaking stage order.

## Suggested UAT Test Projects

- `UAT-SALES-001`: Standard happy path through all 24 stages.
- `UAT-REVISION-001`: Includes costing, drawing, and sample revision loops.
- `UAT-OVERDUE-001`: Used only for overdue-date and alert testing.
